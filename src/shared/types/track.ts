import type { IVideo } from '../../server/models/Video';

export type TClientTrack = Pick<IVideo, 'videoId' | 'title' | 'duration'>;
