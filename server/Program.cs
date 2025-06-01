using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.Text;
using Microsoft.Extensions.FileProviders;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox
{
    internal class Program
    {
        static void Main(string[] args)
        {
            DotNetEnv.Env.Load("../.env");

            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers();
            builder.Services.AddDbContext<AppDbContext>();
            builder.Services.AddHostedService<Services.CleanupService>();
            builder.Services.AddScoped<Services.QueueService>();
            builder.Services.AddSignalR();

            builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme =  JwtBearerDefaults.AuthenticationScheme;
            })
                .AddJwtBearer(options =>
                {
                    var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
                    if (string.IsNullOrWhiteSpace(secret))
                    {
                        throw new InvalidOperationException("JWT_SECRET is not set");
                    }

                    var key = Encoding.UTF8.GetBytes(secret);

                    //options.RequireHttpsMetadata = false; // Set to true in production
                    options.SaveToken = true;
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidIssuers = ["jukebox-server", "jukebox-bot"],
                        ValidateAudience = false,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        ClockSkew = TimeSpan.Zero, // Disable clock skew for immediate expiration
                        IssuerSigningKey = new SymmetricSecurityKey(key)
                    };

                    // check that the user is in the database
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
                                string.IsNullOrEmpty(context.Principal.FindFirstValue("instance_id")))
                            {
                                context.Success();
                                return;
                            }

                            bool userIdIsValid = long.TryParse(context.Principal.FindFirstValue("user_id"), out long userId);
                            string? associatedInstanceId = context.Principal.FindFirstValue("instance_id");

                            if (!userIdIsValid || string.IsNullOrWhiteSpace(associatedInstanceId))
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

                            if (user.AssociatedInstanceId != associatedInstanceId)
                            {
                                context.Fail("Unauthorized");
                                return;
                            }
                            context.Success();
                        }
                    };
                });
            builder.Services.AddAuthorization();

            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            var app = builder.Build();

            app.UseAuthentication();
            app.UseAuthorization();

            if (app.Environment.IsProduction())
            {
                app.UseDefaultFiles();
                app.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = new PhysicalFileProvider(Path.Combine(Directory.GetCurrentDirectory(), Environment.GetEnvironmentVariable("CLIENT_BUILD_DIR") ?? "../client/dist")),
                    RequestPath = ""
                });
            }

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.MapControllers();
            app.MapHub<Hubs.QueueHub>("/api/hubs/queue");

            app.Run();
        }
    }
}
