FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src
COPY . .
WORKDIR /src/KoodaamoJukebox.Api
RUN dotnet restore "KoodaamoJukebox.Api.csproj"
RUN dotnet build "KoodaamoJukebox.Api.csproj" -c Release -o /app/build

# Dedicated stage for dotnet-ef tool
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS tools
RUN dotnet tool install --global dotnet-ef
ENV PATH="/root/.dotnet/tools:$PATH"

FROM build AS publish
WORKDIR /src/KoodaamoJukebox.Api
RUN dotnet publish "KoodaamoJukebox.Api.csproj" -c Release -o /app/publish


# Stage for running database migration
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS update-database
WORKDIR /src/KoodaamoJukebox.Database
RUN dotnet tool install --global dotnet-ef
ENV PATH="/root/.dotnet/tools:$PATH"
COPY --from=publish /src ../
CMD ["dotnet-ef", "database", "update", "--startup-project", "../KoodaamoJukebox.Api"]

# Final stage
FROM base AS final
WORKDIR /app
RUN apk add --no-cache curl python3 ffmpeg
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp
COPY --from=publish /app/publish .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
