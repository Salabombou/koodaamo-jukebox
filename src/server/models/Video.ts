import mongoose, { type Document, Schema } from 'mongoose';

export interface IVideo extends Document {
  videoId: string;
  title: string;
  duration: number;
  uploader: string;
  thumbnail: string;
  downloadUrl: string | null;
}

export const VideoSchema = new Schema<IVideo>({
  videoId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  duration: { type: Number, required: true },
  uploader: { type: String, required: true },
  thumbnail: { type: String, required: true },
  downloadUrl: { type: String, default: null }
});

const Video = mongoose.model<IVideo>('Video', VideoSchema);

export default Video;
