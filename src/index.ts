import { ActivityType, Collection, Events, GuildMember, IntentsBitField } from 'discord.js';
import '@/logger';
import logger from 'winston';
import { getVoiceConnection } from '@discordjs/voice';

import { JukeboxClient } from '@/structs/client';

const client = new JukeboxClient({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.MessageContent
    ]
});

async function bootstrap() {
    client.once(Events.ClientReady, async c => {
        await client.utils.registerCommands();
        await c.application.fetch();
        c.user.setPresence({
            activities: [
                {
                    name: 'music',
                    type: ActivityType.Playing
                }
            ]
        });
        logger.info(`Logged in as ${c.user.tag}!`);
    });

    const timeouts = new Collection<string, NodeJS.Timeout>();
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        const activeMemberFilter = (m: GuildMember) => !m.user.bot && !m.voice.selfDeaf && !m.voice.deaf;
        const channel = oldState.channel ?? newState.channel;
        const activeMembers = channel?.members?.filter(activeMemberFilter);

        logger.debug(`Active members: ${activeMembers?.size}`);
        logger.debug(`bot in channel: ${channel?.members?.has(client.user!.id)}`);

        if (
            activeMembers?.size === 0 &&
            channel?.members?.has(client.user!.id) &&
            getVoiceConnection(channel.guild.id) !== undefined
        ) {
            logger.debug('No active members, disconnecting in 5 minutes');

            if (timeouts.has(channel.guild.id)) {
                clearTimeout(timeouts.get(channel.guild.id)!);
            }
            timeouts.set(
                channel.guild.id,
                setTimeout(() => {
                    const activeMembers = channel?.members?.filter(activeMemberFilter);

                    if (activeMembers?.size === 0) {
                        getVoiceConnection(channel.guild.id)?.disconnect();
                    }
                }, 300_000)
            );
        } else {
            if (!channel) return;
            if (!timeouts.has(channel.guild.id)) return;

            logger.debug('Clearing timeout');
            clearTimeout(timeouts.get(channel.guild.id)!);
            timeouts.delete(channel.guild.id);
        }
    });
    await client.login();
}

bootstrap().catch(err => {
    logger.error(err);
    process.exit(1);
});

process.on('uncaughtException', err => {
    if (err instanceof Error) {
        logger.error(err.stack || err);
    } else {
        logger.error(err);
    }
});
process.on('unhandledRejection', err => {
    if (err instanceof Error) {
        logger.error(err.stack || err);
    } else {
        logger.error(err);
    }
});
