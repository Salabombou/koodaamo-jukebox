import { SlashCommandSubcommandGroupBuilder, GuildMember } from 'discord.js';

import { JukeboxPlayer, JukeboxTrack } from '@/structs/jukebox';
import { ApplicationCommand } from '@/types/command';
import { JukeboxCommandUtils } from '@/utils/jukebox';

const utils = JukeboxCommandUtils;

export const JukeboxQueueSubcommandGroup: ApplicationCommand<SlashCommandSubcommandGroupBuilder> = {
    // prettier-ignore
    data: new SlashCommandSubcommandGroupBuilder()
        .setName('queue')
        .setDescription('Manage the queue of songs to play')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a song to the queue')
                .addStringOption(option =>
                    option
                        .setName('song')
                        .setDescription('The song to add')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('to_beginning')
                        .setDescription('Insert the song(s) to the start of the queue to be played next')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('track')
                .setDescription('Get information about a track')
                .addIntegerOption(option =>
                    option
                        .setName('index')
                        .setDescription('The index of the track to get information about')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('interface')
                .setDescription('Open the interface')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a track from the queue')
                .addIntegerOption(option =>
                    option
                        .setName('index')
                        .setDescription('The index of the track to remove')
                        .setMinValue(1)
                        .setMaxValue(99)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('The amount of tracks to remove')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the queue')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('move')
                .setDescription('Move a track in the queue')
                .addIntegerOption(option =>
                    option
                        .setName('index')
                        .setDescription('The index of the track to move')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('new_index')
                        .setDescription('The new index of the track')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('copy')
                .setDescription('Copy a track in the queue')
                .addIntegerOption(option =>
                    option
                        .setName('index')
                        .setDescription('The index of the track to copy')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('to_index')
                        .setDescription('The new index of the track')
                        .setMinValue(1)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('shuffle')
                .setDescription('Shuffle the queue')
        ),

    async add(interaction) {
        const query = interaction.options.getString('song', true);
        const toBeginning = interaction.options.getBoolean('to_beginning') ?? false;

        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { force: true });

        if (player.queue.length > 20_000) {
            interaction.reply({
                content: `The queue is full. Remove ${player.queue.length - 20_000} tracks to add more.`,
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            content: 'Searching...',
            ephemeral: true
        });

        let addedTotal = 0;
        for await (const chunk of JukeboxTrack.from(query)) {
            player.queue.add(chunk, toBeginning);
            if (Array.isArray(chunk)) {
                addedTotal += chunk.length;
            } else {
                addedTotal += 1;
                await interaction.followUp({
                    content: `Added [${chunk.title}] to the queue.`,
                    ephemeral: true
                });
            }
        }

        if (addedTotal > 1) {
            await interaction.followUp({
                content: `Added [${addedTotal}] tracks to the queue.`,
                ephemeral: true
            });
            player.logger.info(`${interaction.user.tag} added [${addedTotal}] tracks to the queue`);
        } else if (addedTotal === 0) {
            await interaction.followUp({
                content: 'No tracks found.',
                ephemeral: true
            });
        } else {
            player.logger.info(`${interaction.user.tag} added [${player.queue[0]?.id}] to the queue`);
        }
    },
    async track(interaction) {
        const index = interaction.options.getInteger('index') ?? 0;
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const track = player.queue.at(index);

        if (!track) {
            await interaction.reply({
                content: 'No track found at that index.',
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            ...utils.trackMessageOptions(track),
            ephemeral: true
        });
    },

    async interface(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await player.client.utils.respond(interaction, {
            ...utils.createQueueInterface(player),
            timeout: 300_000
        });
    },

    async remove(interaction) {
        const index = interaction.options.getInteger('index') ?? 1;
        const amount = interaction.options.getInteger('amount') ?? 1;

        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        const removedTracks = player.queue.remove(index, amount);

        await interaction.reply({
            content: `Removed [${removedTracks.length}] tracks from the queue.`,
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} removed [${removedTracks.length}] tracks from the queue`);
    },

    async clear(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.queue.clear();

        await interaction.reply({
            content: 'Cleared the queue.',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} cleared the queue`);
    },

    async move(interaction) {
        const index = interaction.options.getInteger('index', true);
        const newIndex = interaction.options.getInteger('new_index', true);

        if (index === 0 || newIndex === 0) {
            await interaction.reply({
                content: 'Index cannot be 0.',
                ephemeral: true
            });
            return;
        }

        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.queue.move(index, newIndex);

        await interaction.reply({
            content: `Moved track from index ${index} to ${newIndex}.`,
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} moved track from index ${index} to ${newIndex}`);
    },

    async copy(interaction) {
        const index = interaction.options.getInteger('index', true);
        const toIndex = interaction.options.getInteger('to_index', true);
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.queue.copy(index, toIndex);

        await interaction.reply({
            content: `Copied track from index ${index} to ${toIndex}.`,
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} copied track from index ${index} to ${toIndex}`);
    },

    async shuffle(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.queue.shuffle();

        await interaction.reply({
            content: 'Shuffled the queue.',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} shuffled the queue`);
    }
};
export default JukeboxQueueSubcommandGroup;
