import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

import { JukeboxPlayerSubcommandGroup } from './jukebox.player';
import { JukeboxQueueSubcommandGroup } from './jukebox.queue';

import { ApplicationCommand } from '@/types/command';

const JukeboxCommand: ApplicationCommand<SlashCommandSubcommandsOnlyBuilder> = {
    // prettier-ignore
    data: new SlashCommandBuilder()
        .setName('jukebox')
        .setDescription('Manage the jukebox.')
        .addSubcommandGroup(JukeboxPlayerSubcommandGroup.data)
        .addSubcommandGroup(JukeboxQueueSubcommandGroup.data)
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Get help with the jukebox')
        )
};

export default JukeboxCommand;
