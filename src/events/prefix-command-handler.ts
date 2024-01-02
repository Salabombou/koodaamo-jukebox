import { Collection, Events, Message } from 'discord.js';

import { JukeboxClient } from '@/structs/client';
import { DiscordEvent } from '@/types/event';

const cooldown = new Collection<string, NodeJS.Timeout>();

export default {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.channel.isDMBased()) return;
        if (message.author.bot) return;

        const client = message.client as JukeboxClient;
        if (client.config.prefixes.length < 1) return;

        const prefix = client.config.prefixes.find(prefix => message.content.startsWith(prefix));
        if (!prefix) return;

        const [name, ...args] = message.content.slice(prefix.length).trim().split(/ +/);

        const commandExecutor = client.prefixCommands.get(name.trim().toLowerCase());
        if (!commandExecutor) return;

        if (cooldown.has(message.guildId!)) {
            cooldown.get(message.guildId!)?.refresh();
            await message.react('⏳').catch(() => {});
            setTimeout(() => message.delete().catch(() => {}), 3000);
            return;
        } else {
            cooldown.set(
                message.guildId!,
                setTimeout(() => cooldown.delete(message.guildId!), 3000)
            );
        }

        await message.channel.sendTyping();

        try {
            await commandExecutor(message, ...args);
        } catch (error) {
            client.utils.safeReply(message, {
                embeds: [client.utils.errorEmbed(error)],
                allowedMentions: {
                    repliedUser: false
                }
            });
        }
    }
} as DiscordEvent<Message>;
