# Koodaamo Jukebox Server (API)

## Local Development

### Installing Dependencies

```bash
cd KoodaamoJukebox
dotnet restore
```

### Setting User Secrets

To set up your local development environment, run the following commands in the `server/KoodaamoJukebox/Api` directory:

```bash
dotnet user-secrets set "ConnectionStrings:KoodaamoJukeboxDb" "YOUR_CONNECTION_STRING"
dotnet user-secrets set "Jwt:Secret" "YOUR_JWT_SECRET"
dotnet user-secrets set "Discord:ClientSecret" "YOUR_DISCORD_CLIENT_SECRET"
dotnet user-secrets set "Discord:ClientId" "YOUR_DISCORD_CLIENT_ID"
dotnet user-secrets set "Discord:RedirectUri" "YOUR_DISCORD_REDIRECT_URI"
dotnet user-secrets set "YouTube:ApiKey" "YOUR_YOUTUBE_V3_API_KEY"
dotnet user-secrets set "YtDlp:Path" "YOUR_YT_DLP_PATH"
```

### Running the API Backend

Port 5000 is used by default and can be customized if needed.

```bash
cd KoodaamoJukebox/Api
# Start API server on port 5000
dotnet run

# For specifying port
ASPNETCORE_URLS=http://+:5000 dotnet run
```
