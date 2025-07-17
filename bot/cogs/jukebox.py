import discord
from discord.ext import commands
from datetime import datetime, timedelta

import utils.api
from utils.config import API_BASE_URL_PROD
from utils.safe_reply import safe_reply

from typing import Optional


class Jukebox(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(description="Show info about the current user")
    @commands.is_owner()
    async def userinfo(self, ctx: commands.Context):
        """Show info about the user who invoked the command"""
        async with ctx.typing():
            users = await utils.api.get_all_users()
            if len(users) == 0:
                await safe_reply(ctx, "❌ No users found in the database!")
                return
            embed = discord.Embed(
                title="Users",
                color=discord.Color.orange(),
            )

            for user in users:
                print(f"User: {user}")
                created_at = int(user["created_at"] // 1000)
                updated_at = int(user["updated_at"] // 1000)
                embed.add_field(
                    name=user["username"],
                    value=
                    f"User ID: {user['user_id']}\n"
                    f"Connection ID: {user['connection_id'] or 'None'}\n"
                    f"Is Embedded: {'Yes' if user['is_embedded'] else 'No'}\n"
                    f"Associated Room Code: {user["associated_room_code"] or 'None'}\n"
                    f"Created At: <t:{created_at}:F>\n"
                    f"Updated At: <t:{updated_at}:F>",
                    inline=False,
                )
            embed.set_footer(text=f"Total users: {len(users)}")
            await safe_reply(ctx, embeds=[embed])
    
    @commands.command(description="Ban a user from the room")
    @commands.is_owner()
    async def ban(self, ctx: commands.Context, user_id: int, reason: Optional[str] = None, until: Optional[int] = None):
        """Ban a user from the room"""
        async with ctx.typing():
            if not reason:
                reason = "No reason provided"
            if not until:
                until = int((datetime.now() + timedelta(hours=1)).timestamp() * 1000)
            await utils.api.ban_user(user_id, until, reason)

            banned_user = await self.bot.fetch_user(user_id)
            await safe_reply(ctx, f"✅ Banned user {banned_user.name} (ID: {user_id}) for: {reason}")
    
    @commands.command(description="Unban a user from the room")
    @commands.is_owner()
    async def unban(self, ctx: commands.Context, user_id: int):
        """Unban a user from the room"""
        async with ctx.typing():
            await utils.api.unban_user(user_id)

            unbanned_user = await self.bot.fetch_user(user_id)
            await safe_reply(ctx, f"✅ Unbanned user {unbanned_user.name} (ID: {user_id})")

    @commands.command(description="Get current room status and queue")
    async def status(self, ctx: commands.Context):
        """Get current room information and queue"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)

            room_info = room_data["room_info"]
            queue_items = room_data["queue_items"]

            embed = discord.Embed(
                title=f"🎵 Room: {room_info['room_code'] if len(room_info['room_code']) == 6 else 'Embedded'}",
                color=discord.Color.blue(),
            )

            # Room status
            queue_text = f"Total tracks: {len(queue_items)}"
            status_text = "⏸️ Paused" if room_info["is_paused"] else "▶️ Playing"
            loop_text = "🔁 Loop: On" if room_info["is_looping"] else "🔁 Loop: Off"
            shuffle_text = (
                "🔀 Shuffle: On" if room_info["is_shuffled"] else "🔀 Shuffle: Off"
            )

            embed.add_field(
                name="Status",
                value=f"{queue_text}\n{status_text}\n{loop_text}\n{shuffle_text}",
                inline=True,
            )

            # Current track
            current_track_id = room_info["current_track"]["id"]
            if type(current_track_id) == str:
                current_track = await utils.api.get_track(token, current_track_id)
                if current_track and "title" in current_track:
                    embed.add_field(
                        name="Current Track",
                        value=f"{current_track['title']}\n{current_track['uploader']}",
                        inline=True,
                    )
                    embed.set_image(
                        url=f"{API_BASE_URL_PROD}/api/track/{current_track_id}/thumbnail-high"
                    )

            await safe_reply(ctx, embeds=[embed])

    @commands.command(description="Pause or unpause playback")
    async def pause(self, ctx: commands.Context):
        """Toggle pause state"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.pause_toggle(token, True)

            status = "⏸️ Paused"
            await safe_reply(ctx, f"{status} playback!")

    @commands.command(description="Resume playback")
    async def resume(self, ctx: commands.Context):
        """Resume playback"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.pause_toggle(token, False)

            status = "▶️ Resumed"
            await safe_reply(ctx, f"{status} playback!")

    @commands.command(description="Toggle loop mode")
    async def loop(self, ctx: commands.Context):
        """Toggle loop state"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)

            # Get current loop state and toggle it
            current_loop_state = room_data["room_info"]["is_looping"]
            new_loop_state = not current_loop_state

            await utils.api.loop_toggle(token, new_loop_state)

            status = "🔁 Enabled" if new_loop_state else "🔁 Disabled"
            await safe_reply(ctx, f"{status} loop mode!")

    @commands.command(description="Toggle shuffle mode")
    async def shuffle(self, ctx: commands.Context):
        """Toggle shuffle state"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)

            # Get current shuffle state and toggle it
            current_shuffle_state = room_data["room_info"]["is_shuffled"]
            new_shuffle_state = not current_shuffle_state

            await utils.api.shuffle_toggle(token, new_shuffle_state)

            status = "🔀 Enabled" if new_shuffle_state else "🔀 Disabled"
            await safe_reply(ctx, f"{status} shuffle mode!")

    @commands.command(description="Seek to a specific time in the current track")
    async def seek(self, ctx: commands.Context, seconds: int):
        """Seek to specific time in seconds"""
        if seconds < 0:
            await safe_reply(ctx, "❌ Seek time must be non-negative!")
            return

        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.seek(token, seconds)

            minutes, secs = divmod(seconds, 60)
            await safe_reply(ctx, f"⏩ Seeked to {minutes}:{secs:02d}!")

    @commands.command(description="Skip forward by amount of tracks (default 1)")
    async def skip(self, ctx: commands.Context, amount: int = 1):
        """Skip forward by amount of tracks from current position"""
        if amount == 0:
            await safe_reply(
                ctx,
                "❌ Amount cannot be 0! Use a positive number to skip forward or negative to skip backward.",
            )
            return

        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)

            current_index = room_data["room_info"]["current_track"]["index"]
            target_index = current_index + amount

            if target_index < 0:
                await safe_reply(ctx, "❌ Cannot skip to a negative index!")
                return

            await utils.api.skip(token, target_index)

            direction = "forward" if amount > 0 else "backward"
            await safe_reply(
                ctx,
                f"⏭️ Skipped {direction} by {abs(amount)} track(s) to index {target_index}!",
            )

    @commands.command(description="Move a track from one position to another")
    async def move(self, ctx: commands.Context, from_index: int, to_index: int):
        """Move track from one position to another"""
        if from_index < 0 or to_index < 0:
            await safe_reply(ctx, "❌ Indices must be non-negative!")
            return

        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.move_track(token, from_index, to_index)

            await safe_reply(
                ctx, f"🔄 Moved track from #{from_index} to #{to_index}!"
            )

    @commands.command(description="Add a track to the queue")
    async def play(
        self,
        ctx: commands.Context,
        *,
        url_or_query: str = "https://music.youtube.com/playlist?list=PLxqk0Y1WNUGpZVR40HTLncFl22lJzNcau",
    ):
        """Add track to queue"""
        # Send a "typing" indicator since this might take a while
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.add_track(token, url_or_query)

            # Truncate long URLs for display
            display_text = url_or_query
            if len(display_text) > 50:
                display_text = display_text[:47] + "..."

            await safe_reply(ctx, f"✅ Added to queue: {display_text}")

    @commands.command(description="Remove a track from the queue by ID")
    async def remove(self, ctx: commands.Context, track_id: int):
        """Remove track by ID"""
        if track_id < 0:
            await safe_reply(ctx, "❌ Track ID must be non-negative!")
            return

        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.remove_track(token, track_id)

            await safe_reply(ctx, f"🗑️ Removed track with ID {track_id}!")

    @commands.command(description="Delete a track from the queue by index")
    async def delete(self, ctx: commands.Context, index: int):
        """Delete track by index"""
        if index < 0:
            await safe_reply(ctx, "❌ Index must be non-negative!")
            return

        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.delete_track(token, index)

            await safe_reply(ctx, f"🗑️ Deleted track at index {index}!")

    @commands.command(description="Show the current queue")
    async def queue(self, ctx: commands.Context, page: int = 1):
        """Show current queue with pagination"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)

            queue_items = room_data["queue_items"]
            room_info = room_data["room_info"]

            if not queue_items:
                await safe_reply(ctx, "📭 Queue is empty!")
                return

            # Pagination
            items_per_page = 10
            total_pages = (len(queue_items) + items_per_page - 1) // items_per_page

            if page < 1 or page > total_pages:
                await safe_reply(
                    ctx, f"❌ Page must be between 1 and {total_pages}!"
                )
                return

            start_idx = (page - 1) * items_per_page
            end_idx = min(start_idx + items_per_page, len(queue_items))
            page_items = queue_items[start_idx:end_idx]

            embed = discord.Embed(
                title=f"🎵 Queue - Page {page}/{total_pages}",
                description=f"Total tracks: {len(queue_items)}",
                color=discord.Color.green(),
            )

            current_index = room_info["current_track"]["index"]

            queue_text = ""
            for item in page_items:
                index = (
                    item["shuffled_index"]
                    if room_info["is_shuffled"]
                    and item["shuffled_index"] is not None
                    else item["index"]
                )
                marker = "▶️" if index == current_index else "🎵"
                queue_text += (
                    f"{marker} **#{index}** - ID: {item['track_id'][:15]}...\n"
                )

            embed.add_field(name="Tracks", value=queue_text, inline=False)

            if total_pages > 1:
                embed.set_footer(
                    text=f"Use {ctx.prefix}queue <page> to see other pages"
                )

            await safe_reply(ctx, embeds=[embed])

    @commands.command(
        description="Show info about a track at an offset from the current track"
    )
    async def track(self, ctx: commands.Context, offset: int = 0):
        """Show info about a track at an offset from the current track index, respecting shuffle state"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            queue_items = room_data["queue_items"]
            room_info = room_data["room_info"]
            is_shuffled = room_info.get("is_shuffled", False)
            current_index = room_info["current_track"]["index"]
            if is_shuffled:
                current_item = next(
                    (
                        item
                        for item in queue_items
                        if item.get("shuffled_index") == current_index
                    ),
                    None,
                )
            else:
                current_item = next(
                    (
                        item
                        for item in queue_items
                        if item["index"] == current_index
                    ),
                    None,
                )
            if not current_item:
                await safe_reply(
                    ctx, f"❌ Could not find the current track in the queue!"
                )
                return
            if is_shuffled:
                target_shuffled_index = current_item["shuffled_index"] + offset
                if target_shuffled_index < 0 or target_shuffled_index >= len(
                    queue_items
                ):
                    await safe_reply(
                        ctx,
                        f"❌ Track index {target_shuffled_index} is out of range!",
                    )
                    return
                track_item = next(
                    (
                        item
                        for item in queue_items
                        if item.get("shuffled_index") == target_shuffled_index
                    ),
                    None,
                )
            else:
                target_index = current_item["index"] + offset
                if target_index < 0 or target_index >= len(queue_items):
                    await safe_reply(
                        ctx, f"❌ Track index {target_index} is out of range!"
                    )
                    return
                track_item = next(
                    (item for item in queue_items if item["index"] == target_index),
                    None,
                )
            if not track_item:
                await safe_reply(ctx, f"❌ No track found at the requested index!")
                return
            track_id = track_item["track_id"]
            track = await utils.api.get_track(token, track_id)
            if not track or "title" not in track:
                await safe_reply(ctx, f"❌ Could not fetch track info!")
                return
            embed = discord.Embed(
                title=track["title"], color=discord.Color.purple()
            )
            embed.set_footer(
                text=f"{track.get('uploader', 'Unknown Uploader')}",
            )
            embed.set_image(
                url=f"{API_BASE_URL_PROD}/api/track/{track_id}/thumbnail-high"
            )
            await safe_reply(ctx, embeds=[embed])

    @commands.command(description="Clear the queue")
    async def clear(self, ctx: commands.Context):
        """Clear the current queue"""
        async with ctx.typing():
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.clear_queue(token)
            await safe_reply(ctx, "🧹 Cleared the queue!")


def setup(bot: discord.Bot):
    bot.add_cog(Jukebox(bot))
