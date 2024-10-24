import type { Request } from 'express';
import type { WebSocket } from 'ws';

import type { IQueue } from '../models/Queue';
import type { IRoom } from '../models/Room';
import type { IUser } from '../models/User';

declare module 'express-serve-static-core' {
  interface Request {
    user: IUser;
    room: IRoom;
    queue: IQueue;
    connections: Map<string, WebSocket[]>;
  }
}
