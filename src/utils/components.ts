import { ButtonBuilder, ButtonStyle } from 'discord.js';

import { GlobalComponents } from '@/enums/components/global';

export const RemoveButton = new ButtonBuilder()
    .setCustomId(GlobalComponents.Remove)
    .setEmoji('🗑️')
    .setStyle(ButtonStyle.Danger);
