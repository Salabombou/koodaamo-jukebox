import type { IVideo } from '../../server/models/Video';

export type TClientVideo = Pick<IVideo, 'videoId' | 'title' | 'duration' | 'uploader'>;
