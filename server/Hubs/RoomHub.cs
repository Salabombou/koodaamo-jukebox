using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Models;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Services;
using System.Security.Claims;

namespace KoodaamoJukebox.Hubs
{

    [Authorize]
    public class RoomHub : Hub
    {
        private readonly AppDbContext _dbContext;
        private readonly QueueService _queueService;
        public RoomHub(AppDbContext dbContext, QueueService queueService)
        {
            _dbContext = dbContext;
            _queueService = queueService;
        }

        public async ValueTask<object> InvokeMethodAsync(
            HubInvocationContext context,
            Func<HubInvocationContext, ValueTask<object>> next
        )
        {
            // if the time difference between the sentAt and the current time is more than 5 seconds
            var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (context.HubMethodArguments.Count > 0 && context.HubMethodArguments[0] is long sentAt)
            {
                if (Math.Abs(currentTime - sentAt) > 5000)
                {
                    throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
                }
            }
            else
            {
                throw new ArgumentException("SentAt argument is required.", nameof(context.HubMethodArguments));
            }

            return await next(context);
        }

        public override async Task OnConnectedAsync()
        {
            if (!long.TryParse(Context.User?.FindFirstValue("user_id"), out long userId))
            {
                throw new UnauthorizedAccessException("UserId not found in user claims.");
            }

            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }

            var user = await _dbContext.Users
                .Where(u => u.UserId == userId)
                .FirstOrDefaultAsync() ?? throw new UnauthorizedAccessException("User not found in the database.");
            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new UnauthorizedAccessException("RoomInfo not found for the specified room code");
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .Select(qi => new QueueItemDto(qi))
                .ToListAsync() ?? throw new UnauthorizedAccessException("QueueItems not found for the specified room code");
            await base.OnConnectedAsync();

            user.ConnectionId = Context.ConnectionId;
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
            await _dbContext.SaveChangesAsync();

            await Clients.Caller.SendAsync("RoomUpdate", new RoomInfoDto(roomInfo), queueItems);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (!long.TryParse(Context.User?.FindFirstValue("user_id"), out long userId))
            {
                throw new UnauthorizedAccessException("UserId not found in user claims.");
            }

            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }

            var user = await _dbContext.Users
                .Where(u => u.UserId == userId)
                .FirstOrDefaultAsync();

            if (user != null)
            {
                user.ConnectionId = null;
                await _dbContext.SaveChangesAsync();
            }

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomCode);

            await base.OnDisconnectedAsync(exception);
        }

        public async Task PauseToggle(long sentAt, bool paused)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }

            await _queueService.Pause(roomCode, paused, sentAt);
        }

        public async Task LoopToggle(long sentAt, bool loop)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Loop(roomCode, loop);
        }

        public async Task ShuffleToggle(long sentAt, bool shuffled)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Shuffle(roomCode, shuffled);
        }

        public async Task Seek(long sentAt, int seekTime, bool pause = false)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }

            await _queueService.Seek(roomCode, seekTime);
            if (pause)
            {
                await _queueService.Pause(roomCode, true);
            }
        }

        public async Task Skip(long sentAt, int index)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Skip(roomCode, index);
            //await _queueService.Pause(roomCode, false); // Unpause after skipping
        }

        public async Task Move(long sentAt, int from, int to)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Move(roomCode, from, to);
        }

        public async Task Add(long sentAt, string videoId)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Add(roomCode, videoId);
        }

        public async Task Remove(long sentAt, int index)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Remove(roomCode, index);
        }

        public async Task Delete(long sentAt, int index)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Delete(roomCode, index);
        }

        /*public async Task Clear(long sentAt)
        {
            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(currentTime - sentAt) > 5000)
            {
                throw new ArgumentException("Timestamp difference is too large.", nameof(sentAt));
            }
            var roomCode = Context.User?.FindFirstValue("room_code");
            if (string.IsNullOrEmpty(roomCode))
            {
                throw new UnauthorizedAccessException("RoomCode not found in user claims.");
            }
            await _queueService.Clear(roomCode);
        }*/
    }
}
