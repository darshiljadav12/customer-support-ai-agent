import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`✅ MongoDB connected (${mongoose.connection.host})`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
