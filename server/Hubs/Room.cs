using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Models;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Utilities;
using KoodaamoJukebox.Services;
using System.Security.Claims;

namespace KoodaamoJukebox.Hubs
{

    [Authorize]
    public class QueueHub : Hub
    {
        private readonly AppDbContext _dbContext;
        private readonly QueueService _queueService;
        public QueueHub(AppDbContext dbContext, QueueService queueService)
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

            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }

            var user = await _dbContext.Users
                .Where(u => u.UserId == userId)
                .FirstOrDefaultAsync();

            if (user == null)
            {
                throw new UnauthorizedAccessException("User not found in the database.");
            }

            user.ConnectionId = Context.ConnectionId;
            await _dbContext.SaveChangesAsync();


            await Groups.AddToGroupAsync(Context.ConnectionId, instanceId);
            
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (!long.TryParse(Context.User?.FindFirstValue("user_id"), out long userId))
            {
                throw new UnauthorizedAccessException("UserId not found in user claims.");
            }

            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }

            var user = await _dbContext.Users
                .Where(u => u.UserId == userId)
                .FirstOrDefaultAsync();

            if (user != null)
            {
                user.ConnectionId = null;
                await _dbContext.SaveChangesAsync();
            }

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, instanceId);

            await base.OnDisconnectedAsync(exception);
        }

        public async Task Ping()
        {
            await Clients.Caller.SendAsync("Pong");
        }

        public async Task PauseResume(long sentAt, bool paused)
        {
            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }

            await _queueService.PauseResume(instanceId, sentAt, paused);
        }

        public async Task Skip(long sentAt, int index)
        {
            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }
            await _queueService.Skip(instanceId, index);
        }

        public async Task Move(long sentAt, int from, int to)
        {
            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }
            await _queueService.Move(instanceId, from, to);
        }

        public async Task Add(long sentAt, string videoId)
        {
            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }
            await _queueService.Add(instanceId, videoId);
        }

        public async Task Remove(long sentAt, int index)
        {
            var instanceId = Context.User?.FindFirstValue("instance_id");
            if (string.IsNullOrEmpty(instanceId))
            {
                throw new UnauthorizedAccessException("InstanceId not found in user claims.");
            }
            await _queueService.Remove(instanceId, index);
        }
    }
}
