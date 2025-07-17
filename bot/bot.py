import os

if os.getenv("ENV") != "production":
    import dotenv

    dotenv.load_dotenv(dotenv_path="../.env")

import discord
from discord.ext import commands
import os
from utils.logger import logger
from utils.api import ApiError
from utils.safe_reply import safe_reply

bot = commands.Bot(
    intents=discord.Intents.all(),
    command_prefix=commands.when_mentioned_or("!"),
    auto_sync_commands=False,  # Syncing won't work with activities enabled
)

cogs_list = ["jukebox"]

for cog in cogs_list:
    bot.load_extension(f"cogs.{cog}")


@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user}")


@bot.event
async def on_command_error(ctx: commands.Context, error):
    # Unwrap the original exception if it's a CommandInvokeError
    original = getattr(error, "original", None)
    if isinstance(error, commands.CommandNotFound):
        return
    if isinstance(original, ApiError):
        embed = discord.Embed(
            title=f"❌ {original.title}",
            description=original.detail or "An error occurred.",
            color=discord.Color.red(),
        )
        await safe_reply(ctx, embeds=[embed])
    else:
        embed = discord.Embed(
            title="❌ Unexpected Error",
            description=str(error),
            color=discord.Color.red(),
        )
        await safe_reply(ctx, embeds=[embed])


TOKEN = os.getenv("DISCORD_BOT_TOKEN")
if TOKEN is None:
    raise ValueError("DISCORD_BOT_TOKEN is not set")


bot.run(TOKEN)
