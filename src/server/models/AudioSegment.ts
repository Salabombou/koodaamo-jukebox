import fs from 'fs';
import mongoose, { type Document, Schema } from 'mongoose';
import cron from 'node-cron';

import logger from '../utils/logger';

cron.schedule('* * * * *', async () => {
  const expiredSegments = await AudioSegment.find({ expiresAt: { $lt: new Date() } });

  for (const segment of expiredSegments) {
    await segment.deleteOne();
    if (segment.path) {
      fs.unlink(segment.path, (err) => {
        if (err) {
          logger.error(`Failed to delete audio segment file: ${err}`);
        }
      });
    }
  }
});

export interface IAudioSegment extends Document {
  hash: string;
  url: string;
  path: string | null;
  downloaded: boolean;
  expiresAt: Date;
}

export const AudioSegmentSchema = new Schema<IAudioSegment>({
  hash: { type: String, required: true, unique: true, index: true },
  url: { type: String, required: true },
  path: { type: String, default: null },
  downloaded: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true }
});

const AudioSegment = mongoose.model<IAudioSegment>('AudioSegment', AudioSegmentSchema);

export default AudioSegment;
