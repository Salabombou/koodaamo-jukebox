#!/bin/sh
update_yt_dlp() {
  while true; do
    yt-dlp --update-to nightly
    sleep 3600
  done
}
#update_yt_dlp &

exec dotnet KoodaamoJukebox.Api.dll
