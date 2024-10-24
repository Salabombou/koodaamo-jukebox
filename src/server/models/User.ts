import mongoose, { type Document, Schema } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  accessToken: string;
  secure: boolean;
  connected: boolean;
  associatedRoom: string | null;
}

export const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true, index: true },
  accessToken: { type: String, required: true },
  secure: { type: Boolean, required: true },
  connected: { type: Boolean, default: false },
  associatedRoom: { type: String, default: null }
});

const User = mongoose.model<IUser>('User', UserSchema);

export default User;
