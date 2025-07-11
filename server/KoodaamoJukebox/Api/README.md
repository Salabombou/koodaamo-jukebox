# Koodaamo Jukebox API

This project is an ASP.NET Core Web API for the Koodaamo Jukebox application.

## Getting Started

### Prerequisites
- [.NET 9 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/9.0)
- PostgreSQL (if using the database)

### Configuration

### Setting User Secrets

To set up your local development environment, run the following commands in the `server/KoodaamoJukebox/Api` directory:

```bash
dotnet user-secrets set "Discord:BotToken" "YOUR_DISCORD_BOT_TOKEN"
dotnet user-secrets set "Discord:ClientSecret" "YOUR_DISCORD_CLIENT_SECRET"
dotnet user-secrets set "Discord:ClientId" "YOUR_DISCORD_CLIENT_ID"
dotnet user-secrets set "Discord:RedirectUri" "YOUR_DISCORD_REDIRECT_URI"
dotnet user-secrets set "YouTube:ApiKey" "YOUR_YOUTUBE_V3_API_KEY"
dotnet user-secrets set "Jwt:Secret" "YOUR_JWT_SECRET"
dotnet user-secrets set "Cloudflare:TunnelToken" "YOUR_CLOUDFLARE_TUNNEL_TOKEN"
dotnet user-secrets set "Api:BaseUrl" "YOUR_API_BASE_URL"
```

Replace the placeholder values with your actual secrets.

### Running the API

1. Restore dependencies:
   ```bash
   dotnet restore
   ```
2. Run the API:
   ```bash
   dotnet run
   ```

The API will start and listen on the configured port.

---

For more information, see the official ASP.NET Core documentation on [Secret Manager](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets).
