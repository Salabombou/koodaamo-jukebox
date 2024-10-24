import mongoose from 'mongoose';

import logger from './logger.ts';

export async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined');
    }
    await mongoose.connect(uri, {});
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}
