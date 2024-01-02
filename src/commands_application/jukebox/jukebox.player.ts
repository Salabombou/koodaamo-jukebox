import { SlashCommandSubcommandGroupBuilder, GuildMember } from 'discord.js';

import { JukeboxPlayer } from '@/structs/jukebox';
import { ApplicationCommand } from '@/types/command';
import { JukeboxCommandUtils } from '@/utils/jukebox';

const utils = JukeboxCommandUtils;

export const JukeboxPlayerSubcommandGroup: ApplicationCommand<SlashCommandSubcommandGroupBuilder> = {
    // prettier-ignore
    data: new SlashCommandSubcommandGroupBuilder()
        .setName('player')
        .setDescription('Manage the player')
        .addSubcommand(subcommand =>
            subcommand
                .setName('replay')
                .setDescription('Replay the current track')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('Pause the player')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('Resume the player')        
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop the player')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('skip')
                .setDescription('Skip the current track')
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('The amount of tracks to skip')
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join the voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('move')
                .setDescription('Move the bot to another voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave the voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('loop')
                .setDescription('Toggle looping of the current track')
                .addBooleanOption(option =>
                    option
                        .setName('loop')
                        .setDescription('Whether to loop the current track')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('volume')
                .setDescription('Set the volume of the player')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('View the player logs')
        ),

    async replay(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.replay();

        await interaction.reply({
            content: 'Replaying...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} replayed the current track [${player.queue[0]?.id}]`);
    },

    async pause(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.pause();

        await interaction.reply({
            content: 'Pausing...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} paused the player`);
    },

    async resume(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.unpause();

        await interaction.reply({
            content: 'Resuming...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} resumed the player`);
    },

    async stop(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.pause();
        player.stop();

        await interaction.reply({
            content: 'Stopping...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} stopped the player`);
    },

    async skip(interaction) {
        const amount = interaction.options.getInteger('amount') ?? 1;

        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        player.skip(amount);

        await interaction.reply({
            content: 'Skipping...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} skipped the current track [${player.queue[0]?.id}]`);
    },

    async join(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { force: true });

        await interaction.reply({
            content: 'Joining...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} added the bot to the voice channel`);
    },

    async move(interaction) {
        await interaction.reply({ content: 'WIP', ephemeral: true });
    },

    async leave(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        player.leave();

        await interaction.reply({
            content: 'Leaving...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} removed the bot from the voice channel`);
    },

    async loop(interaction) {
        const loop = interaction.options.getBoolean('loop');
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        if (loop !== null) {
            player.looping = loop;
        } else {
            player.looping = !player.looping;
        }

        await interaction.reply({
            content: player.looping ? 'Looping...' : 'Not looping...',
            ephemeral: true
        });

        player.logger.info(`${interaction.user.tag} ${player.looping ? 'enabled' : 'disabled'} looping`);
    },
    async volume(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await player.client.utils.respond(interaction, { ...utils.createVolumeInterface(player), timeout: 300_000 });
    },
    async logs(interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await player.client.utils.respond(interaction, { ...utils.createLogsInterface(player), timeout: 300_000 });
    }
};

export default JukeboxPlayerSubcommandGroup;
