import { timingSafeEqual } from "node:crypto";
import { database } from "../server/everest-store.mjs";
import { createSource, runWorker } from "../server/everest-sync.mjs";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization;
  const expected =
    process.env.EVEREST_WORKER_TOKEN &&
    `Bearer ${process.env.EVEREST_WORKER_TOKEN}`;
  if (
    req.method !== "POST" ||
    !expected ||
    typeof token !== "string" ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return res.status(401).json({ error: "Unauthorized" });
  try {
    return res
      .status(200)
      .json(
        await runWorker({
          db: database(),
          source: createSource(),
          environment: process.env.EVEREST_ENVIRONMENT || "production",
        }),
      );
  } catch {
    return res.status(503).json({ error: "Worker unavailable" });
  }
}
