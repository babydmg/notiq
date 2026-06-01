import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../db/index.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({
      error: "Name, email and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be atleast 8 characters long",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM tenants WHERE email = $1`,
      [email],
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Email already registered",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const apiKey = `nfq_${crypto.randomBytes(32).toString("hex")}`;

    const result = await pool.query(
      `INSERT INTO tenants (name, email, password, api_key)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, api_key, plan, created_at`,
      [name, email, hashedPassword, apiKey],
    );

    const tenant = result.rows[0];
    const token = jwt.sign(
      {
        tenantId: tenant.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    res.status(201).json({ token, tenant });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query(`SELECT * FROM tenants WHERE email = $1`, [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invaild email or password" });
    }

    const tenant = result.rows[0];
    const valid = await bcrypt.compare(password, tenant.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ tenantId: tenant.id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        plan: tenant.plan,
        api_key: tenant.api_key,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
