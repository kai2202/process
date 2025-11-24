import express from "express";
import { callOpenAI } from "../services/openai.js";
import { createHash } from "../services/hasher.js";
import Analysis from "../models/analysis.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const label = await callOpenAI(
      `Phân tích cảm xúc của câu này và trả về CHỈ 1 từ: positive, neutral hoặc negative.\nCâu: "${text}"`
    );

    // --- tạo raw + hash chuẩn ---
    const { raw, hash } = createHash(text, label);

    // --- lưu DB ---
    await Analysis.findOneAndUpdate(
      { hash },
      { text, sentiment: label, hash, raw },
      { upsert: true, new: true }
    );

    if (!hash) throw new Error("Hash generation failed");
    logger.info(`saved hash ${hash.slice(0, 8)}...`);
    return res.json({ text, sentiment: label, hash, raw });

  } catch (err) {
    next(err);
  }
});

export default router;
