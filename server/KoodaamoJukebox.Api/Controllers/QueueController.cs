using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Api.Utilities;
using System.Security.Claims;
using KoodaamoJukebox.Api.Services;
using KoodaamoJukebox.Database;

namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Authorize(Policy = "BotOnly")]
    [Authorize(Policy = "ConnectedUserData")]
    [Route("api/[controller]")]
    public class QueueController : ControllerBase
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly QueueService _queueService;

        public QueueController(KoodaamoJukeboxDbContext dbContext, QueueService queueService)
        {
            _dbContext = dbContext;
            _queueService = queueService;
        }

        [HttpGet]
        public async Task<ActionResult<RoomInfoDto>> GetQueue(string roomCode)
        {
            var queue = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync();

            if (queue == null)
            {
                return NotFound("Queue not found for the specified room code");
            }

            return Ok(new RoomInfoDto(queue));
        }

        [HttpGet("items")]
        public async Task<ActionResult<QueueItemDto[]>> GetQueueItems([FromQuery] long? start = null, [FromQuery] long? end = null)
        {
            var roomCode = User.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                return Unauthorized("RoomCode not found in user claims.");
            }

            var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            if (start.HasValue)
            {
                if (start < 0 || start > currentTime)
                {
                    return BadRequest("Invalid start time.");
                }
            }
            else
            {
                start = 0; // Default to the beginning of the queue
            }

            if (end.HasValue)
            {
                if (end < start || end > currentTime)
                {
                    return BadRequest("Invalid end time.");
                }
            }
            else
            {
                end = currentTime; // Default to the current time
            }

            var queue = await _dbContext.RoomInfos
            .Where(q => q.RoomCode == roomCode)
            .FirstOrDefaultAsync();

            if (queue == null)
            {
                return NotFound("Queue not found for the specified room code");
            }

            long startDateTime = DateTimeOffset.UnixEpoch.AddMilliseconds(start.Value).ToUnixTimeMilliseconds();
            long endDateTime = DateTimeOffset.UnixEpoch.AddMilliseconds(end.Value).ToUnixTimeMilliseconds();

            var queueItems = await _dbContext.QueueItems
            .Where(qi => qi.RoomCode == roomCode
                && qi.UpdatedAt >= startDateTime
                && qi.UpdatedAt <= endDateTime
                && !qi.IsDeleted)
            .OrderBy(qi => qi.Index)
            .Select(qi => new QueueItemDto(qi))
            .ToListAsync();

            if (queueItems == null)
            {
                return Ok(Array.Empty<QueueItemDto>()); // Return empty array if no items found
            }

            return Ok(queueItems);
        }

        [HttpDelete("items/{id}")]
        public async Task<IActionResult> DeleteQueueItem(int id)
        {
            var roomCode = User.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                return Unauthorized("RoomCode not found in user claims.");
            }

            await _queueService.Delete(roomCode, id);
            return NoContent();
        }

        [HttpPost("items")]
        public async Task<IActionResult> AddQueueItems([FromQuery] string urlOrQuery)
        {
            var roomCode = User.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                return Unauthorized("RoomCode not found in user claims.");
            }

            await _queueService.Add(roomCode, urlOrQuery);
            return NoContent();
        }
    }
}
