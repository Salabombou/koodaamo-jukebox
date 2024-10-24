import express from 'express';

import Queue from '../models/Queue';
import Video from '../models/Video';

import { fetchPlaylistItems, fetchVideoInfo, parseVideoPlaylistId } from '../utils/youtube';

const router = express.Router();

router.use(async (req, res, next) => {
  const queue = await Queue.findOneAndUpdate(
    { associatedRoom: req.room.roomId },
    { associatedRoom: req.room.roomId },
    { upsert: true }
  );
  if (!queue) {
    res.status(404).json({ error: 'Queue not found' });
    return;
  }

  req.queue = queue;

  next();
});

router.post('/add', async (req, res) => {
  let { query } = req.body;
  if (typeof query !== 'string') {
    res.status(400).json({ error: 'Invalid query' });
    return;
  }

  const [id, type] = parseVideoPlaylistId(query.trim());

  if (type === 'playlist') {
    for await (const item of fetchPlaylistItems(id)) {
      await Video.findOneAndUpdate({ videoId: item.videoId }, item, { upsert: true });
      req.queue.playlist.push(item.videoId);
    }
  } else {
    const video = await fetchVideoInfo(id);
    await Video.findOneAndUpdate({ videoId: video.videoId }, video, { upsert: true });
    req.queue.playlist.push(video.videoId);
  }

  await req.queue.save();
});
router.delete('/remove', (req, res) => {});
router.get('/info', (req, res) => {});
router.get('/track/:index', (req, res) => {});

export default router;
