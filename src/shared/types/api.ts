import type { TClientTrack } from './track';

export type PlaylistInfoResponse = {
  currentIndex: number | null;
  timestamp: number;
  playlist: string[];
  tracks: [string, TClientTrack][];
  hash: string;
};

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
export type WebSocketMessage = {
  type: 'play' | 'pause' | 'seek' | 'skip' | 'backward' | 'forward' | 'remove' | 'shuffle' | 'move' | 'clear' | 'add' | 'hash';
  hash: string;

  data?: {
    timestamp?: number;
    seed?: string;
    index?: number;
  }
}