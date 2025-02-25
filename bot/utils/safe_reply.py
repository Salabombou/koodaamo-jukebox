import discord
from discord import Poll
from discord.ext import commands
from typing import Optional, Union
from discord.embeds import Embed
from discord.file import File
from discord.ui import View


async def safe_reply(
    ctx: commands.Context,
    content: Optional[str] = None,
    *,
    embeds: Optional[list[Embed]] = None,
    files: Optional[list[File]] = None,
    stickers: Optional[list[Union[discord.GuildSticker, discord.StickerItem]]] = None,
    poll: Optional[Poll] = None,
    delete_after: Optional[float] = None,
    mention_author: bool = False,
    view: Optional[View] = None,
    suppress_embeds: bool = False,
) -> None:
    """
    Try to reply to the message. If it fails (e.g., message deleted), send to the channel instead.
    """
    try:
        await ctx.reply(
            content=content,
            embeds=embeds,
            files=files,
            stickers=stickers,
            delete_after=delete_after,
            poll=poll,
            view=view,
            mention_author=mention_author,
            suppress=suppress_embeds,
            allowed_mentions=None,
        )
    except (discord.NotFound, AttributeError):
        await ctx.send(
            content=content,
            embeds=embeds,
            files=files,
            stickers=stickers,
            delete_after=delete_after,
            poll=poll,
            view=view,
            mention_author=mention_author,
            suppress=suppress_embeds,
            allowed_mentions=None,
        )
