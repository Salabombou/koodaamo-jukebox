/**
 * play: -
 * pause: -
 * seek: { timestamp: number }
 * skip: { index: number }
 * backward: { index: number }
 * forward: { index: number }
 * remove: { index: number }
 * shuffle: { seed: string }
 * move: { from: number, to: number }
 * clear: -
 * add: -
 * hash: -
 */
import type { TClientVideo } from './video';

export type TRoomEvent =
  | 'play'
  | 'pause'
  | 'seek'
  | 'skip'
  | 'backward'
  | 'forward'
  | 'remove'
  | 'shuffle'
  | 'move'
  | 'clear'
  | 'add'
  | 'hash';

export type TRoomMessageData = {
  timestamp?: number; // server & client
  seed?: string; // server
  index?: number; // server & client
  query?: string; // client
  from?: number; // server & client
  to?: number; // server & client
  video?: TClientVideo; // server
};

export type TRoomMessage = {
  eventName: TRoomEvent;
  hash: string;
  data: TRoomMessageData;
  sentAt: number;
};
