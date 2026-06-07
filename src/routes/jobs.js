import express from "express";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";
import planCheck from "../middleware/planCheck.js";

const router = express.Router();

router.post("/schedule", auth, planCheck, async (req, res) => {
  const { to, subject, body, scheduledAt } = req.body;

  if (!to || !subject || !body || !scheduledAt) {
    return res
      .status(400)
      .json({ error: "to, subject, body, scheduledAt are required" });
  }

  const sendAt = new Date(scheduledAt);
  const delay = sendAt.getTime() - Date.now();

  if (delay < 0)
    return res.status(400).json({ error: "scheduledAt must be in the future" });

  try {
    const result = await pool.query(
      `INSERT INTO jobs (tenant_id, type, payload, scheduled_at)
       VALUES ($1, 'email', $2, $3) RETURNING *`,
      [req.tenant.id, { to, subject, body }, sendAt],
    );

    res.status(201).json({
      message: "Email scheduled successfully",
      job: result.rows[0],
      usage: req.usage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/blast", auth, planCheck, async (req, res) => {
  const { subject, body, scheduledAt } = req.body;

  if (!subject || !body || !scheduledAt) {
    return res
      .status(400)
      .json({ error: "subject, body, scheduledAt are required" });
  }

  const sendAt = new Date(scheduledAt);
  if (sendAt.getTime() - Date.now() < 0) {
    return res.status(400).json({ error: "scheduledAt must be in the future" });
  }

  try {
    const contacts = await pool.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND subscribed = true`,
      [req.tenant.id],
    );

    if (contacts.rows.length === 0) {
      return res.status(400).json({ error: "No subscribed contacts found" });
    }

    let count = 0;
    for (const contact of contacts.rows) {
      const unsubscribeUrl = `${process.env.BACKEND_URL}/contacts/unsubscribe/${req.tenant.id}/${encodeURIComponent(contact.email)}`;
      const bodyWithUnsub = `${body}<br/><br/><hr/><p style="font-size:12px;color:#999;">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;

      await pool.query(
        `INSERT INTO jobs (tenant_id, type, payload, scheduled_at)
         VALUES ($1, 'email', $2, $3)`,
        [
          req.tenant.id,
          { to: contact.email, subject, body: bodyWithUnsub },
          sendAt,
        ],
      );
      count++;
    }

    res.status(201).json({
      message: `Blast scheduled to ${count} contacts`,
      count,
      scheduledAt: sendAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytics", auth, async (req, res) => {
  try {
    const daily = await pool.query(
      `
      SELECT
        DATE (created_at) as date,
        COUNT (*) FILTER (WHERE status = 'sent') as sent,
        SUM(opens) FILTER (WHERE status = 'sent') as opens,
        SUM(clicks) FILTER (WHERE status = 'sent') as clicks
      FROM jobs
      WHERE tenant_id = $1
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [req.tenant.id],
    );
    const overall = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COALESCE(SUM(opens) FILTER (WHERE status = 'sent'), 0) as total_opens,
        COALESCE(SUM(clicks) FILTER (WHERE status = 'sent'), 0) as total_clicks,
        COALESCE(
          ROUND(
            SUM(opens) FILTER (WHERE status = 'sent')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 1
          ), 0
        ) as open_rate,
        COALESCE(
         ROUND(
            SUM(clicks) FILTER (WHERE status = 'sent')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 1
          ), 0 
        ) as click_rate
        FROM jobs
        WHERE tenant_id = $1`,
      [req.tenant.id],
    );

    const topEmails = await pool.query(
      `
      SELECT
        payload->>'subject' as subject,
        opens,
        clicks,
        sent_at
      FROM jobs
      WHERE tenant_id = $1
      AND status = 'sent'
      ORDER BY opens DESC
      LIMIT 5`,
      [req.tenant.id],
    );

    res.json({
      daily: daily.rows,
      overall: overall.rows[0],
      topEmails: topEmails.rows,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export default router;
