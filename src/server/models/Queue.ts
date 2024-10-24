import crypto from 'crypto';
import mongoose, { type Document, Schema } from 'mongoose';

import type { PlaylistInfoResponse } from '../../shared/types/api.ts';
import { add, clear, move, remove, shuffle } from '../../shared/utils/queue.ts';
import Video, { type IVideo } from './Video';

export interface IQueue extends Document {
  associatedRoom: string;
  playlist: string[];
  currentIndex: number | null;
  latestTimestamp: number;
  hash: string;

  shuffle: () => Promise<string>;
  move: (from: number, to: number) => Promise<void>;
  remove: (index: number) => Promise<void>;
  clear: () => Promise<void>;
  add: (...tracks: IVideo[]) => Promise<void>;

  playlistInfoJSON: () => Promise<PlaylistInfoResponse>;
}

export const QueueSchema = new Schema<IQueue>({
  associatedRoom: { type: String, required: true, unique: true, index: true },
  playlist: { type: [String], default: [] },
  currentIndex: { type: Number, default: null },
  latestTimestamp: { type: Number, default: 0 },
  hash: { type: String, default: crypto.createHash('sha256').update('[]').digest('hex') }
});

QueueSchema.pre('save', function (this: IQueue, next) {
  this.hash = crypto.createHash('sha256').update(JSON.stringify(this.playlist)).digest('hex');

  if (this.playlist.length === 0) {
    this.currentIndex = null;
  }
  if (this.currentIndex !== null && this.currentIndex >= this.playlist.length) {
    this.currentIndex = this.playlist.length - 1;
  }

  next();
});

QueueSchema.methods.shuffle = async function (this: IQueue): Promise<string> {
  const seed = crypto.randomBytes(16).toString('hex'); // the seed to shuffle the queue
  shuffle(this, seed);

  await this.save();

  return seed;
};

QueueSchema.methods.move = async function (this: IQueue, from: number, to: number): Promise<void> {
  move(this, from, to);
  await this.save();
};

QueueSchema.methods.remove = async function (this: IQueue, index: number): Promise<void> {
  remove(this, index);
  await this.save();
};

QueueSchema.methods.clear = async function (this: IQueue): Promise<void> {
  clear(this);
  await this.save();
};

QueueSchema.methods.add = async function (this: IQueue, ...tracks: IVideo[]): Promise<void> {
  add(this, ...tracks);
  await this.save();
};

QueueSchema.methods.playlistInfoJSON = async function (this: IQueue): Promise<PlaylistInfoResponse> {
  const tracks = await Video.find({ videoId: { $in: new Set(this.playlist) } });

  return {
    currentIndex: this.currentIndex,
    timestamp: this.latestTimestamp,
    playlist: this.playlist,
    tracks: tracks.map((track) => [
      track.videoId,
      {
        videoId: track.videoId,
        title: track.title,
        duration: track.duration
      }
    ]),
    hash: this.hash
  };
};

const Queue = mongoose.model<IQueue>('Queue', QueueSchema);

export default Queue;
