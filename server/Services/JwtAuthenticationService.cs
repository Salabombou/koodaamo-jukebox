using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Services
{
    public static class JwtAuthenticationService
    {
        public static IServiceCollection AddJwtAuthentication(this IServiceCollection services)
        {
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
                if (string.IsNullOrWhiteSpace(secret))
                {
                    throw new InvalidOperationException("JWT_SECRET is not set");
                }

                var key = Encoding.UTF8.GetBytes(secret);

                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuers = ["jukebox-server", "jukebox-bot"],
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

                        var dbContext = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
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
