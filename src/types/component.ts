/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnySelectMenuInteraction, ButtonInteraction } from 'discord.js';

export type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;

export type ComponentExecutor = (interaction: ComponentInteraction) => Promise<void>;

export type ComponentCollector = {
    [K: string]: ComponentExecutor;
};
