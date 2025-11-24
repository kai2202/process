import express from "express";
import { createHash } from "../services/hasher.js";

const router = express.Router();

router.post("/", (req, res, next) => {
  try {
    const { text, label } = req.body;
    if (!text || !label) return res.status(400).json({ error: "Missing text or label" });

    const { raw, hash } = createHash(text, label);
    if (!hash) return res.status(500).json({ error: "Hash generation failed" });

    return res.json({ raw, hash });
  } catch (err) {
    next(err);
  }
});

export default router;
