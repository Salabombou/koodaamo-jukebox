import mongoose, { type Document, Schema } from 'mongoose';

export interface IRoom extends Document {
  roomId: string;
  users: string[];
  secure: boolean;
}

export const RoomSchema = new Schema<IRoom>({
  roomId: { type: String, required: true, unique: true, index: true },
  users: { type: [String], default: [] },
  secure: { type: Boolean, required: true }
});

const Room = mongoose.model<IRoom>('Room', RoomSchema);

export default Room;
