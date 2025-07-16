using KoodaamoJukebox.Api.Services;
using KoodaamoJukebox.Database;
using KoodaamoJukebox.Database.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

namespace KoodaamoJukebox.Api
{
    internal class Program
    {
        static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Set default port to 5000 if not specified
            var port = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
            if (string.IsNullOrEmpty(port))
            {
                builder.WebHost.UseUrls("http://+:8080");
            }

            builder.Services.AddControllers().AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
                options.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
            });
            builder.Services.AddDbContext<KoodaamoJukeboxDbContext>(options =>
            {
                options.UseNpgsql(builder.Configuration.GetConnectionString("KoodaamoJukeboxDb"));
            });
            builder.Services.AddHostedService<DatabaseCleanupService>();
            builder.Services.AddScoped<QueueService>();
            builder.Services.AddSignalR(options =>
            {
                options.AddFilter<Middlewares.GlobalExceptionHandlerHubFilterMiddleware>();
            })
            .AddNewtonsoftJsonProtocol(options =>
            {
                options.PayloadSerializerSettings.ContractResolver = new DefaultContractResolver
                {
                    NamingStrategy = new SnakeCaseNamingStrategy()
                };
            });
            builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                var secret = builder.Configuration["Jwt:Secret"];
                if (string.IsNullOrWhiteSpace(secret))
                {
                    throw new InvalidOperationException("Jwt:Secret is not set in configuration");
                }
                var key = Encoding.UTF8.GetBytes(secret);

                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuers = ["server-KoodaamoJukebox", "bot-KoodaamoJukebox"],
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ClockSkew = TimeSpan.Zero,
                    IssuerSigningKey = new SymmetricSecurityKey(key)
                };
            });

            builder.Services.AddAuthorization(options =>
            {
                options.DefaultPolicy = new AuthorizationPolicyBuilder()
                    .RequireAuthenticatedUser()
                    .Build();
                options.AddPolicy("ConnectedUserData", policy =>
                {
                    policy.RequireClaim("room_code");
                    policy.RequireClaim("user_id");
                    policy.RequireAssertion(async context =>
                    {
                        var roomCode = context.User.FindFirst("room_code")?.Value;
                        long.TryParse(context.User.FindFirst("user_id")?.Value, out var userId);
                        if (string.IsNullOrEmpty(roomCode) || userId <= 0)
                        {
                            return false;
                        }

                        if (context.Resource is not DefaultHttpContext httpContext)
                        {
                            return false;
                        }
                        IServiceProvider? serviceProvider = httpContext.RequestServices;

                        var logger = serviceProvider.GetService<ILogger<Program>>();
                        var dbContext = serviceProvider.GetService<KoodaamoJukeboxDbContext>();
                        if (dbContext == null || logger == null)
                        {
                            logger!.LogError("DbContext or Logger is not available in ConnectedUserData policy.");
                            return false;
                        }

                        var user = await dbContext.Users
                            .Where(u => u.UserId == userId && u.AssociatedRoomCode == roomCode)
                            .FirstOrDefaultAsync();
                        if (user == null)
                        {
                            logger.LogWarning("User with ID {UserId} and RoomCode {RoomCode} not found.", userId, roomCode);
                            return false;
                        }

                        var roomExists = await dbContext.RoomInfos
                            .AnyAsync(r => r.RoomCode == roomCode && r.IsEmbedded == user.IsEmbedded);
                        if (!roomExists)
                        {
                            logger.LogWarning("Room with code {RoomCode} and embedded state {IsEmbedded} not found.", roomCode, user.IsEmbedded);
                            return false;
                        }
                        return true;
                    });
                });
                options.AddPolicy("BotOnly", policy =>
                {
                    policy.RequireClaim("iss", "bot-KoodaamoJukebox");
                });
                options.AddPolicy("ClientOnly", policy =>
                {
                    policy.RequireClaim("iss", "server-KoodaamoJukebox");
                });
            });

            builder.Services.AddTransient<Middlewares.GlobalExceptionHandlerMiddleware>();

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            var app = builder.Build();

            app.UseAuthentication();
            app.UseAuthorization();
            app.UseMiddleware<Middlewares.GlobalExceptionHandlerMiddleware>();

            if (app.Environment.IsProduction())
            {
                app.UseDefaultFiles();
                app.UseStaticFiles();
            }

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.MapControllers();
            app.MapHub<Hubs.RoomHub>("/api/hubs/room");

            app.Run();
        }
    }
}
