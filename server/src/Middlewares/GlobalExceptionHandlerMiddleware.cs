using Microsoft.AspNetCore.Mvc;

namespace KoodaamoJukebox.Middlewares
{
    public class GlobalExceptionHandlerMiddleware : IMiddleware
    {
        private readonly ILogger<GlobalExceptionHandlerMiddleware> _logger;
        public GlobalExceptionHandlerMiddleware(ILogger<GlobalExceptionHandlerMiddleware> logger)
        {
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context, RequestDelegate next)
        {
            try
            {
                await next(context);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Bad request error: {Message}", ex.Message);
                if (!context.Response.HasStarted)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    context.Response.ContentType = "application/problem+json";
                    ProblemDetails problem = new()
                    {
                        Title = "Bad Request",
                        Detail = ex.Message
                    };
                    await context.Response.WriteAsJsonAsync(problem);
                }
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized error: {Message}", ex.Message);
                if (!context.Response.HasStarted)
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.ContentType = "application/problem+json";
                    ProblemDetails problem = new()
                    {
                        Title = "Unauthorized",
                        Detail = ex.Message
                    };
                    await context.Response.WriteAsJsonAsync(problem);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled exception: {Message}\nStackTrace: {StackTrace}", ex.Message, ex.StackTrace);
                if (!context.Response.HasStarted)
                {
                    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                    context.Response.ContentType = "application/problem+json";
                    ProblemDetails problem = new()
                    {
                        Title = "An unexpected error occurred."
                    };
                    await context.Response.WriteAsJsonAsync(problem);
                }
            }
        }
    }
}
