using KoodaamoJukebox.Services;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json.Serialization;
using Microsoft.AspNetCore.Identity;


namespace KoodaamoJukebox
{
    internal class Program
    {
        static void Main(string[] args)
        {
            DotNetEnv.Env.Load();
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers().AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
                options.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
            });
            builder.Services.AddDbContext<AppDbContext>();
            builder.Services.AddHostedService<CleanupService>();
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
            builder.Services.AddJwtAuthentication();

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
