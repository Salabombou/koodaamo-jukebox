import type { IQueue } from '../../server/models/Queue.ts';
import type { TClientVideo } from './video.ts';

type WithVideos<B extends boolean> = B extends true ? { videos: Map<TClientVideo['videoId'], TClientVideo> } : {};

export type TClientQueue<B extends boolean = false> = Pick<IQueue, 'playlist' | 'currentIndex' | 'hash'> &
  WithVideos<B>;
