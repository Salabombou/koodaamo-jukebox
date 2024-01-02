/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    ChatInputCommandInteraction,
    Message,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export type ApplicationCommandData =
    | SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;

export type ApplicationCommandExecutor = (interaction: ChatInputCommandInteraction) => Promise<void>;
export type PrefixCommandExecutor = (message: Message, ...args: (string | undefined)[]) => Promise<void>;

export type ApplicationCommand<Data extends ApplicationCommandData = ApplicationCommandData> = {
    data: Data;
} & {
    [K in keyof any]?: ApplicationCommandExecutor | Data;
};

export type PrefixCommandData = {
    names: string[];
    description: string;
    execute: PrefixCommandExecutor;
};

export type PrefixCommand = PrefixCommandData[];
