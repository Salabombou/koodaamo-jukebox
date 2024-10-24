import type { IQueue } from '../../server/models/Queue.ts';
import type { TClientTrack } from './track.ts';

type WithTracks<B extends boolean> = B extends true ? { tracks: Map<TClientTrack['videoId'], TClientTrack> } : {};

export type TClientQueue<B extends boolean = false> = Pick<IQueue, 'playlist' | 'currentIndex' | 'hash'> &
  WithTracks<B>;
