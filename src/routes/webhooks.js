import express from "express";
import crypto from "crypto";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
            SELECT id, url, events, active, created_at FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  const { url, events } = req.body;

  if (!url) {
    return res.status(400).json({
      error: "URL is required",
    });
  }

  try {
    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    const result = await pool.query(
      `INSERT INTO webhooks (tenant_id, url, secret, events)
        VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, url, secret, events || ["email.sent", "email.failed"]],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      req.tenant.id,
    ]);
    res.json({ message: "Webhook deleted" });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/:id/deliveries", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
            SELECT wd.* FROM webhook_deliveries wd
            JOIN webhooks w ON w.id = wd.webhook_id
            WHERE wd.webhook_id = $1 AND w.tenant_id = $2
            ORDER BY wd.created_at DESC LIMIT 20`,
      [req.params.id, req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
export default router;
