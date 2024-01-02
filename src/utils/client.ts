import fs from 'fs';
import { join } from 'path';

import {
    APIApplicationCommandSubcommandGroupOption,
    APIApplicationCommandSubcommandOption,
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Colors,
    CommandInteraction,
    EmbedBuilder,
    InteractionReplyOptions,
    Message,
    MessageComponentInteraction,
    MessageReplyOptions,
    REST,
    Routes,
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import logger from 'winston';

import { JukeboxClient } from '@/structs/client';
import { ApplicationCommand, ApplicationCommandData, ApplicationCommandExecutor, PrefixCommand } from '@/types/command';
import { DiscordEvent } from '@/types/event';
import { ComponentCollector } from '@/types/component';

export class JukeboxClientUtils {
    private readonly rest: REST;
    private readonly commandsData = [] as ApplicationCommandData[];

    constructor(private readonly client: JukeboxClient) {
        this.rest = new REST().setToken(this.client.config.bot_token!);
    }

    async registerCommands() {
        logger.info('Loading commands...');
        await this.loadCommands();

        logger.info('Loading components...');
        await this.loadComponents();

        logger.info('Loading events...');
        await this.loadEvents();

        const commands = this.commandsData.map(data => data.toJSON());

        logger.info('Registering commands...');
        try {
            await this.rest.put(Routes.applicationCommands(this.client.user!.id), {
                body: commands
            });
            logger.info(`Registered ${commands.length} command(s)!`);
        } catch (error) {
            logger.error(error);
        }
    }

    protected async loadCommands() {
        const applicationCommandsPath = join(__dirname, '..', 'commands_application');
        const prefixCommandsPath = join(__dirname, '..', 'commands_prefix');

        const applicationCommandDirs = fs.readdirSync(applicationCommandsPath);
        const prefixCommandDirs = fs.readdirSync(prefixCommandsPath);

        for (const dir of applicationCommandDirs) {
            const dirPath = join(applicationCommandsPath, dir);
            const commandFiles = fs.readdirSync(dirPath);

            for (const file of commandFiles) {
                const commandFilePath = join(dirPath, file);
                const command = (await import(commandFilePath)).default as ApplicationCommand;

                if (file === 'index.ts' || file === 'index.js') {
                    this.commandsData.push(command.data);
                    logger.info(`Loaded command root ${command.data.name}`);
                }

                for (const subcommand of command.data.options as SlashCommandSubcommandBuilder[]) {
                    const commandKey = `${command.data.name}_${subcommand.name}`;
                    const executor = command[subcommand.name] as ApplicationCommandExecutor;

                    this.client.applicationCommands.set(commandKey, executor);
                    logger.info(`Loaded command /... ${command.data.name} ${subcommand.name}`);
                }

                const executor = command[command.data.name] as ApplicationCommandExecutor | undefined;

                if (executor) {
                    this.client.applicationCommands.set(command.data.name, executor);
                    logger.info(`Loaded command /${command.data.name}`);
                }
            }
        }

        this.commandsData.push(new SlashCommandBuilder().setName('help').setDescription('Get help with commands'));

        this.client.applicationCommands.set('help', async interaction => {
            await this.applicationHelpCommand(interaction);
        });

        for (const dir of prefixCommandDirs) {
            const dirPath = join(prefixCommandsPath, dir);
            const commandFiles = fs.readdirSync(dirPath);

            for (const file of commandFiles) {
                if (file !== 'index.ts' && file !== 'index.js') continue;

                const commandFilePath = join(dirPath, file);

                const commands = (await import(commandFilePath)).default as PrefixCommand;
                for (const { names, execute: executor } of commands) {
                    for (const name of names) {
                        this.client.prefixCommands.set(name, executor);
                    }
                    logger.info(`Loaded prefix command(s) ${names.join(', ')}`);
                }
                break;
            }
        }
    }

    protected async loadComponents() {
        const componentsPath = join(__dirname, '..', 'components');
        const componentDirs = fs.readdirSync(componentsPath);

        for (const dir of componentDirs) {
            const dirPath = join(componentsPath, dir);
            const componentFiles = fs.readdirSync(dirPath);

            for (const file of componentFiles) {
                const componentFilePath = join(dirPath, file);
                const component = (await import(componentFilePath)).default as ComponentCollector;

                for (const [name, executor] of Object.entries(component)) {
                    this.client.components.set(name, executor);
                }
            }
        }
    }

    protected async loadEvents() {
        const eventsPath = join(__dirname, '..', 'events');
        const eventFiles = fs.readdirSync(eventsPath);

        for (const file of eventFiles) {
            const eventFilePath = join(eventsPath, file);
            const event = (await import(eventFilePath).then(event => event.default)) as DiscordEvent<unknown>;

            this.client.on(event.name as string, event.execute);
        }
    }

    parseCommandName(interaction: ChatInputCommandInteraction) {
        const subcommandName = interaction.options.getSubcommand(false);
        const subcommandGroupName = interaction.options.getSubcommandGroup(false);

        if (subcommandGroupName && subcommandName) {
            return `${subcommandGroupName}_${subcommandName}`;
        } else if (subcommandName) {
            return `${interaction.commandName}_${subcommandName}`;
        }

        return interaction.commandName;
    }

    respond(
        interaction: CommandInteraction,
        replyOptions: InteractionReplyOptions & {
            delete_after?: number;
            timeout?: number;
        }
    ) {
        return interaction.reply(replyOptions).then(message => {
            const { delete_after: deleteAfter, timeout } = replyOptions;

            if (deleteAfter !== undefined) {
                setTimeout(() => {
                    message.delete();
                }, deleteAfter);
            }
            if (timeout !== undefined) {
                const collector = message.createMessageComponentCollector({
                    time: timeout
                });
                collector.on('collect', () => {
                    collector.resetTimer();
                });
                collector.on('end', () => {
                    message.delete();
                });
            }

            return message;
        });
    }

    async applicationHelpCommand(
        interaction: ChatInputCommandInteraction | MessageComponentInteraction,
        command?: ApplicationCommandData
    ) {
        if (!command) {
            const commandSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .addOptions(
                        this.commandsData.map(command =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(command.name)
                                .setValue(command.name)
                                .setDescription(command.description)
                        )
                    )
                    .setPlaceholder('Please select a command')
                    .setCustomId('help_select')
            );
            const reply = await interaction.reply({
                components: [commandSelect]
            });
            try {
                const response = await reply.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id,
                    time: 60_000
                });
                if (!response.isStringSelectMenu()) return;
                response.deferUpdate();

                command = this.commandsData.find(command => command.name === response.values[0])!;
            } catch (error) {
                reply.delete().catch(() => {});
                return;
            }
        }

        const embed = this.defaultEmbed().setTitle(`/${command.name}`).setDescription(command.description);

        const options = command.options
            .map(option => option.toJSON())
            .filter(
                option =>
                    option.type === ApplicationCommandOptionType.SubcommandGroup ||
                    option.type === ApplicationCommandOptionType.Subcommand
            ) as (APIApplicationCommandSubcommandGroupOption | APIApplicationCommandSubcommandOption)[];

        embed.setFields(
            options.map(option => ({
                name: option.name,
                value: option.description
            }))
        );

        const allCommands = options.flatMap(option => {
            if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
                return option.options ?? [];
            } else if (option.type === ApplicationCommandOptionType.Subcommand) {
                return [option];
            } else {
                return [];
            }
        });

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .addOptions(
                    ...options.map(option =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(option.name)
                            .setValue(option.name)
                            .setDescription(option.description)
                    )
                )
                .setPlaceholder('Select a command')
                .setCustomId('help_select')
        );
        const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('help_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );

        if (!interaction.replied) await interaction.deferReply();

        const reply = await interaction.editReply({
            embeds: [embed],
            components: options.length > 0 ? [selectMenu, backButton] : [backButton]
        });

        const collector = reply.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === interaction.user.id
        });

        const firstEmbed = embed.toJSON();
        const firstSelectMenu = selectMenu.toJSON();
        let previousSubcommandGroupName: string | undefined;
        collector.on('collect', async i => {
            collector.resetTimer();
            if (i.isButton() && i.customId === 'help_back') {
                previousSubcommandGroupName = undefined;
                backButton.components[0].setDisabled(true);
                await i.update({
                    embeds: [firstEmbed],
                    components: [firstSelectMenu, backButton]
                });
            } else if (i.isStringSelectMenu() && i.customId === 'help_select') {
                const subcommandGroup = options.find(
                    option =>
                        option.name === i.values[0] && option.type === ApplicationCommandOptionType.SubcommandGroup
                );
                const option:
                    | APIApplicationCommandSubcommandGroupOption
                    | APIApplicationCommandSubcommandOption
                    | undefined = subcommandGroup ?? allCommands.find(option => option.name === i.values[0]);
                if (!option) return;
                previousSubcommandGroupName ??= subcommandGroup?.name;

                const subcommandName = option.type === ApplicationCommandOptionType.Subcommand ? option.name : '';
                const title = `/${command!.name} ${previousSubcommandGroupName ?? ''} ${subcommandName}`
                    .replaceAll(/ +/g, ' ')
                    .trim();
                embed.setTitle(title);
                embed.setDescription(option.description);
                embed.setFields(
                    option.options?.map(option => ({
                        name: option.name,
                        value: option.description
                    })) ?? []
                );
                backButton.components[0].setDisabled(false);

                if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
                    const stringSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                        new StringSelectMenuBuilder()
                            .addOptions(
                                option.options?.map(option => ({
                                    label: option.name,
                                    value: option.name,
                                    description: option.description
                                })) ?? []
                            )
                            .setPlaceholder('Select a command')
                            .setCustomId('help_select')
                    );
                    await i.update({
                        embeds: [embed],
                        components: [stringSelect, backButton]
                    });
                } else if (option.type === ApplicationCommandOptionType.Subcommand) {
                    await i.update({
                        embeds: [embed],
                        components: [backButton]
                    });
                }
            }
        });
        collector.on('end', () => {
            reply.delete().catch(() => {});
        });
    }

    safeReply(message: Message, options: MessageReplyOptions & { delete_after?: number; timeout?: number }) {
        return message
            .reply({
                allowedMentions: {
                    repliedUser: false
                },
                ...options
            })
            .catch(() => message.channel.send(options).catch(() => null) as Promise<Message | null>)
            .then(response => {
                if (!response) return;
                const { delete_after: deleteAfter, timeout } = options;

                if (deleteAfter !== undefined) {
                    setTimeout(() => {
                        response.delete().catch(() => {});
                        message.delete().catch(() => {});
                    }, deleteAfter);
                }
                if (timeout !== undefined) {
                    const collector = response.createMessageComponentCollector({
                        time: timeout
                    });
                    collector.on('collect', () => {
                        collector.resetTimer();
                    });
                    collector.on('end', () => {
                        response.delete().catch(() => {});
                        message.delete().catch(() => {});
                    });
                }

                return message;
            });
    }

    defaultEmbed() {
        return new EmbedBuilder().setColor(this.client.config.default_embed_color).setTimestamp(Date.now());
    }

    errorEmbed(error: unknown) {
        const embed = new EmbedBuilder()
            .setTitle('Something went wrong!')
            .setColor(Colors.DarkRed)
            .setTimestamp(Date.now())
            .setFooter({
                text: 'Error',
                iconURL: 'https://media.discordapp.net/emojis/992830317733871636.gif'
            });

        if (error instanceof Error) {
            embed.setDescription(error.message);
            embed.setFooter({
                text: error.name,
                iconURL: 'https://media.discordapp.net/emojis/992830317733871636.gif'
            });
        } else if (typeof error === 'string') {
            embed.setDescription(error);
        } else {
            embed.setDescription(JSON.stringify(error));
        }
        return embed;
    }
}
