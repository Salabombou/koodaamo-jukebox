using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using KoodaamoJukebox.Api.Services;
using System.Security.Claims;
using KoodaamoJukebox.Database;

namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Bot")]
    public class RoomController : ControllerBase
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly QueueService _queueService;
        private readonly ILogger<RoomController> _logger;

        public RoomController(KoodaamoJukeboxDbContext dbContext, QueueService queueService, ILogger<RoomController> logger)
        {
            _dbContext = dbContext;
            _queueService = queueService;
            _logger = logger;
        }

        private string GetRoomCodeFromClaims()
        {
            var roomCode = User.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new ArgumentException("RoomCode not found in user claims.");
            }
            return roomCode;
        }

        /// <summary>
        /// Get current room information and queue
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<RoomResponse>> GetRoom()
        {
            var roomCode = GetRoomCodeFromClaims();

            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync();

            if (roomInfo == null)
            {
                return NotFound("Room not found.");
            }

            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .Select(qi => new QueueItemDto(qi))
                .ToListAsync();

            return Ok(new RoomResponse
            {
                RoomInfo = new RoomInfoDto(roomInfo),
                QueueItems = queueItems
            });
        }

        /// <summary>
        /// Toggle pause state
        /// </summary>
        [HttpPost("pause")]
        public async Task<ActionResult<RoomResponse>> PauseToggle([FromBody] TimestampedBoolRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            await _queueService.Pause(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Toggle loop state
        /// </summary>
        [HttpPost("loop")]
        public async Task<ActionResult<RoomResponse>> LoopToggle([FromBody] TimestampedBoolRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            await _queueService.Loop(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Toggle shuffle state
        /// </summary>
        [HttpPost("shuffle")]
        public async Task<ActionResult<RoomResponse>> ShuffleToggle([FromBody] TimestampedBoolRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            await _queueService.Shuffle(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Seek to a specific time in the current track
        /// </summary>
        [HttpPost("seek")]
        public async Task<ActionResult<RoomResponse>> Seek([FromBody] TimestampedIntRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (request.Value < 0)
            {
                return BadRequest("Seek time must be non-negative.");
            }

            await _queueService.Seek(roomCode, request.Value);
            if (request.Pause)
            {
                await _queueService.Pause(roomCode, true);
            }
            return await GetRoom();
        }

        /// <summary>
        /// Skip to a specific track by index
        /// </summary>
        [HttpPost("skip")]
        public async Task<ActionResult<RoomResponse>> Skip([FromBody] TimestampedIntRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (request.Value < 0)
            {
                return BadRequest("Index must be non-negative.");
            }

            await _queueService.Skip(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Move a track from one position to another
        /// </summary>
        [HttpPost("move")]
        public async Task<ActionResult<RoomResponse>> Move([FromBody] TimestampedMoveRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (request.From < 0 || request.To < 0)
            {
                return BadRequest("Indices must be non-negative.");
            }

            await _queueService.Move(roomCode, request.From, request.To);

            return await GetRoom();
        }

        /// <summary>
        /// Add a track to the queue
        /// </summary>
        [HttpPost("add")]
        public async Task<ActionResult<RoomResponse>> Add([FromBody] TimestampedStringRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (string.IsNullOrWhiteSpace(request.Value))
            {
                return BadRequest("URL/Query cannot be empty.");
            }

            await _queueService.Add(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Remove a track from the queue by ID
        /// </summary>
        [HttpPost("remove")]
        public async Task<ActionResult<RoomResponse>> Remove([FromBody] TimestampedIntRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (request.Value < 0)
            {
                return BadRequest("ID must be non-negative.");
            }

            await _queueService.Remove(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Delete a track from the queue by index
        /// </summary>
        [HttpPost("delete")]
        public async Task<ActionResult<RoomResponse>> Delete([FromBody] TimestampedIntRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            if (request.Value < 0)
            {
                return BadRequest("Index must be non-negative.");
            }

            await _queueService.Delete(roomCode, request.Value);

            return await GetRoom();
        }

        /// <summary>
        /// Clear the queue
        /// </summary>
        [HttpPost("clear")]
        public async Task<ActionResult<RoomResponse>> ClearQueue([FromBody] TimestampedIntRequest request)
        {
            var roomCode = GetRoomCodeFromClaims();

            await _queueService.Clear(roomCode);

            return await GetRoom();
        }
    }

    // Request DTOs
    public class TimestampedBoolRequest
    {
        public long SentAt { get; set; }
        public bool Value { get; set; }
    }

    public class TimestampedIntRequest
    {
        public long SentAt { get; set; }
        public int Value { get; set; }
        public bool Pause { get; set; } = false; // Optional for pause requests
    }

    public class TimestampedStringRequest
    {
        public long SentAt { get; set; }
        public string Value { get; set; } = string.Empty;
    }

    public class TimestampedMoveRequest
    {
        public long SentAt { get; set; }
        public int From { get; set; }
        public int To { get; set; }
    }

    // Response DTO
    public class RoomResponse
    {
        public RoomInfoDto RoomInfo { get; set; } = null!;
        public List<QueueItemDto> QueueItems { get; set; } = new();
    }
}
