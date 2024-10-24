import child_process from 'child_process';

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

export function parseVideoPlaylistId(input: string): [string, 'video' | 'playlist'] {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return [`ytsearch1:${input}`, 'video'];
  }

  if (url.hostname === 'youtu.be') {
    const videoId = url.pathname.slice(1);
    if (!videoIdPattern.test(videoId)) {
      throw new Error('Invalid video ID');
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
          throw new Error('Invalid video ID');
        }
        return [videoId, 'video'];
      } else if (listId) {
        if (!playlistIdPattern.test(listId)) {
          throw new Error('Invalid playlist ID');
        }
        return [listId, 'playlist'];
      }
  }

  throw new Error('Invalid URL');
}

export async function* fetchPlaylistItems(playlistId: string) {
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

  for (const line of lines) {
    const { id: videoId, title, duration, uploader } = JSON.parse(line.trim());

    if (!videoId || !title || !duration || !uploader) {
      continue;
    }

    if (title === '[Deleted video]' || title === '[Private video]') {
      continue;
    }

    yield { videoId, title, duration, uploader };
  }
}
export async function fetchVideoInfo(videoId: string) {
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

  const { id, title, duration, uploader } = JSON.parse(data.trim());

  if (!id || !title || !duration || !uploader) {
    throw new Error('Failed to fetch video info');
  }

  if (title === '[Deleted video]' || title === '[Private video]') {
    throw new Error('Video is deleted or private');
  }

  return { videoId: id, title, duration, uploader };
}
