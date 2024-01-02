import { Events, Interaction } from 'discord.js';

import { JukeboxClient } from '@/structs/client';
import { DiscordEvent } from '@/types/event';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isMessageComponent()) return;

        const client = interaction.client as JukeboxClient;

        const componentExecutor = client.components.get(interaction.customId);
        if (!componentExecutor) return;

        if (!interaction.isModalSubmit()) {
            await interaction.deferUpdate();
        }

        let interactionOriginUser = interaction.message.interaction?.user?.id;
        if (interaction.message.reference?.messageId) {
            const replyMessage = await interaction.channel!.messages.fetch(interaction.message.reference.messageId);
            interactionOriginUser = replyMessage.author.id;
        }

        if (interactionOriginUser && interaction.user.id !== interactionOriginUser) {
            await interaction.followUp({
                content: 'You cannot use this button.',
                ephemeral: true
            });
            return;
        }

        try {
            await componentExecutor(interaction);
        } catch (error) {
            const errorEmbed = client.utils.errorEmbed(error);
            interaction.followUp({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
} as DiscordEvent<Interaction>;
