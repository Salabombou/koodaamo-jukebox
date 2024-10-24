import dotenv from 'dotenv';
import express from 'express';
import http from 'http';

import Room from './models/Room.ts';
import User from './models/User.ts';

import logger from './utils/logger.ts';
import { connectDB } from './utils/mongodb.ts';

dotenv.config();

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('build/client'));
  }

  app.use('/api/auth', (await import('./routes/auth.ts')).default);

  const jukeboxRouter = express.Router();

  jukeboxRouter.use(async (req, res, next) => {
    const instanceId = req.params.instanceId;
    if (typeof instanceId !== 'string') {
      res.status(400).json({ error: 'Invalid instance ID' });
      return;
    }

    const room = await Room.findOne({ roomId: instanceId });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const userId = req.headers['x-user-id'];
    const accessToken = req.headers['x-access-token'];

    if (typeof userId !== 'string' || typeof accessToken !== 'string') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findOne({ userId, accessToken });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
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
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });


}
bootstrap();
