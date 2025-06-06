import os
if os.getenv("ENV") != "production":
    import dotenv
    dotenv.load_dotenv(dotenv_path="../.env")

import discord
from discord.ext import commands
import os
from utils.logger import logger

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


TOKEN = os.getenv("DISCORD_BOT_TOKEN")
if TOKEN is None:
    raise ValueError("DISCORD_BOT_TOKEN is not set")


bot.run(TOKEN)
