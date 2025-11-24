import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import sentimentRouter from "./routes/sentiment.js";
import analyzeRouter from "./routes/analyze.js";
import hashRouter from "./routes/hash.js";
import { logger } from "./utils/logger.js";
import storeRouter from "./routes/store.js";
import batchOptimizedRouter from "./routes/batchOptimized.js";

dotenv.config();

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Connect MongoDB
await connectDB();

// Routes
app.use("/ai/sentiment-remote", sentimentRouter);
app.use("/ai/analyze", analyzeRouter);
app.use("/ai/hash", hashRouter);
app.use("/ai/store", storeRouter);
app.use("/ai/batch", batchOptimizedRouter);

// Health check
app.get("/", (req, res) => res.json({ status: "AI backend running" }));

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: "Internal Server Error", detail: err.message });
});

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
