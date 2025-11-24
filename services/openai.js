import axios from "axios";
import { queue } from "./queue.js";
import { logger } from "../utils/logger.js";

export async function callOpenAI(prompt) {
  return queue.add(async () => {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/responses",
        { model: "gpt-4o-mini", input: prompt },
        {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      const data = response.data || {};
      let textOut = data.output_text || null;

      if (!textOut && Array.isArray(data.output)) {
        const first = data.output[0];
        if (typeof first === "string") textOut = first;
        else if (first.text) textOut = first.text;
        else if (Array.isArray(first.content)) {
          textOut = first.content.map(c => c.text || c).join("");
        }
      }

      if (!textOut) throw new Error("Unexpected OpenAI output");
      const label = textOut.toLowerCase().match(/\b(positive|neutral|negative)\b/);
      return label ? label[0] : "neutral";

    } catch (err) {
      logger.error("OpenAI error: " + (err.response?.status || err.message));
      throw err;
    }
  });
}
