import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Resend } from "resend";
import pool from "../db/index.js";
import auth from '../middleware/auth.js'

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

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

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const result = await pool.query(`SELECT * FROM tenants WHERE email = $1`, [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.json({
        message: "If that email exists, a reset link has been sent",
      });
    }

    const tenant = result.rows[0];
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      `
      UPDATE tenants SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [resetToken, expires, tenant.id],
    );
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: `Reset your Notifiq password`,
      html: `
      <div style="font-family: sans-serif; max-width: 500px; margin:0 auto; padding:40px">
        <h2 style="color: #111;">Reset your password</h2>
        <p style="color: #555;">Click the button below to reset your password. This link expires in 1 hour.</p> 
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin: 20px 0;">
          Reset Password
        </a>
        <p style="color:#999;font-size:12px;">If you didn't request this, ignore this email.</p>
      </div>
      `,
    });
    res.json({ message: "If that emails exists, a reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      error: "Token and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long",
    });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM tenants
      WHERE reset_token = $1
      AND reset_token_expires > NOW()`,
      [token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const tenant = result.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE tenants
      SET password = $1, reset_token = NULL, reset_token_expires = NULL
      WHERE id = $2`,
      [hashedPassword, tenant.id],
    );
    res.json({ message: "Password reset successfully. You can login now" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    res.json({
      tenant: {
        id: req.tenant.id,
        name: req.tenant.name,
        email: req.tenant.email,
        plan: req.tenant.plan,
        api_key: req.tenant.api_key,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
