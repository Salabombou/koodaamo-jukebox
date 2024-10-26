import express from 'express';
import type { WebSocket } from 'ws';

import Queue from '../models/Queue';
import Room from '../models/Room';
import User from '../models/User';
import Video from '../models/Video';

import logger from '../utils/logger';
import { fetchPlaylistItems, fetchVideoInfo, parseVideoPlaylistId } from '../utils/youtube';
import { ERoomCloseCode } from '../../shared/enums/room';

import type { TRoomEvent, TRoomMessage, TRoomMessageData } from '../../shared/types/room';

const router = express.Router();

const connections = new Map<string, Map<string, WebSocket>>();

async function broadcast(roomId: string, eventName: TRoomEvent, data: TRoomMessageData) {
  const roomConnections = connections.get(roomId);
  if (!roomConnections) {
    return;
  }

  const queue = await Queue.findOne({ associatedRoom: roomId });
  if (!queue) {
    logger.warn(`Queue not found for room ${roomId}`);
    return;
  }

  const hash = queue.hash;
  const sentAt = Date.now();

  const messageBody: TRoomMessage = { eventName, data, hash, sentAt };
  const message = JSON.stringify(messageBody);

  for (const ws of roomConnections.values()) {
    ws.send(message);
  }
}

router.ws('', (ws, req) => {
  const roomId = req.room.roomId;
  const userId = req.user.userId;

  if (!connections.has(roomId)) {
    connections.set(roomId, new Map());
  } else if (connections.get(roomId)!.has(userId)) {
    connections.get(roomId)!.get(userId)!.close(ERoomCloseCode.DuplicateConnection, 'Duplicate connection');
  }

  connections.get(req.room.roomId)!.set(req.user.userId, ws);

  const latestMessage = {} as Record<TRoomEvent, number>;
  ws.on('message', async (msg) => {
    const message = msg.toString();
    if (message === 'ping') {
      ws.send('pong');
      return;
    }

    const { eventName, data, hash, sentAt }: TRoomMessage = JSON.parse(message);

    if (
      typeof eventName !== 'string' ||
      typeof data !== 'object' ||
      typeof hash !== 'string' ||
      typeof sentAt !== 'number'
    ) {
      ws.close(ERoomCloseCode.InvalidMessage, 'Invalid message');
    }

    if (sentAt < (latestMessage[eventName] ?? -Infinity)) {
      return;
    }
    latestMessage[eventName] = sentAt;

    const currentHash = (await Queue.findOne({ associatedRoom: req.room.roomId }))?.hash;
    if (!currentHash) {
      logger.warn(`Queue not found for room ${req.room.roomId}`);
      ws.close(ERoomCloseCode.InvalidRoom, 'Invalid room');
      return;
    }

    if (hash !== currentHash) {
      const hashMessage: TRoomMessage = {
        eventName: 'hash',
        hash: currentHash,
        sentAt: Date.now(),
        data: {}
      };
      ws.send(JSON.stringify(hashMessage));
      return;
    }

    logger.debug(`Received message: ${eventName}`);
    logger.debug(`From: ${req.user.userId}`);

    switch (eventName) {
      case 'play':
      case 'pause':
      case 'backward':
      case 'forward':
      case 'clear':
      case 'hash':
        await broadcast(req.room.roomId, eventName, {});
        break;
      case 'seek':
        if (typeof data.timestamp !== 'number') {
          ws.close(ERoomCloseCode.InvalidParameters, 'Invalid parameters');
          return;
        }
        await broadcast(req.room.roomId, 'seek', { timestamp: data.timestamp });
        break;
      case 'skip':
      case 'remove':
        if (typeof data.index !== 'number') {
          ws.close(ERoomCloseCode.InvalidParameters, 'Invalid parameters');
          return;
        }
        await broadcast(req.room.roomId, eventName, { index: data.index });
        break;
      case 'add':
        if (typeof data.query !== 'string') {
          ws.close(ERoomCloseCode.InvalidParameters, 'Invalid parameters');
          return;
        }

        const [id, type] = parseVideoPlaylistId(data.query.trim()) ?? [];
        if (!id || !type) {
          ws.close(ERoomCloseCode.InvalidParameters, 'Invalid parameters');
          return;
        }

        if (type === 'playlist') {
          const videos = await fetchPlaylistItems(id);
          for (const video of videos) {
            await Video.findOneAndUpdate({ videoId: video.videoId }, video, { upsert: true });
          }

          await Queue.findOneAndUpdate(
            { associatedRoom: req.room.roomId },
            { $push: { playlist: { $each: videos.map((v) => v.videoId) } } },
            { upsert: true }
          );

          await broadcast(req.room.roomId, 'add', {}); // have the client fetch the playlist
        } else {
          const video = await fetchVideoInfo(id);
          await Video.findOneAndUpdate({ videoId: video.videoId }, video, { upsert: true });

          await Queue.findOneAndUpdate(
            { associatedRoom: req.room.roomId },
            { $push: { playlist: video.videoId } },
            { upsert: true }
          );

          await broadcast(req.room.roomId, 'add', {
            video
          });
        }
        break;
      case 'shuffle': {
        const queue = await Queue.findOne({ associatedRoom: req.room.roomId });
        if (!queue) {
          logger.warn(`Queue not found for room ${req.room.roomId}`);
          ws.close(ERoomCloseCode.InvalidRoom, 'Invalid room');
          break;
        }

        const seed = await queue.shuffle();

        await broadcast(req.room.roomId, 'shuffle', { seed });
        break;
      }
      case 'move': {
        if (typeof data.from !== 'number' || typeof data.to !== 'number') {
          ws.close(ERoomCloseCode.InvalidParameters, 'Invalid parameters');
          return;
        }

        const queue = await Queue.findOne({ associatedRoom: req.room.roomId });
        if (!queue) {
          logger.warn(`Queue not found for room ${req.room.roomId}`);
          ws.close(ERoomCloseCode.InvalidRoom, 'Invalid room');
          break;
        }

        await queue.move(data.from, data.to);

        await broadcast(req.room.roomId, 'move', { from: data.from, to: data.to });
        break;
      }
    }
  });

  ws.on('error', (err) => {
    logger.error(err);
    ws.close(ERoomCloseCode.InternalError, 'Internal error');
  });

  ws.on('close', async () => {
    connections.get(req.room.roomId)!.delete(req.user.userId);
    await User.updateOne({ userId: req.user.userId }, { connected: false });
  });
});

export default router;
