import mongoose, { type Document, Schema } from 'mongoose';
import cron from 'node-cron';

cron.schedule('* * * * *', async () => {
  await AudioSegment.deleteMany({ expiresAt: { $lt: new Date() } });
});

export interface IAudioSegment extends Document {
  urlHash: string;
  url: string;
  downloaded: boolean;
  data: Buffer | null;
  expiresAt: Date;
}

export const AudioSegmentSchema = new Schema<IAudioSegment>({
  urlHash: { type: String, required: true, unique: true, index: true },
  url: { type: String, required: true },
  downloaded: { type: Boolean, default: false },
  data: { type: Buffer, default: null },
  expiresAt: { type: Date, required: true }
});

const AudioSegment = mongoose.model<IAudioSegment>('AudioSegment', AudioSegmentSchema);

export default AudioSegment;
