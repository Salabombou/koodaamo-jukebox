import { Mutex } from 'async-mutex';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';

import AudioPlaylist from '../models/AudioPlaylist';
import AudioSegment from '../models/AudioSegment';
import Queue from '../models/Queue';

import logger from '../utils/logger';
import { getAudioPlaylistUrl, parseExpirationDate } from '../utils/youtube';

const router = express.Router();

const STATIC_PATH = process.env.STATIC_PATH || '/tmp/media';
fs.mkdirSync(STATIC_PATH, { recursive: true });

const playlistDownloadMutex = new Mutex();
router.get('/:videoId/.m3u8', async (req, res) => {
  const { videoId } = req.params;
  const roomId = req.room.roomId;

  const queue = await Queue.findOne({ associatedRoom: roomId });
  if (!queue) {
    res.status(404).json({ error: 'Queue not found' });
    return;
  }

  if (!queue.playlist.includes(videoId)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  await playlistDownloadMutex.runExclusive(async () => {
    let playlist = await AudioPlaylist.findOne({ videoId: videoId });

    if (!playlist) {
      try {
        playlist = new AudioPlaylist({ videoId: videoId });

        playlist.url = await getAudioPlaylistUrl(videoId);
        playlist.path = `${STATIC_PATH}/${playlist.videoId}.m3u8`;
        playlist.expiresAt = parseExpirationDate(playlist.url);

        await fetch(playlist.url)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to fetch audio playlist');
            }

            return (await response.text()).split('\n').map((l) => l.trim());
          })
          .then(async (playlistLines) => {
            for (let i = 0; i < playlistLines.length; i++) {
              const line = playlistLines[i]!;

              if (line.startsWith('#')) {
                continue;
              }

              let url: string;
              try {
                url = new URL(line).toString();
              } catch {
                continue;
              }

              const urlHash = crypto.createHash('sha256').update(url).digest('hex');
              if (!(await AudioSegment.exists({ hash: urlHash }))) {
                await AudioSegment.create({ hash: urlHash, url, expiresAt: parseExpirationDate(url) });
              }

              playlistLines[i] = urlHash + '.ts';
            }

            await fs.promises.writeFile(playlist!.path, playlistLines.join('\n'));
          });

        await playlist.save();
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audio playlist' });
        logger.error(error);
        return;
      }
    }

    res.status(200).sendFile(playlist.path);
  });
});

const segmentDownloadMutexes = new Map<string, Mutex>();
router.get('/:videoId/:segmentUrlHash.ts', async (req, res) => {
  const { videoId, segmentUrlHash } = req.params;
  const roomId = req.room.roomId;

  const queue = await Queue.findOne({ associatedRoom: roomId });
  if (!queue) {
    res.status(404).json({ error: 'Queue not found' });
    return;
  }

  if (!queue.playlist.includes(videoId)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const segment = await AudioSegment.findOne({ hash: segmentUrlHash });
  if (!segment) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }

  if (!segment.downloaded && !segmentDownloadMutexes.has(segmentUrlHash)) {
    segmentDownloadMutexes.set(segmentUrlHash, new Mutex());
  }

  await segmentDownloadMutexes.get(segmentUrlHash)?.runExclusive(async () => {
    if (segment.downloaded) return;

    try {
      await fetch(segment.url).then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error('Failed to fetch audio segment');
        }

        segment.path = `${STATIC_PATH}/${segment.hash}.ts`;

        await fs.promises.writeFile(`/tmp/${segment.hash}.ts`, response.body);
        await fs.promises.rename(`/tmp/${segment.hash}.ts`, segment.path!);
      });

      segment.downloaded = true;
      await segment.save();
    } catch {
      res.status(500).json({ error: 'Failed to fetch audio segment' });
      return;
    }
  });
  segmentDownloadMutexes.delete(segmentUrlHash);

  res.status(200).sendFile(segment.path!);
});

export default router;
