using Microsoft.AspNetCore.SignalR;

namespace KoodaamoJukebox.Api.Middlewares
{
    public class GlobalExceptionHandlerHubFilterMiddleware : IHubFilter
    {
        private readonly ILogger<GlobalExceptionHandlerHubFilterMiddleware> _logger;

        public GlobalExceptionHandlerHubFilterMiddleware(ILogger<GlobalExceptionHandlerHubFilterMiddleware> logger)
        {
            _logger = logger;
        }

        public async ValueTask<object?> InvokeMethodAsync(
            HubInvocationContext invocationContext,
            Func<HubInvocationContext, ValueTask<object?>> next)
        {
            try
            {
                return await next(invocationContext);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Bad request in SignalR Hub method {Method}: {Message}", invocationContext.HubMethodName, ex.Message);
                throw new HubException("Bad request: " + ex.Message);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access in SignalR Hub method {Method}: {Message}", invocationContext.HubMethodName, ex.Message);
                throw new HubException("Unauthorized access: " + ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled exception in SignalR Hub method {Method}", invocationContext.HubMethodName);
                throw new HubException("An unexpected error occurred in the KoodaamoJukebox.");
            }
        }
    }
}
