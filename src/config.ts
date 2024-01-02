import { ColorResolvable } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

export default {
    production: process.env.NODE_ENV === 'production',
    development: process.env.NODE_ENV === 'development',
    bot_token: process.env.BOT_TOKEN!,
    prefixes: process.env.BOT_PREFIXES!.split(/ +/).filter(Boolean),
    default_embed_color: (process.env.DEFAULT_EMBED_COLOR || 'Random') as ColorResolvable
};
