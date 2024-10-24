import fs from 'fs';
import mongoose, { type Document, Schema } from 'mongoose';
import cron from 'node-cron';

import logger from '../utils/logger';

cron.schedule('* * * * *', async () => {
  const expiredPlaylists = await AudioPlaylist.find({ expiresAt: { $lt: new Date() } });

  for (const playlist of expiredPlaylists) {
    await playlist.deleteOne();
    if (playlist.path) {
      fs.unlink(playlist.path, (err) => {
        if (err) {
          logger.error(`Failed to delete audio playlist file: ${err}`);
        }
      });
    }
  }
});

export interface IAudioPlaylist extends Document {
  videoId: string;
  url: string;
  path: string;
  expiresAt: Date;
}

export const AudioPlaylistSchema = new Schema<IAudioPlaylist>({
  videoId: { type: String, required: true, unique: true, index: true },
  url: { type: String, required: true },
  path: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

const AudioPlaylist = mongoose.model<IAudioPlaylist>('AudioPlaylist', AudioPlaylistSchema);

export default AudioPlaylist;
