import { GuildMember } from 'discord.js';

import { JukeboxVolumeInterfaceComponents } from '@/enums/components/jukebox.volume.interface';
import { ComponentCollector } from '@/types/component';
import { JukeboxVolumeInterfaceComponentUtils } from '@/utils/jukebox';
import { JukeboxPlayer } from '@/structs/jukebox';

const utils = JukeboxVolumeInterfaceComponentUtils;

export default {
    [JukeboxVolumeInterfaceComponents.VolumeUp]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        if (player.volume !== undefined) {
            player.volume.setVolume(Math.min(player.volume.volume + 0.1, 1.5));
        }
        await interaction.editReply(utils.createVolumeInterface(player));
    },
    [JukeboxVolumeInterfaceComponents.VolumeDown]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        if (player.volume !== undefined) {
            player.volume.setVolume(Math.max(player.volume.volume - 0.1, 0));
        }
        await interaction.editReply(utils.createVolumeInterface(player));
    },
    [JukeboxVolumeInterfaceComponents.Refresh]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await interaction.editReply(utils.createVolumeInterface(player));
    },
    [JukeboxVolumeInterfaceComponents.VolumeReset]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        if (player.volume !== undefined) {
            player.volume.setVolume(1);
        }
        await interaction.editReply(utils.createVolumeInterface(player));
    },
    [JukeboxVolumeInterfaceComponents.Mute]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember);
        if (player.volume !== undefined) {
            if (player.volume.volume !== 0) {
                player.volume.setVolume(0);
            } else {
                player.volume.setVolume(0.1);
            }
        }
        await interaction.editReply(utils.createVolumeInterface(player));
    }
} as ComponentCollector;
