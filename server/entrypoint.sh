#!/bin/sh
# Update yt-dlp every hour in the background
update_yt_dlp() {
  while true; do
    echo "Updating yt-dlp..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
      chmod a+rx /usr/local/bin/yt-dlp
    sleep 3600
done
}

update_yt_dlp &

# Start the .NET server
exec dotnet server.dll
