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
    def __init__(self, bot):
        self.bot = bot

    @commands.command(description="Get current room status and queue")
    async def status(self, ctx: commands.Context):
        """Get current room information and queue"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            
            room_info = room_data["roomInfo"]
            queue_items = room_data["queueItems"]
            
            embed = discord.Embed(
                title=f"🎵 Room: {room_info['roomCode']}", 
                color=discord.Color.blue()
            )
            
            # Room status
            status_text = "⏸️ Paused" if room_info["isPaused"] else "▶️ Playing"
            loop_text = "🔁 Loop: On" if room_info["isLooping"] else "🔁 Loop: Off"
            shuffle_text = "🔀 Shuffle: On" if room_info["isShuffled"] else "🔀 Shuffle: Off"
            
            embed.add_field(
                name="Status", 
                value=f"{status_text}\n{loop_text}\n{shuffle_text}",
                inline=True
            )
            
            # Current track
            current_track = room_info["currentTrack"]
            if current_track["index"] >= 0:
                embed.add_field(
                    name="Current Track",
                    value=f"Index: {current_track['index']}\nID: {current_track['id'][:20]}...",
                    inline=True
                )
            
            # Queue info
            embed.add_field(
                name="Queue",
                value=f"📋 {len(queue_items)} tracks",
                inline=True
            )
            
            await ctx.send(embed=embed)
            
        except Exception as e:
            await ctx.send(f"❌ Error getting room status: {str(e)}")

    @commands.command(description="Pause or unpause playback")
    async def pause(self, ctx: commands.Context):
        """Toggle pause state"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.pause_toggle(token, True)
            
            status = "⏸️ Paused"
            await ctx.send(f"{status} playback!")
            
        except Exception as e:
            await ctx.send(f"❌ Error toggling pause: {str(e)}")
    
    @commands.command(description="Resume playback")
    async def resume(self, ctx: commands.Context):
        """Resume playback"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.pause_toggle(token, False)

            status = "▶️ Resumed"
            await ctx.send(f"{status} playback!")

        except Exception as e:
            await ctx.send(f"❌ Error resuming playback: {str(e)}")

    @commands.command(description="Toggle loop mode")
    async def loop(self, ctx: commands.Context):
        """Toggle loop state"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            
            # Get current loop state and toggle it
            current_loop_state = room_data["roomInfo"]["isLooping"]
            new_loop_state = not current_loop_state
            
            await utils.api.loop_toggle(token, new_loop_state)
            
            status = "🔁 Enabled" if new_loop_state else "🔁 Disabled"
            await ctx.send(f"{status} loop mode!")
            
        except Exception as e:
            await ctx.send(f"❌ Error toggling loop: {str(e)}")

    @commands.command(description="Toggle shuffle mode")
    async def shuffle(self, ctx: commands.Context):
        """Toggle shuffle state"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            
            # Get current shuffle state and toggle it
            current_shuffle_state = room_data["roomInfo"]["isShuffled"]
            new_shuffle_state = not current_shuffle_state
            
            await utils.api.shuffle_toggle(token, new_shuffle_state)
            
            status = "🔀 Enabled" if new_shuffle_state else "🔀 Disabled"
            await ctx.send(f"{status} shuffle mode!")
            
        except Exception as e:
            await ctx.send(f"❌ Error toggling shuffle: {str(e)}")

    @commands.command(description="Seek to a specific time in the current track")
    async def seek(self, ctx: commands.Context, seconds: int):
        """Seek to specific time in seconds"""
        try:
            if seconds < 0:
                await ctx.send("❌ Seek time must be non-negative!")
                return
                
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.seek(token, seconds)
            
            minutes, secs = divmod(seconds, 60)
            await ctx.send(f"⏩ Seeked to {minutes}:{secs:02d}!")
            
        except Exception as e:
            await ctx.send(f"❌ Error seeking: {str(e)}")

    @commands.command(description="Skip forward by amount of tracks (default 1)")
    async def skip(self, ctx: commands.Context, amount: int = 1):
        """Skip forward by amount of tracks from current position"""
        try:
            if amount == 0:
                await ctx.send("❌ Amount cannot be 0! Use a positive number to skip forward or negative to skip backward.")
                return
                
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            
            current_index = room_data["roomInfo"]["currentTrack"]["index"]
            target_index = current_index + amount
            
            if target_index < 0:
                await ctx.send("❌ Cannot skip to a negative index!")
                return
            
            await utils.api.skip(token, target_index)
            
            direction = "forward" if amount > 0 else "backward"
            await ctx.send(f"⏭️ Skipped {direction} by {abs(amount)} track(s) to index {target_index}!")
            
        except Exception as e:
            await ctx.send(f"❌ Error skipping: {str(e)}")

    @commands.command(description="Move a track from one position to another")
    async def move(self, ctx: commands.Context, from_index: int, to_index: int):
        """Move track from one position to another"""
        try:
            if from_index < 0 or to_index < 0:
                await ctx.send("❌ Indices must be non-negative!")
                return
                
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.move_track(token, from_index, to_index)
            
            await ctx.send(f"🔄 Moved track from #{from_index} to #{to_index}!")
            
        except Exception as e:
            await ctx.send(f"❌ Error moving track: {str(e)}")

    @commands.command(description="Add a track to the queue")
    async def play(self, ctx: commands.Context, *, url_or_query: str = "https://music.youtube.com/playlist?list=PLxqk0Y1WNUGpZVR40HTLncFl22lJzNcau"):
        """Add track to queue"""
        try:
            # Send a "typing" indicator since this might take a while
            async with ctx.typing():
                token = await utils.api.get_token_from_context(ctx)
                await utils.api.add_track(token, url_or_query)
                
                # Truncate long URLs for display
                display_text = url_or_query
                if len(display_text) > 50:
                    display_text = display_text[:47] + "..."
                    
                await ctx.send(f"✅ Added to queue: {display_text}")
            
        except Exception as e:
            await ctx.send(f"❌ Error adding track: {str(e)}")

    @commands.command(description="Remove a track from the queue by ID")
    async def remove(self, ctx: commands.Context, track_id: int):
        """Remove track by ID"""
        try:
            if track_id < 0:
                await ctx.send("❌ Track ID must be non-negative!")
                return
                
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.remove_track(token, track_id)
            
            await ctx.send(f"🗑️ Removed track with ID {track_id}!")
            
        except Exception as e:
            await ctx.send(f"❌ Error removing track: {str(e)}")

    @commands.command(description="Delete a track from the queue by index")
    async def delete(self, ctx: commands.Context, index: int):
        """Delete track by index"""
        try:
            if index < 0:
                await ctx.send("❌ Index must be non-negative!")
                return
                
            token = await utils.api.get_token_from_context(ctx)
            await utils.api.delete_track(token, index)
            
            await ctx.send(f"🗑️ Deleted track at index {index}!")
            
        except Exception as e:
            await ctx.send(f"❌ Error deleting track: {str(e)}")

    @commands.command(description="Show the current queue")
    async def queue(self, ctx: commands.Context, page: int = 1):
        """Show current queue with pagination"""
        try:
            token = await utils.api.get_token_from_context(ctx)
            room_data = await utils.api.get_room(token)
            
            queue_items = room_data["queueItems"]
            room_info = room_data["roomInfo"]
            
            if not queue_items:
                await ctx.send("📭 Queue is empty!")
                return
            
            # Pagination
            items_per_page = 10
            total_pages = (len(queue_items) + items_per_page - 1) // items_per_page
            
            if page < 1 or page > total_pages:
                await ctx.send(f"❌ Page must be between 1 and {total_pages}!")
                return
            
            start_idx = (page - 1) * items_per_page
            end_idx = min(start_idx + items_per_page, len(queue_items))
            page_items = queue_items[start_idx:end_idx]
            
            embed = discord.Embed(
                title=f"🎵 Queue - Page {page}/{total_pages}",
                description=f"Total tracks: {len(queue_items)}",
                color=discord.Color.green()
            )
            
            current_index = room_info["currentTrack"]["index"]
            
            queue_text = ""
            for item in page_items:
                index = item["shuffledIndex"] if room_info["isShuffled"] and item["shuffledIndex"] is not None else item["index"]
                marker = "▶️" if index == current_index else "🎵"
                queue_text += f"{marker} **#{index}** - ID: {item['trackId'][:15]}...\n"
            
            embed.add_field(name="Tracks", value=queue_text, inline=False)
            
            if total_pages > 1:
                embed.set_footer(text=f"Use {ctx.prefix}queue <page> to see other pages")
            
            await ctx.send(embed=embed)
            
        except Exception as e:
            await ctx.send(f"❌ Error getting queue: {str(e)}")


def setup(bot: discord.Bot):
    bot.add_cog(Jukebox(bot))
