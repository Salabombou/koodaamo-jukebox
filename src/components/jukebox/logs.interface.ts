import { GuildMember } from 'discord.js';

import { JukeboxLogsInterfaceComponents } from '@/enums/components/jukebox.logs.interface';
import { ComponentCollector } from '@/types/component';
import { JukeboxPlayer } from '@/structs/jukebox';
import { JukeboxLogsInterfaceComponentUtils } from '@/utils/jukebox';

const utils = JukeboxLogsInterfaceComponentUtils;

export default {
    [JukeboxLogsInterfaceComponents.Refresh]: async function (interaction) {
        const player = await JukeboxPlayer.from(interaction.member as GuildMember, { everyone: true });
        await interaction.editReply(utils.createLogsInterface(player));
    }
} as ComponentCollector;
