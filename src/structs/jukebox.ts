import fs from 'fs';
import { PassThrough, Readable } from 'stream';
import { URL } from 'url';

import {
    AudioPlayer,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus,
    createAudioResource,
    getVoiceConnection,
    joinVoiceChannel
} from '@discordjs/voice';
import { VolumeTransformer } from 'prism-media';
import asyncRetry from 'async-retry';
import { Collection, GuildMember, Message, VoiceChannel } from 'discord.js';
import logger from 'winston';
import { Mutex } from 'async-mutex';
import YTDlpWrap from 'yt-dlp-wrap';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import UserAgent from 'user-agents';
import YouTube, { Video } from 'youtube-sr';

import { JukeboxClient } from '@/structs/client';
import { JukeboxCommandUtils } from '@/utils/jukebox';

export class JukeboxPlayer extends AudioPlayer {
    private static readonly players = new Collection<string, JukeboxPlayer>();

    private playNextMutex = new Mutex();
    private intervalId: NodeJS.Timeout | undefined;
    private nowPlayingMessage: Message | undefined;

    private loggingHandler = (info: { timestamp: string; message: string }, next: () => void) => {
        const formattedMessage = `[${info.timestamp}]: ${info.message}`;

        this.logs.push(formattedMessage);
        if (this.logs.length > 20) {
            this.logs.shift();
        }
        next();
    };

    readonly logger = logger.createLogger({
        level: 'info',
        transports: [
            new logger.transports.Console({
                log: this.loggingHandler
            })
        ],
        format: logger.format.combine(
            logger.format.timestamp({
                format: 'HH:mm:ss'
            }),
            logger.format.splat()
        )
    });
    readonly logs = [] as string[];

    volume: VolumeTransformer | undefined;
    looping = false;

    private get connection() {
        return getVoiceConnection(this.guildId);
    }

    private get channelId() {
        return this.connection?.joinConfig?.channelId ?? undefined;
    }

    private constructor(
        readonly client: JukeboxClient,
        readonly guildId: string,
        readonly queue: JukeboxQueue = new JukeboxQueue(guildId)
    ) {
        super({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        this.connection?.once(VoiceConnectionStatus.Destroyed, () => {
            this.cleanup();
        });
        this.connection?.on(VoiceConnectionStatus.Disconnected, (oldState, newState) => {
            logger.debug(`Disconnected from voice channel ${this.connection?.joinConfig?.channelId}`);
            logger.debug(`Reason: ${newState.reason}`);

            if (newState.reason === VoiceConnectionDisconnectReason.Manual) {
                this.cleanup();
                return;
            }
            this.connection?.rejoinAttempts;

            let joined: boolean | undefined;

            do {
                joined = this.connection?.rejoin();
                if (joined === undefined) {
                    break;
                }
            } while (!joined && this.connection!.rejoinAttempts < 5);

            if (!joined) {
                this.cleanup();
            }
        });
        this.connection?.on(VoiceConnectionStatus.Connecting, async () => {
            try {
                await this.nowPlayingMessage?.delete();
            } finally {
                this.nowPlayingMessage = undefined;
            }
        });
        this.connection?.subscribe(this);

        let queueLength = 0;
        const songPlayingHandler = () => {
            if (this.playNextMutex.isLocked()) return;
            if (this.state.status !== AudioPlayerStatus.Idle) return;
            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Ready) return;

            const firstPlay = queueLength === 0 && this.queue.length > 0;

            if (!this.looping && !firstPlay) this.queue.shift();
            queueLength = this.queue.length;

            this.play();
        };

        this.on(AudioPlayerStatus.Idle, songPlayingHandler);
        this.intervalId = setInterval(songPlayingHandler, 1000);

        this.on(AudioPlayerStatus.Playing, async () => {
            const channelId = this.connection?.joinConfig?.channelId;
            if (!channelId) return;

            const track = this.queue.at(0);
            if (!track) return;

            const options = JukeboxCommandUtils.trackMessageOptions(track);

            try {
                await this.nowPlayingMessage?.fetch(true);
            } catch {
                this.nowPlayingMessage = undefined;
            }

            if (!this.nowPlayingMessage && channelId) {
                const channel = (await this.client.channels.fetch(channelId)) as VoiceChannel | null;
                this.nowPlayingMessage = await channel?.send({
                    ...options,
                    content: 'Now playing:'
                });
            } else if (this.nowPlayingMessage) {
                this.nowPlayingMessage.edit(options);
            }
        });

        this.deleteTempSongs();
    }

    cleanup() {
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
        }
        JukeboxPlayer.players.delete(this.guildId);
        this.nowPlayingMessage?.delete()?.catch(() => {});
        clearInterval(this.intervalId!);
    }

    async leave(permanent = false) {
        this.connection?.disconnect();
        if (this.channelId) {
            const channel = this.client.channels.cache.get(this.channelId) as VoiceChannel;
            const bot = channel.members.get(this.client.user!.id);
            if (bot) {
                await bot.voice.disconnect();
            }
        }
        if (permanent) {
            this.cleanup();
        }
    }

    stop(force?: boolean) {
        this.deleteTempSongs();
        if (this.looping) this.queue.shift();

        return super.stop(force);
    }

    skip(amount = 1, callback?: () => void) {
        const cleanup = () => {
            this.off(AudioPlayerStatus.Playing, eventHandler);
            this.off(AudioPlayerStatus.Idle, eventHandler);
        };
        const eventHandler = () => {
            callback!();
            cleanup();
        };
        const removedTracks = this.queue.remove(0, amount - 1);

        this.stop();

        if (this.state.status === AudioPlayerStatus.Paused) {
            this.unpause();
        }
        if (callback) {
            this.once(AudioPlayerStatus.Playing, eventHandler);
            this.once(AudioPlayerStatus.Idle, eventHandler);

            setTimeout(() => {
                cleanup();
            }, 10_000);

            if (this.queue.length === 0) {
                eventHandler();
            }
        }

        return removedTracks.length + 1;
    }

    static async from(member: GuildMember, { force, everyone }: { force?: boolean; everyone?: boolean } = {}) {
        const userChannel = member.voice.channel;

        if (!userChannel && !everyone) throw new Error('You must be in the voice channel to use this command.');

        await userChannel?.fetch(true);

        const connectedClient = userChannel?.members?.get(member.client.user!.id);
        let player = this.players.get(member.guild.id);

        const playerStatus = player?.connection?.state?.status;
        if (playerStatus === VoiceConnectionStatus.Connecting || playerStatus === VoiceConnectionStatus.Ready) {
            return player!;
        }

        if (connectedClient && !player) {
            await connectedClient.voice.disconnect();
        } else if (!connectedClient && player && !everyone) {
            throw new Error('User is not in the same voice channel as the bot');
        }

        if (!force || !userChannel)
            throw new Error('Jukebox must be connected to the voice channel to use this command.');

        const client = member.client as JukeboxClient;

        joinVoiceChannel({
            channelId: userChannel.id,
            guildId: member.guild.id,
            adapterCreator: member.guild!.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        player = new this(client, member.guild.id, player?.queue);
        this.players.set(member.guild.id, player);

        return player;
    }

    private deleteTempSongs({ except }: { except?: string } = {}) {
        if (except) {
            except = except.replace('/tmp/', '');
        }
        fs.readdir('/tmp', (err, files) => {
            if (err) return;

            files = files.filter(file => file.startsWith('track') && file.endsWith(this.guildId) && file !== except);
            for (const file of files) {
                fs.unlink(`/tmp/${file}`, err => {
                    if (err) {
                        logger.error(err);
                    } else {
                        logger.verbose(`Deleted ${file}`);
                    }
                });
            }
        });
    }

    private async playNext() {
        const track = this.queue.at(0);

        if (!track) return;

        const filePath = `/tmp/track_${track.id}_${this.guildId}`;
        let stream: Readable | undefined;

        try {
            await fs.promises.access(filePath);
        } catch (error) {
            stream = await track.stream();
        }

        if (stream) {
            if (track.duration > 30 * 60) {
                logger.debug(`Skipping downloading of [${track.title}] due to large size`);
            } else {
                logger.debug(`Downloading [${track.title}] to ${filePath}`);
                const writeStream = fs.createWriteStream(filePath);

                stream.pipe(writeStream);
                stream.once('error', err => {
                    writeStream.close();
                    if ('code' in err && err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                        return;
                    }
                    this.deleteTempSongs();
                });
            }
        }

        this.deleteTempSongs({
            except: filePath
        });

        stream ??= fs.createReadStream(filePath);

        const resource = createAudioResource(stream, {
            inputType: StreamType.WebmOpus,
            silencePaddingFrames: this.looping ? 0 : 5,
            inlineVolume: true
        });

        resource.volume?.setVolume(this.volume?.volume ?? 1);

        super.play(resource);
        this.volume = resource.volume;
    }

    replay() {
        if (this.queue.length === 0) return;

        this.queue.unshift(this.queue.at(0)!);
        this.deleteTempSongs();
        this.skip();
    }

    async play() {
        if (this.state.status === AudioPlayerStatus.Playing) {
            return;
        }

        const release = await this.playNextMutex.acquire();

        try {
            await asyncRetry(() => this.playNext(), { retries: 5 });
        } catch (error) {
            logger.error(error);
        } finally {
            release();
        }
    }
}

export class JukeboxQueue extends Array<JukeboxTrack> {
    constructor(readonly guildId: string) {
        super();
    }

    add(tracks: JukeboxTrack[] | JukeboxTrack, toBeginning = false) {
        if (!Array.isArray(tracks)) {
            tracks = [tracks];
        }
        if (toBeginning) {
            return super.splice(1, 0, ...tracks);
        } else {
            return super.push(...tracks);
        }
    }

    remove(index = 0, amount = 1) {
        return super.splice(index, amount);
    }

    clear() {
        this.length = 1;
    }

    move(index: number, newIndex: number) {
        const track = this.at(index);

        if (!track) return;

        this.remove(index);
        super.splice(newIndex, 0, track);
    }

    copy(index: number, toIndex: number) {
        const track = this.at(index);

        if (!track) return;

        super.splice(toIndex, 0, track);
    }

    shuffle() {
        const currentTrack = this.at(0);
        this.remove(0);
        for (let i = this.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this[i], this[j]] = [this[j], this[i]];
        }
        if (currentTrack) this.unshift(currentTrack);
    }
}

export class JukeboxTrack {
    private constructor(
        readonly channelName: string,
        readonly title: string,
        readonly id: string,
        readonly thumbnail: string,
        readonly duration: number
    ) {}

    async stream() {
        const pass = new PassThrough();
        const ytDlp = new YTDlpWrap('/usr/bin/yt-dlp');
        const userAgent = new UserAgent({
            deviceCategory: 'mobile'
        }).toString();

        const url = `https://www.youtube.com/watch?v=${this.id}`;

        // prettier-ignore
        const downloadUrl = await ytDlp.execPromise([
            url,
            '-f', '251/250/249/600/234/233', // webm opus & mp4 m3u8 audio only
            '--get-url',
        ]);

        // testing the user agent
        await axios.head(downloadUrl, {
            headers: {
                'user-agent': userAgent
            }
        });

        // prettier-ignore
        const command = ffmpeg()
            .addInput(downloadUrl)
            .inputOptions([
                '-user_agent', userAgent,
                '-multiple_requests', '1',
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '4294', // ~4 seconds
                '-timeout', '5000000', // 5 seconds
            ])
            .audioCodec('libopus')
            .toFormat('webm');

        command.on('error', err => {
            if (err.message === 'Output stream error: Premature close') {
                return;
            }

            logger.error(`FFmpeg error while streaming [${this.title}]`);
            const err_msg = err.message.split(':').at(-1)?.trim();

            if (err_msg) {
                logger.error(err_msg);
            }
            logger.debug(err);
        });

        command.pipe(pass);

        pass.on('error', err => {
            if (err.message === 'Premature close') {
                return;
            }
            const err_msg = `Error streaming [${this.title}]`;

            logger.error(err_msg);
            logger.error(err);
        });
        pass.once('readable', () => {
            logger.debug(`Started streaming [${this.title}]`);
        });
        pass.once('close', () => {
            logger.debug(`Finished streaming [${this.title}]`);
        });

        return pass as Readable;
    }

    private static parseVideo(video: Video) {
        if (video.duration === 0) {
            video.duration = Infinity;
        }
        if (!video.id || !video.title || !video.channel?.name || !video.thumbnail?.url) {
            throw new Error('Invalid song');
        }

        return new JukeboxTrack(
            video.channel!.name!,
            video.title!,
            video.id!,
            video.thumbnail!.url!,
            video.duration! / 1000
        );
    }

    private static async fromVideo(url: string) {
        const videoInfo = await YouTube.getVideo(url);
        if (videoInfo === null) throw new Error('Invalid song');
        return this.parseVideo(videoInfo);
    }

    private static async fromSearch(query: string) {
        const videoInfo = await YouTube.searchOne(query);
        if (videoInfo === null) throw new Error('Invalid song');
        return this.parseVideo(videoInfo);
    }

    private static async *fromPlaylist(url: string) {
        const playlist = await YouTube.getPlaylist(url);
        let chunk = [...playlist.videos];

        while (chunk.length > 0) {
            const healthyChunk = chunk.filter(video => {
                return video?.id && video?.title && video?.channel?.name && video?.thumbnail?.url && video?.duration;
            });

            yield healthyChunk.map(video => {
                return new JukeboxTrack(
                    video.channel!.name!,
                    video.title!,
                    video.id!,
                    video.thumbnail!.url!,
                    video.duration! / 1000
                );
            });
            chunk = await playlist.next();
        }
    }

    static async *from(query: string): AsyncGenerator<JukeboxTrack | JukeboxTrack[]> {
        let url: URL;
        try {
            url = new URL(query);
        } catch (err) {
            yield this.fromSearch(query);
            return;
        }

        switch (url.hostname) {
            case 'www.youtube.com':
            case 'youtube.com':
            case 'm.youtube.com':
            case 'youtu.be':
                break;
            case 'playlist.koodaamo.dev':
                url = new URL('https://www.youtube.com/playlist?list=PLxqk0Y1WNUGpZVR40HTLncFl22lJzNcau');
                break;
            default:
                throw new Error('Invalid song');
        }

        let videoId: string;
        if (!url.searchParams.has('v')) {
            videoId = url.pathname.split('/').at(-1)!;
        } else {
            videoId = url.searchParams.get('v')!;
        }
        const playlistId = url.searchParams.get('list');

        if (videoId && !playlistId) {
            const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
            if (!videoIdPattern.test(videoId)) throw new Error('Invalid song');

            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            yield this.fromVideo(videoUrl);
        } else if (playlistId) {
            // prettier-ignore
            const playlistIdPattern = /^(PL|PLF|UU|DO|RD|UL|TL|PU|OL|LL|BL|PL|SP|VL)[a-zA-Z0-9_-]{16,32}$/;
            if (!playlistIdPattern.test(playlistId)) throw new Error('Invalid song');

            const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

            yield* this.fromPlaylist(playlistUrl);
        } else {
            throw new Error('Invalid song');
        }
    }
}
