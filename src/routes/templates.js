import express from "express";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM templates WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  const { name, subject, body } = req.body;

  if (!name || !subject || !body) {
    return res
      .status(400)
      .json({ error: "Name, subject and body are required" });
  }

  try {
    const result = await pool.query(
      `
            INSERT INTO templates (tenant_id, name, subject, body)
            VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, name, subject, body],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  const { name, subject, body } = req.body;

  try {
    const result = await pool.query(
      `
            UPDATE templates SET name = $1, subject = $2, body = $3
            WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [name, subject, body, req.params.id, req.tenant.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Template not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query(
      `
            DELETE FROM templates WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
    res.json({ message: "Template deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
