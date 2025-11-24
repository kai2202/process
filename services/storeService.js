import Analysis from "../models/analysis.js";

export async function saveAnalysis({ text, sentiment, hash, raw, source, productId, user }) {
  return Analysis.findOneAndUpdate(
    { hash },
    {
      text,
      sentiment,
      hash,
      raw,
      source: source || "web",
      productId: productId || null,
      user: user || null,
    },
    { upsert: true, new: true }
  );
}
