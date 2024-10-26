import express from 'express';

import Queue from '../models/Queue';
import Video from '../models/Video';

import logger from '../utils/logger';
import { fetchPlaylistItems, fetchVideoInfo, parseVideoPlaylistId } from '../utils/youtube';

const router = express.Router();

router.get('/info', async (req, res) => {
  const queue = await Queue.findOne({ associatedRoom: req.room.roomId });
  if (!queue) {
    res.status(404).json({ error: 'Queue not found' });
    return;
  }

  const response = await queue.playlistInfoJSON();
  res.json(response);
});

router.get('/video/:index', async (req, res) => {
  const index = parseInt(req.params.index, 10);
  if (isNaN(index)) {
    res.status(400).json({ error: 'Invalid index' });
    return;
  }

  const queue = await Queue.findOne({ associatedRoom: req.room.roomId });
  if (!queue) {
    res.status(404).json({ error: 'Queue not found' });
    return;
  }

  if (index < 0 || index >= queue.playlist.length) {
    res.status(404).json({ error: 'Index out of bounds' });
    return;
  }

  const videoId = queue.playlist[index]!;
  const video = await Video.findOne({ videoId });
  if (!video) {
    logger.warn(`Video not found: ${videoId}`);
    res.status(500).json({ error: 'Video not found' });
    return;
  }
  res.json();
});

export default router;
