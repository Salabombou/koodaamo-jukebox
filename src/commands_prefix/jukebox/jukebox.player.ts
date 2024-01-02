import { PrefixCommand } from '@/types/command';
import { JukeboxPlayer } from '@/structs/jukebox';
import { JukeboxCommandUtils } from '@/utils/jukebox';

const utils = JukeboxCommandUtils;

export const JukeboxPlayerCommands: PrefixCommand = [
    {
        names: ['replay'],
        description: 'Replay the current track',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.replay();

            player.client.utils.safeReply(message, {
                content: 'Replaying...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} replayed the current track [${player.queue[0]?.id}]`);
        }
    },
    {
        names: ['pause'],
        description: 'Pause the player',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.pause();

            player.client.utils.safeReply(message, {
                content: 'Pausing...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} paused the player`);
        }
    },
    {
        names: ['resume', 'unpause'],
        description: 'Resume the player',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.unpause();

            player.client.utils.safeReply(message, {
                content: 'Resuming...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} resumed the player`);
        }
    },
    {
        names: ['stop'],
        description: 'Stop the player',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.pause();
            player.stop();

            player.client.utils.safeReply(message, {
                content: 'Stopping...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} stopped the player`);
        }
    },
    {
        names: ['skip'],
        description: 'Skip the current track',
        async execute(message, amount) {
            if (!amount || parseInt(amount) < 1 || isNaN(parseInt(amount))) {
                amount = '1';
            }

            const player = await JukeboxPlayer.from(message.member!);
            player.skip(parseInt(amount));

            player.client.utils.safeReply(message, {
                content: 'Skipping...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} skipped the current track`);
        }
    },
    {
        names: ['join'],
        description: 'Join the voice channel',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!, { force: true });

            player.client.utils.safeReply(message, {
                content: 'Joining...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} added the bot to the voice channel`);
        }
    },
    {
        names: ['leave', 'disconnect'],
        description: 'Leave the voice channel',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.leave();

            player.client.utils.safeReply(message, {
                content: 'Leaving...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} removed the bot from the voice channel`);
        }
    },
    {
        names: ['loop'],
        description: 'Loop the current track',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!);
            player.looping = !player.looping;

            player.client.utils.safeReply(message, {
                content: player.looping ? 'Looping...' : 'Not looping...',
                delete_after: 5000
            });

            player.logger.info(`${message.author.tag} ${player.looping ? 'enabled' : 'disabled'} looping`);
        }
    },
    {
        names: ['volume'],
        description: 'Change the volume',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!, { everyone: true });

            player.client.utils.safeReply(message, {
                ...utils.createVolumeInterface(player),
                timeout: 300_000
            });
        }
    },
    {
        names: ['logs'],
        description: 'View the logs',
        async execute(message) {
            const player = await JukeboxPlayer.from(message.member!, { everyone: true });
            await player.client.utils.safeReply(message, {
                ...utils.createLogsInterface(player),
                timeout: 300_000
            });
        }
    }
];
