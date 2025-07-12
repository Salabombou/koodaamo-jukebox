using KoodaamoJukebox.Api.Services;
using KoodaamoJukebox.Database;
using KoodaamoJukebox.Database.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json.Serialization;

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
            builder.Services.AddJwtAuthentication(builder.Configuration);

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
