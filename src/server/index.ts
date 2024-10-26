import compression from 'compression';
import dotenv from 'dotenv';
import express from 'express';
import expressWs from 'express-ws';

import Room from './models/Room.ts';
import User from './models/User.ts';

import logger from './utils/logger.ts';
import { connectDB } from './utils/mongodb.ts';

dotenv.config();

async function bootstrap() {
  const app = express();
  expressWs(app);

  app.use(compression());
  app.use(express.json());

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('build/client'));
  }

  app.use('/api/auth', (await import('./routes/auth.ts')).default);

  const jukeboxRouter = express.Router();

  jukeboxRouter.use(async (req, res, next) => {
    const instanceId = req.baseUrl.match(/\/api\/jukebox\/([^\/]+)/)?.[1];
    if (typeof instanceId !== 'string') {
      res.status(400).json({ error: 'Invalid instance ID' });
      return;
    }

    const room = await Room.findOne({ roomId: instanceId });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    let userId: string | undefined;
    let accessToken: string | undefined;

    const isWebSocket = req.headers.upgrade === 'websocket';
    if (isWebSocket) {
      [userId, accessToken] = req.headers['sec-websocket-protocol']?.split(', ') ?? [];
    } else {
      userId = req.headers['x-user-id'] as string;
      accessToken = req.headers['x-access-token'] as string;
    }

    if (typeof userId !== 'string' || typeof accessToken !== 'string') {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    if (typeof userId !== 'string' || typeof accessToken !== 'string') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findOne({ userId, accessToken });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (room.secure !== user.secure) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!room.users.includes(user.userId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.user = user;
    req.room = room;

    next();
  });

  jukeboxRouter.use('/audio', (await import('./routes/audio.ts')).default);
  jukeboxRouter.use('/queue', (await import('./routes/queue.ts')).default);
  jukeboxRouter.use('/room', (await import('./routes/room.ts')).default);

  app.use('/api/jukebox/:instanceId', jukeboxRouter);

  await connectDB();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}
bootstrap();
