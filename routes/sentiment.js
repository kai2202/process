import express from "express";
import { callOpenAI } from "../services/openai.js";

const router = express.Router();

router.post("/sentiment-remote", async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const label = await callOpenAI(
      `Phân tích cảm xúc của câu này và trả về CHỈ 1 từ: positive, neutral hoặc negative.\nCâu: "${text}"`
    );

    return res.json({ text, sentiment: label });
  } catch (err) {
    next(err);
  }
});

export default router;
