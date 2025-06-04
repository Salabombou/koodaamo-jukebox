using KoodaamoJukebox;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Utilities;
using System.Security.Claims;
using KoodaamoJukebox.Services;

namespace server.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
    public class QueueController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly QueueService _queueService;

        public QueueController(AppDbContext dbContext, QueueService queueService)
        {
            _dbContext = dbContext;
            _queueService = queueService;
        }

        [HttpGet]
        public async Task<ActionResult<QueueDto>> GetQueue(string instanceId)
        {
            var queue = await _dbContext.Queues
                .Where(q => q.InstanceId == instanceId)
                .FirstOrDefaultAsync();

            if (queue == null)
            {
                return NotFound("Queue not found for the specified instance.");
            }

            return Ok(new QueueDto(queue));
        }

        [HttpGet("items")]
        public async Task<ActionResult<QueueItemDto[]>> GetQueueItems([FromQuery] long? start = null, [FromQuery] long? end = null)
        {
            var instanceId = User.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                return Unauthorized("InstanceId not found in user claims.");
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

            var queue = await _dbContext.Queues
            .Where(q => q.InstanceId == instanceId)
            .FirstOrDefaultAsync();

            if (queue == null)
            {
                return NotFound("Queue not found for the specified instance.");
            }

            long startDateTime = DateTimeOffset.UnixEpoch.AddMilliseconds(start.Value).ToUnixTimeMilliseconds();
            long endDateTime = DateTimeOffset.UnixEpoch.AddMilliseconds(end.Value).ToUnixTimeMilliseconds();

            var queueItems = await _dbContext.QueueItems
            .Where(qi => qi.InstanceId == instanceId
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

        [HttpGet("items/hash")]
        public async Task<ActionResult<string>> GetQueueItemsHash()
        {
            var instanceId = User.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                return Unauthorized("InstanceId not found in user claims.");
            }
            var queue = await _dbContext.Queues
                .Where(q => q.InstanceId == instanceId)
                .FirstOrDefaultAsync();
            if (queue == null)
            {
                return NotFound("Queue not found for the specified instance.");
            }

            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.InstanceId == instanceId && !qi.IsDeleted)
                .OrderBy(qi => queue.IsShuffled ? qi.ShuffleIndex : qi.Index)
                .ToListAsync();

            var sha256 = System.Security.Cryptography.SHA256.Create();

            foreach (var item in queueItems)
            {
                byte[] trackIdBytes = System.Text.Encoding.UTF8.GetBytes(item.TrackId);
                sha256.TransformBlock(trackIdBytes, 0, trackIdBytes.Length, null, 0);
            }
            sha256.TransformFinalBlock([], 0, 0);

            byte[] hashBytes = sha256.Hash ?? [];
            string hashHex = BitConverter.ToString(hashBytes).Replace("-", string.Empty).ToLowerInvariant();
            return Ok(hashHex);
        }

        [HttpDelete("items/{id}")]
        public async Task<IActionResult> DeleteQueueItem(int id)
        {
            var instanceId = User.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                return Unauthorized("InstanceId not found in user claims.");
            }

            await _queueService.Remove(instanceId, id);
            return NoContent();
        }

        [HttpPost("items")]
        public async Task<IActionResult> AddQueueItems([FromQuery] string urlOrQuery)
        {
            var instanceId = User.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                return Unauthorized("InstanceId not found in user claims.");
            }

            await _queueService.Add(instanceId, urlOrQuery);
            return NoContent();
        }
    }
}
