import mongoose from "mongoose";
const { Schema, model } = mongoose;

const AnalysisSchema = new Schema({
  text: { type: String, required: true },

  sentiment: {
    type: String,
    enum: ["positive", "neutral", "negative"],
    required: true
  },

  hash: {
    type: String,
    required: true,
    unique: true,              // Mỗi hash = duy nhất → chống trùng
    index: true
  },

  raw: { type: String, required: true },     // text|sentiment

  // để sau này làm blockchain
  blockchainTx: { type: String, default: null },     // tx hash
  blockchainStatus: {
    type: String,
    enum: ["pending", "confirmed", "failed", null],
    default: null
  },

  // metadata cho UI dashboard
  source: { type: String, default: "web" },          // web / crawler / api
  user: { type: String, default: null },             // userId nếu có login
  productId: { type: String, default: null },        // để lọc theo sản phẩm
  language: { type: String, default: "vi" },

  createdAt: { type: Date, default: Date.now }
});

export default model("Analysis", AnalysisSchema);
