import express from "express";
import pool from "../db/index.js";
import { emailQueue } from "../queues/emailQueue.js";
import auth from "../middleware/auth.js";
import planCheck from "../middleware/planCheck.js";

const router = express.Router();

router.post("/schedule", auth, planCheck, async (req, res) => {
  const { to, subject, body, scheduledAt } = req.body;
  console.log("📥 Schedule request:", { to, subject, body, scheduledAt });
  if (!to || !subject || !body || !scheduledAt) {
    return res
      .status(400)
      .json({ error: "to, subject, body, scheduledAt are required" });
  }

  const sendAt = new Date(scheduledAt);
  const delay = sendAt.getTime() - Date.now();

  if (delay < 0) {
    return res.status(400).json({ error: "scheduled time must be in future" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO jobs (tenant_id, type, payload, scheduled_at)
          VALUES ($1, 'email', $2, $3)
          RETURNING *
          `,
      [req.tenant.id, { to, subject, body }, sendAt],
    );

    const job = result.rows[0];

    await emailQueue.add(
      "send-email",
      { jobId: job.id, to, subject, body, tenantId: req.tenant.id },
      { delay, jobId: job.id },
    );

    res.status(201).json({
      message: "Email scheduled successfully",
      job,
      usage: req.usage,
    });
  } catch (err) {
    console.error("❌ Schedule error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/blast", auth, planCheck, async (req, res) => {
  const { subject, body, scheduledAt } = req.body;
  if (!subject || !body || !scheduledAt) {
    return res.status(400).json({
      error: "subject, body, scheduledAt are required",
    });
  }

  const sendAt = new Date(scheduledAt);
  const delay = sendAt.getTime() - Date.now();

  if (delay < 0)
    return res.status(400).json({
      error: "scheduledAt must be in the future",
    });

  try {
    const contacts = await pool.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND subscribed = true`,
      [req.tenant.id],
    );
    if (contacts.rows.length === 0) {
      return res.status(400).json({ error: "No subscribed contacts found" });
    }

    const jobs = [];
    for (const contact of contacts.rows) {
      const unsubscribeUrl = `${process.env.BACKEND_URL}/contacts/unsubscribe/${req.tenant.id}/${encodeURIComponent(contact.email)}`;
      const bodyWithUnsub = `${body}<br/><br/><hr/><p style="font-size:12px;color:#999;">Don't want to receive these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
      const result = await pool.query(
        `INSERT INTO jobs (tenant_id, type, payload, scheduled_at)
        VALUES ($1, 'email', $2, $3) RETURNING *`,
        [
          req.tenant.id,
          { to: contact.email, subject, body: bodyWithUnsub },
          sendAt,
        ],
      );
      const job = result.rows[0];
      await emailQueue.add(
        "send-email",
        {
          jobId: job.id,
          to: contact.email,
          subject,
          body: bodyWithUnsub,
          tenantId: req.tenant.id,
        },
        { delay, jobId: job.id },
      );
      jobs.push(job);
    }
    res.status(201).json({
      message: `Blast scheduled to ${jobs.length} contacts`,
      count: jobs.length,
      scheduledAt: sendAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
