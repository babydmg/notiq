import express from "express";
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
      `SELECT * FROM domains WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  const { domain, fromEmail } = req.body;

  if (!domain) return res.status(400).json({ error: "Domain is required" });
  if (!fromEmail)
    return res.status(400).json({ error: "From email is required" });
  if (!fromEmail.endsWith(`@${domain}`)) {
    return res.status(400).json({ error: `From email must be @${domain}` });
  }

  try {
    const resendDomain = await resend.domains.create({ name: domain });
    if (resendDomain.error) {
      return res.status(400).json({ error: resendDomain.error.message });
    }

    const result = await pool.query(
      `
      INSERT INTO domains (tenant_id, domain, resend_domain_id, dns_record, from_email)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.tenant.id,
        domain,
        resendDomain.data.id,
        JSON.stringify(resendDomain.data.records),
        fromEmail,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/verify", auth, async (req, res) => {
  try {
    const domainResult = await pool.query(
      `
      SELECT * FROM domains WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const domain = domainResult.rows[0];
    const resendDomain = await resend.domains.get(domain.resend_domain_id);

    if (resendDomain.error) {
      return res.status(400).json({ error: resendDomain.error.message });
    }

    const status = resendDomain.data.status;
    const verified = status === "verified";
    await pool.query(
      `
      UPDATE domains SET status = $1, verified_at = $2 WHERE id = $3`,
      [status, verified ? new Date() : null, domain.id],
    );

    res.json({
      status,
      verified,
      message: verified
        ? "Domain verified! You can now send from this domain"
        : "DNS records not verified yet. Make sure you've added all DNS records.",
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const domainResult = await pool.query(
      `SELECT * FROM domains WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({
        error: "Domain not found",
      });
    }

    if (domainResult.rows[0].resend_domain_id) {
      await resend.domains.remove(domainResult.rows[0].resend_domain_id);
    }

    await pool.query(`DELETE FROM domains WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      req.tenant.id,
    ]);

    res.json({ message: "Domain deleted" });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/:id/activate", auth, async (req, res) => {
  try {
    const domainResult = await pool.query(
      `SELECT * FROM domains WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: "Domain not found" });
    }
    if (domainResult.rows[0].status !== "verified") {
      return res
        .status(400)
        .json({ error: "Domain must be verified before activating" });
    }

    await pool.query(`UPDATE tenants SET email = $1 WHERE id = $2`, [
      domainResult.rows[0].from_email,
      req.tenant.id,
    ]);
    res.json({
      message: "Domain activated",
      fromEmail: domainResult.rows[0].from_email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
