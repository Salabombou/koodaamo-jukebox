import child_process from 'child_process';

import type { TClientVideo } from '../../shared/types/video';

const YT_DLP_BIN = process.env.YT_DLP_BIN || 'yt-dlp';

export function getAudioPlaylistUrl(id: string) {
  const ytDlp = child_process.spawn(YT_DLP_BIN, ['-f', '234/233', '--get-url', '--no-warnings', '--quiet', id]);

  let url = '';
  ytDlp.stdout.on('data', (data) => {
    url += data.toString();
  });

  let error = '';
  ytDlp.stderr.on('data', (data) => {
    error += data.toString();
  });

  return new Promise<string>((resolve, reject) => {
    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve(url.trim());
      } else {
        reject(new Error(error.trim()));
      }
    });
  });
}

export function parseExpirationDate(url: string) {
  const regex = /\/expire\/(\d+)\//;

  const match = url.match(regex);
  if (!match || !match[1]) {
    throw new Error('Failed to parse expiration date');
  }

  return new Date(parseInt(match[1]) * 1000);
}

const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
const playlistIdPattern = /^[a-zA-Z0-9_-]{34}$/;

export function parseVideoPlaylistId(input: string): [string, 'video' | 'playlist'] | null {
  input = input.trim();

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    if (videoIdPattern.test(input)) {
      return [input, 'video'];
    } else if (input.length >= 5) {
      return [`ytsearch1:${input}`, 'video'];
    }
    return null;
  }

  if (url.hostname === 'youtu.be') {
    const videoId = url.pathname.slice(1);
    if (!videoIdPattern.test(videoId)) {
      return null;
    }
    return [videoId, 'video'];
  }

  switch (url.hostname) {
    case 'www.youtube.com':
    case 'm.youtube.com':
    case 'youtube.com':
    case 'music.youtube.com':
      const videoId = url.searchParams.get('v');
      const listId = url.searchParams.get('list');
      if (videoId) {
        if (!videoIdPattern.test(videoId)) {
          return null;
        }
        return [videoId, 'video'];
      } else if (listId) {
        if (!playlistIdPattern.test(listId)) {
          return null;
        }
        return [listId, 'playlist'];
      }
  }

  return null;
}

function parseVideoThumbnail(thumbnails: any[]) {
  let thumbnail = thumbnails.at(-1).url;

  // get album cover thumbnail (largest square thumbnail)
  thumbnails.sort((a, b) => a.width - b.width);
  thumbnails.reverse();
  for (const thumb of thumbnails) {
    if (typeof thumb.width !== 'number' || typeof thumb.height !== 'number') {
      break;
    }
    if (thumb.width === thumb.height) {
      thumbnail = thumb.url;
      break;
    }
  }

  return thumbnail;
}

export async function fetchPlaylistItems(playlistId: string) {
  const ytDlp = child_process.spawn(YT_DLP_BIN, [
    '--flat-playlist',
    '--dump-json',
    '--no-warnings',
    '--quiet',
    `https://www.youtube.com/playlist?list=${playlistId}`
  ]);

  let data = '';
  ytDlp.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  let error = '';
  ytDlp.stderr.on('data', (chunk) => {
    error += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(error.trim()));
      }
    });
  });

  const lines = data.trim().split('\n');

  const videos = [] as TClientVideo[];
  for (const line of lines) {
    const item = JSON.parse(line.trim());
    const { id: videoId, title, duration, uploader, thumbnails } = item;
    if (
      typeof videoId !== 'string' ||
      typeof title !== 'string' ||
      typeof duration !== 'number' ||
      typeof uploader !== 'string' ||
      !Array.isArray(thumbnails) ||
      thumbnails.length === 0
    ) {
      continue;
    }

    if (title === '[Deleted video]' || title === '[Private video]') {
      continue;
    }

    const thumbnail = parseVideoThumbnail(thumbnails);

    if (typeof thumbnail !== 'string') {
      continue;
    }

    videos.push({ videoId, title, duration, uploader, thumbnail });
  }

  return videos;
}
export async function fetchVideoInfo(videoId: string): Promise<TClientVideo> {
  const ytDlp = child_process.spawn(YT_DLP_BIN, ['--dump-json', '--no-warnings', '--quiet', videoId]);

  let data = '';
  ytDlp.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  let error = '';
  ytDlp.stderr.on('data', (chunk) => {
    error += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(error.trim()));
      }
    });
  });

  const { id, title, duration, uploader, thumbnails } = JSON.parse(data.trim());

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof duration !== 'number' ||
    typeof uploader !== 'string' ||
    !Array.isArray(thumbnails) ||
    thumbnails.length === 0
  ) {
    throw new Error('Failed to fetch video info');
  }

  if (title === '[Deleted video]' || title === '[Private video]') {
    throw new Error('Video is deleted or private');
  }

  const thumbnail = parseVideoThumbnail(thumbnails);

  if (typeof thumbnail !== 'string') {
    throw new Error('Failed to fetch video thumbnail');
  }

  return { videoId: id, title, duration, uploader, thumbnail };
}
