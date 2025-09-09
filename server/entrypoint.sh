#!/bin/sh
update_yt_dlp() {
  while true; do
    yt-dlp -U
    sleep 3600
  done
}
update_yt_dlp &

exec dotnet KoodaamoJukebox.Api.dll
