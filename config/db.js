// config/db.js
import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error("MONGO_URI is missing. Aborting start.");
    process.exit(1); // BẮT BUỘC: không cho server chạy khi không có URI
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000
    });
    logger.info("MongoDB connected successfully");
  } catch (err) {
    logger.error("MongoDB connection error: " + err.message);
    process.exit(1); // BẮT BUỘC: dừng process nếu không connect được
  }
}
