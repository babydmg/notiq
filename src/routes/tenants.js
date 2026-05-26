import express from "express";
import crypto from "crypto";
import pool from "../db/index.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name } = req.body;

  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const apiKey = `nfq_${crypto.randomBytes(32).toString("hex")}`;

    const result = await pool.query(
      `INSERT INTO tenants (name, api_key) VALUES ($1, $2) RETURNING id, name, api_key, created_at`,
      [name, apiKey],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

export default router;
