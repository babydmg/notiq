import express from "express";
import bcrypt from "bcrypt";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, plan, api_key, from_email_custom, from_name, created_at FROM tenants WHERE id = $1`,
      [req.tenant.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.put("/profile", auth, async (req, res) => {
  const { name, fromName } = req.body;

  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const result = await pool.query(
      `
          UPDATE tenants SET name = $1, from_name = $2 WHERE id = $3
          RETURNING id, name, email, plan, api_key, from_name`,
      [name, fromName || name, req.tenant.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.put("/email", auth, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and current password are required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT password FROM tenants WHERE id = $1`,
      [req.tenant.id],
    );
    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (!valid)
      return res.status(401).json({
        error: "Incorrect password",
      });
    const existing = await pool.query(
      `SELECT id FROM tenants WHERE email = $1 AND id != $2`,
      [email, req.tenant.id],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Email already in use",
      });
    }

    await pool.query(`UPDATE tenants SET email = $1 WHERE id = $2`, [
      email,
      req.tenant.id,
    ]);
    res.json({ message: "Email updated successfully" });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.put("/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current and new password are required" });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters" });
  }

  try {
    const result = await pool.query(
      `SELECT password FROM tenants WHERE id = $1`,
      [req.tenant.id],
    );

    const valid = await bcrypt.compare(
      currentPassword,
      result.rows[0].password,
    );
    if (!valid)
      return res.status(401).json({ error: "Incorrect current password" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE tenants SET password = $1 WHERE id = $2`, [
      hashed,
      req.tenant.id,
    ]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/regenerate-key", auth, async (req, res) => {
  try {
    const crypto = await import("crypto");
    const newKey = `nfq_${crypto.randomBytes(32).toString("hex")}`;

    await pool.query(`UPDATE tenants SET api_key = $1 WHERE id = $2`, [
      newKey,
      req.tenant.id,
    ]);
    res.json({ api_key: newKey });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/onboarding", auth, async (req, res) => {
  try {
    const [contacts, templates, jobs, domains] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM contacts WHERE tenant_id = $1`, [
        req.tenant.id,
      ]),
      pool.query(`SELECT COUNT(*) FROM templates WHERE tenant_id = $1`, [
        req.tenant.id,
      ]),
      pool.query(`SELECT COUNT(*) FROM jobs WHERE tenant_id = $1`, [
        req.tenant.id,
      ]),
      pool.query(
        `SELECT COUNT(*) FROM domains WHERE tenant_id = $1 AND status = 'verified'`,
        [req.tenant.id],
      ),
    ]);

    const steps = {
      hasContacts: parseInt(contacts.rows[0].count) > 0,
      hasTemplate: parseInt(templates.rows[0].count) > 0,
      hasSentEmail: parseInt(jobs.rows[0].count) > 0,
      hasDomain: parseInt(domains.rows[0].count) > 0,
    };

    const completedCount = Object.values(steps).filter(Boolean).length;
    res.json({
      steps,
      completedCount,
      totalSteps: 4,
      isComplete: completedCount === 4,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/onboarding/dismiss", auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE tenants SET onboarding_completed = true WHERE id = $1`,
      [req.tenant.id],
    );
    res.json({
      message: "Onboarding dismissed",
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
