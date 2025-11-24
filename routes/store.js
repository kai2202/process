import express from "express";
import { saveAnalysis } from "../services/storeService.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const { text, sentiment, hash, raw, source, productId, user } = req.body;

    if (!hash || !sentiment || !raw)
      return res.status(400).json({ error: "Missing required fields" });

    const saved = await saveAnalysis({
      text,
      sentiment,
      hash,
      raw,
      source,
      productId,
      user
    });

    return res.json({ status: "ok", data: saved });

  } catch (err) {
    next(err);
  }
});

export default router;
