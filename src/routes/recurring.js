import express from "express";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  const { to, subject, body, cron } = req.body;

  if (!to || !subject || !body || !cron) {
    return res
      .status(400)
      .json({ error: "to, subject, body, cron are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO recurring_jobs (tenant_id, type, payload, cron)
       VALUES ($1, 'email', $2, $3) RETURNING *`,
      [req.tenant.id, { to, subject, body }, cron],
    );
    res
      .status(201)
      .json({ message: "Recurring job created", job: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM recurring_jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE recurring_jobs SET active = false WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
    res.json({ message: "Recurring job cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
