import express from "express";
import pool from "../db/index.js";

const router = express.Router();

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

router.get("/", (req, res) => {
  res.json({ message: "hi lol" });
});

router.get("/open/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
    if (job.rows.length > 0) {
      await pool.query(
        `
            INSERT INTO email_events (job_id, tenant_id, type, ip, user_agent)
            VALUES ($1, $2, 'open', $3, $4)`,
        [
          jobId,
          job.rows[0].tenant_id,
          req.ip,
          req.headers["user-agent"] || null,
        ],
      );

      await pool.query(
        `
        UPDATE jobs SET opens = opens + 1 WHERE id = $1`,
        [jobId],
      );
    }
  } catch (err) {
    console.error("Open tracking error:", err.message);
  }

  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
  res.send(PIXEL);
});

router.get("/click/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const { url } = req.query;

  if (!url) return res.redirect("/");

  try {
    await pool.query(
      `
            INSERT INTO email_events (job_id, tenant_id, type, url, ip, user_agent)
            VALUES ($1, $2, 'open', $3, $4, $5)`,
      [
        jobId,
        job.rows[0].tenant_id,
        url,
        req.ip,
        req.headers["user-agent"] || null,
      ],
    );

    await pool.query(`UPDATE jobs SET clicks = clicks + 1 WHERE id = $1`, [
      jobId,
    ]);
  } catch (err) {
    console.error("Click tracking error:", err.message);
  }
  res.redirect(url);
});

router.get("/events/:jobId", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM email_events WHERE job_id = $1 ORDER BY created_at DESC`,
      [req.params.jobId],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
