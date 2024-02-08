import { PrefixCommand } from '@/types/command';
import { JukeboxPlayer, JukeboxTrack } from '@/structs/jukebox';
import { JukeboxCommandUtils } from '@/utils/jukebox';

const utils = JukeboxCommandUtils;

export const JukeboxQueueCommands: PrefixCommand = [
    {
        names: ['play', 'add'],
        description: 'Add songs to the queue',
        async execute(message, query) {
            if (!query) {
                query = 'https://www.youtube.com/playlist?list=PLxqk0Y1WNUGpZVR40HTLncFl22lJzNcau';
            }
            const player = await JukeboxPlayer.from(message.member!, { force: true });

            if (player.queue.length > 20_000) {
                player.client.utils.safeReply(message, {
                    content: `The queue is full. Remove ${player.queue.length - 20_000} tracks to add more.`,
                    delete_after: 5000
                });
                return;
            }

            let addedTotal = 0;
            for await (const chunk of JukeboxTrack.from(query)) {
                player.queue.add(chunk);
                if (Array.isArray(chunk)) {
                    addedTotal += chunk.length;
                } else {
                    addedTotal += 1;
                    player.client.utils.safeReply(message, {
                        content: `Added [${chunk.title}] to the queue.`,
                        delete_after: 5000
                    });
                    player.logger.info(`${message.author.tag} added [${chunk.title}] to the queue`);
                }
            }

            if (addedTotal > 1) {
                player.client.utils.safeReply(message, {
                    content: `Added [${addedTotal}] tracks to the queue.`,
                    delete_after: 5000
                });
                player.logger.info(`${message.author.tag} added [${addedTotal}] tracks to the queue`);
            } else if (addedTotal === 0) {
                player.client.utils.safeReply(message, {
                    content: 'No tracks found.',
                    delete_after: 5000
                });
            }
        }
    },
    {
        names: ['playnext', 'addnext'],
        description: 'Add songs to the front of the queue',
        async execute(message, query) {
            if (!query) {
                throw new Error('No query provided');
            }
            const player = await JukeboxPlayer.from(message.member!, { force: true });

            if (player.queue.length > 20_000) {
                player.client.utils.safeReply(message, {
                    content: `The queue is full. Remove ${player.queue.length - 20_000} tracks to add more.`,
                    delete_after: 5000
                });
                return;
            }

            const tracks = [] as JukeboxTrack[];
            for await (const chunk of JukeboxTrack.from(query)) {
                if (Array.isArray(chunk)) {
                    tracks.push(...chunk);
                } else {
                    tracks.push(chunk);
                    player.client.utils.safeReply(message, {
                        content: `Added [${chunk.title}] to the front of the queue.`,
                        delete_after: 5000
                    });
                    player.logger.info(`${message.author.tag} added [${chunk.title}] to the front of the queue`);
                }
            }
            player.queue.add(tracks, true);

            if (tracks.length > 1) {
                player.client.utils.safeReply(message, {
                    content: `Added [${tracks.length}] tracks to the front of the queue.`,
                    delete_after: 5000
                });
                player.logger.info(`${message.author.tag} added [${tracks.length}] tracks to the front of the queue`);
            } else if (tracks.length === 0) {
                player.client.utils.safeReply(message, {
                    content: 'No tracks found.',
                    delete_after: 5000
                });
            }
        }
    },
    {
        names: ['track', 'song'],
        description: 'Display information about a track in the queue',
        async execute(message, index) {
            const player = await JukeboxPlayer.from(message.member!, { everyone: true });

            const track = player.queue.at(parseInt(index ?? '0') || 0);

            if (!track) {
                player.client.utils.safeReply(message, {
                    content: 'No track found at that index.',
                    delete_after: 5000
                });
                return;
            }

            player.client.utils.safeReply(message, {
                ...utils.trackMessageOptions(track)
            });
        }
    },
    {
        names: ['list', 'queue'],
        description: 'Display the queue interface',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!, { everyone: true });
            player.client.utils.safeReply(message, {
                ...utils.createQueueInterface(player),
                timeout: 300_000
            });
        }
    },
    {
        names: ['remove'],
        description: 'Remove a track from the queue',
        async execute(message, index, amount) {
            if (!index || parseInt(index) < 1 || isNaN(parseInt(index))) {
                index = '1';
            }
            if (!amount || parseInt(amount) < 1 || isNaN(parseInt(amount))) {
                amount = '1';
            }

            const player = await JukeboxPlayer.from(message.member!);

            const removedTracks = player.queue.remove(parseInt(index), parseInt(amount));

            player.client.utils.safeReply(message, {
                content: `Removed [${removedTracks.length}] tracks from the queue.`,
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} removed [${removedTracks.length}] tracks from the queue`);
        }
    },
    {
        names: ['clear'],
        description: 'Clear the queue',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);

            player.queue.clear();

            player.client.utils.safeReply(message, {
                content: 'Cleared the queue.',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} cleared the queue`);
        }
    },
    {
        names: ['move'],
        description: 'Move a track in the queue',
        async execute(message, index, newIndex) {
            if (!index || parseInt(index) < 1 || isNaN(parseInt(index))) {
                index = '1';
            }
            if (!newIndex || parseInt(newIndex) < 1 || isNaN(parseInt(newIndex))) {
                newIndex = '1';
            }

            const player = await JukeboxPlayer.from(message.member!);

            player.queue.move(parseInt(index), parseInt(newIndex));

            player.client.utils.safeReply(message, {
                content: `Moved track from [${index}] to [${newIndex}].`,
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} moved track from [${index}] to [${newIndex}]`);
        }
    },
    {
        names: ['copy'],
        description: 'Copy a track in the queue',
        async execute(message, index, toIndex) {
            if (!index || parseInt(index) < 0 || isNaN(parseInt(index))) {
                index = '0';
            }
            if (!toIndex || parseInt(toIndex) < 1 || isNaN(parseInt(toIndex))) {
                toIndex = '1';
            }

            const player = await JukeboxPlayer.from(message.member!);

            player.queue.copy(parseInt(index), parseInt(toIndex));

            player.client.utils.safeReply(message, {
                content: `Copied track from [${index}] to [${toIndex}].`,
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} copied track from [${index}] to [${toIndex}]`);
        }
    },
    {
        names: ['shuffle'],
        description: 'Shuffle the queue',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);

            player.queue.shuffle();

            player.client.utils.safeReply(message, {
                content: 'Shuffled the queue.',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} shuffled the queue`);
        }
    }
];
