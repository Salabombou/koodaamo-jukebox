/* eslint-disable @typescript-eslint/no-explicit-any */
import { Events } from 'discord.js';

export type DiscordEvent<E> = {
    name: Events;
    execute(event: E): Promise<void>;
};
