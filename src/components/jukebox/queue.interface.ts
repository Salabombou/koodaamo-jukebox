import { AudioPlayerStatus } from '@discordjs/voice';
import { StringSelectMenuInteraction, GuildMember } from 'discord.js';

import { JukeboxQueueInterfaceComponents } from '@/enums/components/jukebox.queue.interface';
import { JukeboxPlayer } from '@/structs/jukebox';
import { ComponentCollector } from '@/types/component';
import { JukeboxQueueInterfaceComponentUtils } from '@/utils/jukebox';

const utils = JukeboxQueueInterfaceComponentUtils;

export default {
    [JukeboxQueueInterfaceComponents.Skip]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        player.skip(1, () => {
            clearTimeout(timeout);
            interaction.editReply(utils.createQueueInterface(player, interaction));
        });

        const timeout = setTimeout(() => {
            interaction.editReply(utils.createQueueInterface(player, interaction));
        }, 10_000);

        player.logger.info(`${interaction.user.tag} skipped the current track`);
    },
    [JukeboxQueueInterfaceComponents.Shuffle]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        player.queue.shuffle();

        await interaction.editReply(utils.createQueueInterface(player, interaction));

        player.logger.info(`${interaction.user.tag} shuffled the queue`);
    },
    [JukeboxQueueInterfaceComponents.Loop]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        player.looping = !player.looping;

        await interaction.editReply(utils.createQueueInterface(player, interaction));

        player.logger.info(`${interaction.user.tag} ${player.looping ? 'enabled' : 'disabled'} looping`);
    },
    [JukeboxQueueInterfaceComponents.PauseResume]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);

        if (player.state.status === AudioPlayerStatus.Paused) {
            player.unpause();
            player.logger.info(`${interaction.user.tag} resumed the player`);
        } else {
            player.pause();
            player.logger.info(`${interaction.user.tag} paused the player`);
        }

        await interaction.editReply(utils.createQueueInterface(player, interaction));
    },
    [JukeboxQueueInterfaceComponents.Refresh]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await interaction.editReply(utils.createQueueInterface(player, interaction));
    },
    [JukeboxQueueInterfaceComponents.PageBackward]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const page = utils.parsePage(interaction) - 1;

        await interaction.editReply(utils.createQueueInterface(player, interaction, page));
    },
    [JukeboxQueueInterfaceComponents.PageForward]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const page = utils.parsePage(interaction) + 1;

        await interaction.editReply(utils.createQueueInterface(player, interaction, page));
    },
    [JukeboxQueueInterfaceComponents.PageFirst]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const page = 0;

        await interaction.editReply(utils.createQueueInterface(player, interaction, page));
    },
    [JukeboxQueueInterfaceComponents.PageLast]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const page = -1;

        await interaction.editReply(utils.createQueueInterface(player, interaction, page));
    },
    [JukeboxQueueInterfaceComponents.PageSelect]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        const page = parseInt((interaction as StringSelectMenuInteraction).values[0]);

        await interaction.editReply(utils.createQueueInterface(player, interaction, page));
    }
} as ComponentCollector;
