// routes/batchOptimized.js
import express from "express";
import PQueue from "p-queue";
import Analysis from "../models/analysis.js";
import { callOpenAI } from "../services/openai.js";
import { createHash } from "../services/hasher.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Config (env fallback)
const CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY || "6", 10);
const INTERVAL_MS = parseInt(process.env.BATCH_INTERVAL_MS || "1000", 10);
const INTERVAL_CAP = parseInt(process.env.BATCH_INTERVAL_CAP || "10", 10);
const RETRY_MAX = parseInt(process.env.BATCH_RETRY_MAX || "3", 10);
const GROUP_SIZE = parseInt(process.env.BATCH_GROUP_SIZE || "5", 10);

const OPENAI_PROMPT =
  process.env.BATCH_OPENAI_PROMPT ||
  'Phân tích cảm xúc từng câu trong danh sách sau. Trả về từng dòng theo định dạng "<index>|<positive|neutral|negative>|<short_reason>".';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retryWithBackoff(fn, attempts = RETRY_MAX) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > attempts) throw err;
      const backoff = Math.pow(2, attempt) * 200 + Math.random() * 100;
      logger.warn(`Retry ${attempt}/${attempts} after ${backoff}ms: ${err.message}`);
      await sleep(backoff);
    }
  }
}

const queue = new PQueue({
  concurrency: CONCURRENCY,
  interval: INTERVAL_MS,
  intervalCap: INTERVAL_CAP,
});

function extractSentimentFromText(text) {
  if (!text) return null;
  const m = text.match(/\b(positive|neutral|negative)\b/i);
  return m ? m[1].toLowerCase() : null;
}

router.post("/", async (req, res, next) => {
  logger.info("BATCH ROUTE RECEIVED");
  try {
    const { reviews } = req.body;
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({ error: "Missing reviews array" });
    }

    const items = reviews
      .map((r, i) => ({ id: i, text: (r.text || "").trim() }))
      .filter((it) => it.text.length > 0);

    const results = new Array(items.length).fill(null);
    const errors = [];

    // group items
    const groups = [];
    for (let i = 0; i < items.length; i += GROUP_SIZE) {
      groups.push(items.slice(i, i + GROUP_SIZE));
    }

    logger.info(`PROCESS ${groups.length} GROUP(S), total items=${items.length}`);

    const tasks = groups.map((group, gIdx) =>
      queue.add(async () => {
        logger.info(`PROCESS GROUP ${gIdx}, size=${group.length}`);
        const listText = group
          .map((it, localIdx) => `${localIdx}: ${it.text.replace(/\n/g, " ")}`)
          .join("\n");

        const prompt = `${OPENAI_PROMPT}\n\n${listText}`;
        logger.info(`PROMPT GROUP ${gIdx}:\n${prompt}`);

        let responseText;
        try {
          responseText = await retryWithBackoff(() => callOpenAI(prompt));
        } catch (err) {
          logger.error("OpenAI group error: " + err.message);
          group.forEach((it) => {
            results[it.id] = { success: false, error: err.message };
            errors.push({ idx: it.id, message: err.message });
          });
          return;
        }

        const rawResponse = "" + (responseText || "");
        logger.info(`OUTPUT GROUP ${gIdx} RAW:\n${rawResponse}`);

        const lines = rawResponse
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        // keep track of which local indexes have been assigned
        const assignedLocal = new Set();

        // first pass: explicit numbered lines like "0|positive|..."
        lines.forEach((line) => {
          // pattern: index | sentiment
          const m = line.match(/^\s*(\d+)\s*\|\s*(positive|neutral|negative)\b/i);
          if (m) {
            const localIdx = parseInt(m[1], 10);
            const sentiment = m[2].toLowerCase();
            const it = group[localIdx];
            if (!it) return;
            assignedLocal.add(localIdx);
            const { raw, hash } = createHash(it.text, sentiment);
            results[it.id] = {
              success: true,
              hash,
              raw,
              sentiment,
              docOp: {
                updateOne: {
                  filter: { hash },
                  update: {
                    $set: { text: it.text, sentiment, hash, raw },
                    $setOnInsert: { createdAt: new Date() },
                  },
                  upsert: true,
                },
              },
            };
          }
        });

        // second pass: lines that contain only a sentiment word or sentiment somewhere
        // assign sequentially to unassigned items in group order
        const unassignedLocalIdxs = group
          .map((_, i) => i)
          .filter((i) => !assignedLocal.has(i));

        let seqPointer = 0;
        lines.forEach((line) => {
          // if already matched explicit index, skip
          if (/^\s*(\d+)\s*\|/i.test(line)) return;

          const sentiment = extractSentimentFromText(line);
          if (!sentiment) return;

          // find next unassigned local index
          while (seqPointer < unassignedLocalIdxs.length) {
            const localIdx = unassignedLocalIdxs[seqPointer];
            seqPointer++;
            if (!assignedLocal.has(localIdx)) {
              // assign here
              const it = group[localIdx];
              if (!it) continue;
              assignedLocal.add(localIdx);
              const { raw, hash } = createHash(it.text, sentiment);
              results[it.id] = {
                success: true,
                hash,
                raw,
                sentiment,
                docOp: {
                  updateOne: {
                    filter: { hash },
                    update: {
                      $set: { text: it.text, sentiment, hash, raw },
                      $setOnInsert: { createdAt: new Date() },
                    },
                    upsert: true,
                  },
                },
              };
              break;
            }
          }
        });

        // finalize: any still unassigned => mark failed (no classification returned)
        group.forEach((it, localIdx) => {
          if (!assignedLocal.has(localIdx)) {
            results[it.id] = { success: false, error: "No classification returned for item" };
            errors.push({ idx: it.id, message: "No classification returned for item" });
          }
        });

        // log summary for group
        logger.info(`OUTPUT GROUP ${gIdx} processed. assigned=${[...assignedLocal].length}`);
      })
    );

    await Promise.all(tasks);

    // Build bulk ops and write
    const bulkOps = results.filter((r) => r && r.success && r.docOp).map((r) => r.docOp);
    if (bulkOps.length > 0) {
      await Analysis.bulkWrite(bulkOps, { ordered: false });
      logger.info(`BULK WRITE executed, ops=${bulkOps.length}`);
    } else {
      logger.info("No bulk ops to write");
    }

    const succeeded = results.filter((r) => r && r.success).length;
    const failed = results.filter((r) => r && !r.success).length;
    const samples = results
      .filter((r) => r && r.success)
      .slice(0, 20)
      .map((r) => ({ hash: r.hash, sentiment: r.sentiment, raw: r.raw }));

    return res.json({ status: "ok", total: items.length, succeeded, failed, errors, samples });
  } catch (err) {
    next(err);
  }
});

export default router;
