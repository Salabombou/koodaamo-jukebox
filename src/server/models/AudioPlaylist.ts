import mongoose, { type Document, Schema } from 'mongoose';
import cron from 'node-cron';

cron.schedule('* * * * *', async () => {
  await AudioPlaylist.deleteMany({ expiresAt: { $lt: new Date() } });
});

export interface IAudioPlaylist extends Document {
  videoId: string;
  url: string;
  data: Buffer;
  expiresAt: Date;
}

export const AudioPlaylistSchema = new Schema<IAudioPlaylist>({
  videoId: { type: String, required: true, unique: true, index: true },
  url: { type: String, required: true },
  data: { type: Buffer, required: true },
  expiresAt: { type: Date, required: true }
});

const AudioPlaylist = mongoose.model<IAudioPlaylist>('AudioPlaylist', AudioPlaylistSchema);

export default AudioPlaylist;
