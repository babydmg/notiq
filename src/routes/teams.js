import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Resend } from "resend";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, role, status, created_at FROM team_members
            WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/invite", auth, async (req, res) => {
  const { email, role } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!["member", "admin"].includes(role || "member")) {
    return res.status(400).json({
      error: "Role must be member or admin",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM team_members WHERE tenant_id = $1 AND email = $2`,
      [req.tenant.id, email],
    );

    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "This email is already in your team!" });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1200);
    await pool.query(
      `
        INSERT INTO team_members (tenant_id, email, role, invite_token, invite_expires)
        VALUES ($1, $2, $3, $4, $5)`,
      [req.tenant.id, email, role || "member", inviteToken, expires],
    );

    const inviteUrl = `${process.env.FRONTEND_URL}/invite?token=${inviteToken}`;
    await resend.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: `You've been invited to join ${req.tenant.name} on Notifiq`,
      html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px;">
          <div style="margin-bottom: 24px;">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #6366f1); border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px;">N</div>
          </div>
          <h2 style="color: #111; margin-bottom: 8px;">You're invited to Notifiq</h2>
          <p style="color: #555; margin-bottom: 24px;">
            <strong>${req.tenant.name}</strong> has invited you to join their team on Notifiq as a <strong>${role || "member"}</strong>.
          </p>
          <a href="${inviteUrl}" style="display:inline-block;background:#111;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;margin-bottom:24px;">
            Accept invitation →
          </a>
          <p style="color:#999;font-size:12px;">This invite expires in 7 days. If you didn't expect this, ignore this email.</p>
        </div>
        `,
    });

    res.status(201).json({ message: `Invitation sent to ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/invite/:token", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tm.*, t.name as tenant_name FROM team_members tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.invite_token = $1 AND tm.invite_expires > NOW()`,
      [req.params.token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "Invalid or expired invite link",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/invite/:token/accept", auth, async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({
      error: "Name and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long",
    });
  }

  try {
    const result = await pool.query(
      `SELECT tm.*, t.name, as tenant_name FROM team_members tm
        JOIN tenants t ON t.id = tm.tenant_id
        WHERE tm.invite_token = $1 AND tm.invite_expires > NOW()`,
      [req.params.token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired invite link" });
    }

    const member = result.rows[0];

    const existingUser = await pool.query(
      `
        SELECT id FROM tenants WHERE email = $1`,
      [member.email],
    );

    let userId;

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const apiKey = `nfq_${crypto.randomBytes(32).toString("hex")}`;

      const newUser = await pool.query(
        `INSERT INTO tenants (name, email, password, api_key)
            VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, member.email, hashedPassword, apiKey],
      );
      userId = newUser.rows[0].id;
    }

    await pool.query(
      `UPDATE team_members
        SET status = 'active', name = $1, user_id = $2, invite_token = NULL
        WHERE id = $3`,
      [name, userId, member.id],
    );

    const token = jwt.sign(
      {
        tenantId: member.tenant_id,
        memberId: member.id,
        role: member.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      token,
      tenant: {
        id: member.tenant_id,
        name: member.tenant_name,
        email: member.email,
        plan: "member",
        role: member.role,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM team_members WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
    res.json({ message: "Team member removed" });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.put("/:id", auth, async (req, res) => {
  const { role } = req.body;
  if (!["member", "admin"].includes(role)) {
    return res.status(400).json({
      error: "Role must be member or admin",
    });
  }
  try {
    await pool.query(
      `UPDATE team_members SET role = $1 WHERE id = $2 AND tenant_id = $3`,
      [role, req.params.id, req.tenant.id],
    );
    res.json({ message: "Role updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
