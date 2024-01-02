import { GlobalComponents } from '@/enums/components/global';
import { ComponentCollector } from '@/types/component';

export default {
    [GlobalComponents.Remove]: async function (interaction) {
        if ((interaction.deferred || interaction.replied) && !interaction.ephemeral) {
            interaction.deleteReply();
        } else if (!interaction.deferred) {
            interaction.deferUpdate();
        }

        if (interaction.message.reference?.messageId) {
            interaction.channel!.messages.delete(interaction.message.reference.messageId);
        }
    }
} as ComponentCollector;
