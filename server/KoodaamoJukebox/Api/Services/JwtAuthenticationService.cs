using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database;

namespace KoodaamoJukebox.Api.Services
{
    public static class JwtAuthenticationService
    {
        public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
        {
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                var secret = configuration["Jwt:Secret"];
                if (string.IsNullOrWhiteSpace(secret))
                {
                    throw new InvalidOperationException("Jwt:Secret is not set in configuration");
                }

                var key = Encoding.UTF8.GetBytes(secret);

                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuers = ["jukebox-KoodaamoJukebox", "jukebox-bot"],
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ClockSkew = TimeSpan.Zero,
                    IssuerSigningKey = new SymmetricSecurityKey(key)
                };

                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        if (context.Principal == null)
                        {
                            context.Fail("Unauthorized");
                            return;
                        }

                        if (context.Principal.FindFirstValue("iss") == "jukebox-bot" &&
                            string.IsNullOrEmpty(context.Principal.FindFirstValue("user_id")) &&
                            string.IsNullOrEmpty(context.Principal.FindFirstValue("room_code")))
                        {
                            context.Success();
                            return;
                        }

                        bool userIdIsValid = long.TryParse(context.Principal.FindFirstValue("user_id"), out long userId);
                        string? associatedRoomCode = context.Principal.FindFirstValue("room_code");

                        if (!userIdIsValid || string.IsNullOrWhiteSpace(associatedRoomCode))
                        {
                            context.Fail("Unauthorized");
                            return;
                        }

                        var dbContext = context.HttpContext.RequestServices.GetRequiredService<KoodaamoJukeboxDbContext>();
                        var user = await dbContext.Users.FirstAsync(u => u.UserId == userId);
                        if (user == null)
                        {
                            context.Fail("Unauthorized");
                            return;
                        }

                        if (user.AssociatedRoomCode != associatedRoomCode)
                        {
                            context.Fail("Unauthorized");
                            return;
                        }
                        context.Success();
                    }
                };
            });
            return services;
        }
    }
}
