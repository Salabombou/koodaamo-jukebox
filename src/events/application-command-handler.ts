import { Events, Interaction } from 'discord.js';
import logger from 'winston';

import { JukeboxClient } from '@/structs/client';
import { DiscordEvent } from '@/types/event';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;
        if (!interaction.inGuild()) return;

        const client = interaction.client as JukeboxClient;
        const commandName = client.utils.parseCommandName(interaction);
        const commandExecutor = client.applicationCommands.get(commandName);

        if (!commandExecutor) {
            logger.warn(`Command ${commandName} not found!`);
            return;
        }

        try {
            await commandExecutor(interaction);
        } catch (error) {
            const errorEmbed = client.utils.errorEmbed(error as Error);

            if (interaction.deferred) {
                interaction.editReply({
                    embeds: [errorEmbed]
                });
            } else if (interaction.replied) {
                interaction.followUp({
                    embeds: [errorEmbed]
                });
            } else {
                interaction.reply({
                    embeds: [errorEmbed],
                    ephemeral: true
                });
            }
        }
    }
} as DiscordEvent<Interaction>;
