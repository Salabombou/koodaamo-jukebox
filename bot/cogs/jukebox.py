import discord
from discord.ext import commands
import os
import asyncio
import json
from urllib.parse import urlparse, parse_qs
import re

import utils.api

from typing import TypedDict, List


class Jukebox(commands.Cog):
    @commands.command()
    async def play(
        self,
        ctx: commands.Context,
        url_or_id: str = "https://music.youtube.com/playlist?list=PLxqk0Y1WNUGpZVR40HTLncFl22lJzNcau",
    ):
        try: 
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.add_to_queue(token, url_or_id)
        except RuntimeError as e:
            await ctx.send(f"Error: {str(e)}")
            return

        await ctx.send(f"Added to queue: {url_or_id}")


    """
    @commands.command()
    async def skip(self, ctx: commands.Context, amount: int = 1): ...

    @commands.command()
    async def pause(self, ctx: commands.Context): ...

    @commands.command()
    async def resume(self, ctx: commands.Context): ...

    @commands.command()
    async def song(self, ctx: commands.Context, index: int): ...
    """


def setup(bot: discord.Bot):
    bot.add_cog(Jukebox(bot))
