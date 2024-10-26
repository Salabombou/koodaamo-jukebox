import type { TClientVideo } from './video';

export type PlaylistInfoResponse = {
  currentIndex: number | null;
  timestamp: number;
  playlist: string[];
  videos: [string, TClientVideo][];
  hash: string;
};
