import { AudioPlayerStatus } from '@discordjs/voice';
import {
    APIStringSelectComponent,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Interaction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';

import { RemoveButton } from './components';

import { JukeboxQueueInterfaceComponents } from '@/enums/components/jukebox.queue.interface';
import { JukeboxVolumeInterfaceComponents } from '@/enums/components/jukebox.volume.interface';
import { JukeboxClient } from '@/structs/client';
import { JukeboxPlayer, JukeboxTrack, JukeboxQueue } from '@/structs/jukebox';
import { JukeboxLogsInterfaceComponents } from '@/enums/components/jukebox.logs.interface';

export const JukeboxQueueInterfaceComponentUtils = {
    tracksPerPage: 10,
    pageAmount(queue: JukeboxQueue) {
        return Math.max(Math.ceil((queue.length - 1) / JukeboxQueueInterfaceComponentUtils.tracksPerPage), 1);
    },
    parsePage(interaction: Interaction) {
        if (interaction.isChatInputCommand()) {
            return 0;
        } else if (interaction.isMessageComponent()) {
            const selectMenuData = interaction.message.components[0].components[0].toJSON() as APIStringSelectComponent;
            const menuDefault = selectMenuData.options.find(option => option.default);
            const page = menuDefault?.value;

            return parseInt(page ?? '0');
        } else {
            throw new Error('Invalid interaction type');
        }
    },
    interfaceEmbed(player: JukeboxPlayer, page: number) {
        const embedDescription = () => {
            const pageStart = JukeboxQueueInterfaceComponentUtils.tracksPerPage * page + 1;
            const pageEnd = pageStart + JukeboxQueueInterfaceComponentUtils.tracksPerPage;
            const pageTracks = player.queue.slice(pageStart, pageEnd).map(track => track.title);

            const description = pageTracks
                .map((track, index) => {
                    const playlistDigitLength = player.queue.length.toString().length;
                    const paddedIndex = (pageStart + index).toString().padStart(playlistDigitLength, '0');

                    return `**\`\`${paddedIndex}\`\`**: ${track.trim()}`;
                })
                .reverse()
                .join('\n');

            return description || '\u200B';
        };
        const embedCurrentTrackField = () => {
            return {
                name: 'Currently playing:',
                value: `\`\`\`${player.queue[0]?.title ?? '\u200B'}\`\`\``
            };
        };
        const embedFooter = () => {
            const pageAmount = JukeboxQueueInterfaceComponentUtils.pageAmount(player.queue);
            const lastPage = pageAmount === 0 ? 1 : pageAmount;

            return {
                text: `Page ${page + 1}/${lastPage} | Tracks in total: ${player.queue.length}`
            };
        };

        return player.client.utils
            .defaultEmbed()
            .setTitle('Jukebox Queue Interface')
            .setDescription(embedDescription())
            .addFields(embedCurrentTrackField())
            .setFooter(embedFooter());
    },
    interfaceComponents(player: JukeboxPlayer, page: number) {
        const pageSelectRowComponent = () => {
            const maxOptions = 25;
            const maxOptionsHalf = 12;

            let pageStartIndex = Math.max(0, page - maxOptionsHalf);

            const pageEndIndex = pageStartIndex + maxOptions - 1;
            const pagesToShift = pageAmount - pageEndIndex - 1;

            if (pagesToShift < 0) pageStartIndex += pagesToShift;
            if (pageAmount <= maxOptions) pageStartIndex = 0;

            const optionLength = Math.min(25, pageAmount === 0 ? 1 : pageAmount);
            const selectOptions = Array.from({
                length: optionLength
            }).map((_, index) => {
                const pageIndex = pageStartIndex + index;
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(`Page ${pageIndex + 1}`)
                    .setValue(pageIndex.toString());

                if (pageIndex === page) {
                    option.setDefault(true);
                }

                return option;
            });
            const pageSelect = new StringSelectMenuBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PageSelect)
                .setPlaceholder('Select page...')
                .setOptions(selectOptions);

            return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pageSelect);
        };
        const pageControlRowComponent = () => {
            const playlistEmpty = pageAmount === 0;
            const firstPage = page === 0;
            const lastPage = playlistEmpty ? true : pageAmount === page + 1;
            const firstPageButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PageFirst)
                .setLabel('First Page')
                .setEmoji('⏪')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(firstPage);
            const backwardButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PageBackward)
                .setLabel('Previous Page')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(firstPage);
            const lastPageButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PageLast)
                .setLabel('Last Page')
                .setEmoji('⏩')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(lastPage);
            const forwardButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PageForward)
                .setLabel('Next Page')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(lastPage);

            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                firstPageButton,
                backwardButton,
                forwardButton,
                lastPageButton
            );
        };
        const trackControlRowComponent = () => {
            const playlistEmpty = pageAmount === 0;
            const skipButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.Skip)
                .setLabel('Skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(playlistEmpty);
            const shuffleButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.Shuffle)
                .setLabel('Shuffle')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(playlistEmpty);
            const refreshButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.Refresh)
                .setLabel('Refresh')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(false);
            const loopButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.Loop)
                .setLabel('Loop')
                .setEmoji('🔁')
                .setStyle(playerLooping ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(playlistEmpty);
            const pauseResumeButton = new ButtonBuilder()
                .setCustomId(JukeboxQueueInterfaceComponents.PauseResume)
                .setLabel(playerPaused ? 'Resume' : 'Pause')
                .setEmoji('⏯️')
                .setStyle(playerPaused ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(playlistEmpty);

            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                skipButton,
                shuffleButton,
                refreshButton,
                loopButton,
                pauseResumeButton
            );
        };
        const pageAmount = JukeboxQueueInterfaceComponentUtils.pageAmount(player.queue);
        const playerPaused = player.state.status === AudioPlayerStatus.Paused;
        const playerLooping = player.looping;
        const pageSelectRow = pageSelectRowComponent();
        const pageControlRow = pageControlRowComponent();
        const trackControlRow = trackControlRowComponent();

        return [
            pageSelectRow,
            pageControlRow,
            trackControlRow,
            new ActionRowBuilder<ButtonBuilder>().addComponents(RemoveButton)
        ];
    },
    createQueueInterface(player: JukeboxPlayer, interaction?: Interaction, page?: number) {
        const pageMaxIndex = JukeboxQueueInterfaceComponentUtils.pageAmount(player.queue) - 1;

        if (page === undefined && interaction) {
            page = JukeboxQueueInterfaceComponentUtils.parsePage(interaction);
        }

        page ??= 0;

        if (page === -1) {
            page = pageMaxIndex;
        } else if (page > pageMaxIndex) {
            page = pageMaxIndex;
        }

        const interfaceEmbed = JukeboxQueueInterfaceComponentUtils.interfaceEmbed(player, page);
        const interfaceComponents = JukeboxQueueInterfaceComponentUtils.interfaceComponents(player, page);

        return {
            embeds: [interfaceEmbed],
            components: interfaceComponents
        };
    }
};

export const JukeboxVolumeInterfaceComponentUtils = {
    interfaceEmbed(player: JukeboxPlayer) {
        const volumeMeter = () => {
            // prettier-ignore
            const volumeBar = [
                ['          ','🟥🟥','          '],
                ['          ','🟧🟧','          '],
                ['          ','🟧🟧','          '],
                ['          ','🟨🟨','          '],
                ['          ','🟨🟨','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
                ['          ','🟩🟩','          '],
            ];
            const maxVolume = 15;
            const volume = Math.round((player.volume?.volume ?? 0) * 10);
            for (let i = 0; i < maxVolume - volume; i++) {
                volumeBar[i][1] = '     ';
            }
            return `\`\`\`${volumeBar.map(row => row.join('')).join('\n')}\`\`\``;
        };

        const embed = player.client.utils
            .defaultEmbed()
            .setTitle('Jukebox Volume Interface')
            .setDescription(volumeMeter());
        return embed;
    },
    interfaceComponents(player: JukeboxPlayer) {
        const volume = Math.round((player.volume?.volume ?? 0) * 10);
        const muted = volume === 0;

        const volumeUpButton = new ButtonBuilder()
            .setCustomId(JukeboxVolumeInterfaceComponents.VolumeUp)
            .setLabel('Volume Up')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(volume === 15);
        const volumeDownButton = new ButtonBuilder()
            .setCustomId(JukeboxVolumeInterfaceComponents.VolumeDown)
            .setLabel('Volume Down')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(muted);
        const volumeResetButton = new ButtonBuilder()
            .setCustomId(JukeboxVolumeInterfaceComponents.VolumeReset)
            .setLabel('Volume Reset')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary);
        const refreshButton = new ButtonBuilder()
            .setCustomId(JukeboxVolumeInterfaceComponents.Refresh)
            .setLabel('Refresh')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary);
        const muteButton = new ButtonBuilder()
            .setCustomId(JukeboxVolumeInterfaceComponents.Mute)
            .setLabel(`Volume ${muted ? 'Unmute' : 'Mute'}`)
            .setEmoji(muted ? '🔇' : '🔈')
            .setStyle(ButtonStyle.Secondary);

        const volumeInterfaceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            volumeUpButton,
            volumeDownButton,
            refreshButton,
            volumeResetButton,
            muteButton
        );

        return volumeInterfaceRow;
    },
    createVolumeInterface(player: JukeboxPlayer) {
        return {
            embeds: [JukeboxVolumeInterfaceComponentUtils.interfaceEmbed(player)],
            components: [
                JukeboxVolumeInterfaceComponentUtils.interfaceComponents(player),
                new ActionRowBuilder<ButtonBuilder>().addComponents(RemoveButton)
            ]
        };
    }
};

export const JukeboxLogsInterfaceComponentUtils = {
    createLogsInterface(player: JukeboxPlayer) {
        const logs = `\`\`\`ini\n${player.logs.join('\n')}\`\`\``;
        const embed = player.client.utils.defaultEmbed().setTitle('Jukebox Logs Interface').setDescription(logs);

        const refreshButton = new ButtonBuilder()
            .setCustomId(JukeboxLogsInterfaceComponents.Refresh)
            .setLabel('Refresh')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary);

        return {
            embeds: [embed],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton, RemoveButton)]
        };
    }
};

export const JukeboxCommandUtils = {
    createQueueInterface: JukeboxQueueInterfaceComponentUtils.createQueueInterface,
    createVolumeInterface: JukeboxVolumeInterfaceComponentUtils.createVolumeInterface,
    createLogsInterface: JukeboxLogsInterfaceComponentUtils.createLogsInterface,
    trackMessageOptions(track: JukeboxTrack) {
        const client = JukeboxClient.getInstance();
        const trackEmbed = client.utils
            .defaultEmbed()
            .setTitle(track.title)
            .setImage(track.thumbnail)
            .setFooter({
                text: track.channelName
            })
            .setURL(`https://www.youtube.com/watch?v=${track.id}`);
        const trackLinkButton = new ButtonBuilder()
            .setLabel('Source')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.youtube.com/watch?v=${track.id}`);
        const sourceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(trackLinkButton);

        return {
            embeds: [trackEmbed],
            components: [sourceRow]
        };
    }
};
