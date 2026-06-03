import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/", auth, async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const result = await pool.query(
      `INSERT INTO contacts (tenant_id, email, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, email) DO UPDATE SET name = $3
        RETURNING *`,
      [req.tenant.id, email.toLowerCase(), name || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/import", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file is required" });

  try {
    const content = req.file.buffer.toString("utf-8");

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return res.status(400).json({
        error: "CSV file is empty",
      });
    }
    const firstRow = records[0];
    const emailCol = Object.keys(firstRow).find((k) =>
      k.toLowerCase().includes("email"),
    );
    const nameCol = Object.keys(firstRow).find((k) =>
      k.toLowerCase().includes("name"),
    );
    if (!emailCol) {
      return res.status(400).json({
        error: "CSV must have an 'email' column",
      });
    }

    let imported = 0;
    let skipped = 0;

    for (const rows of records) {
      const email = row[emailCol]?.toLowerCase().trim();
      const name = nameCol ? row[nameCol]?.trim() : null;

      if (!email || !email.includes("@")) {
        skipped++;
        continue;
      }

      await pool.query(
        `INSERT INTO contacts (tenant_id, email, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, email) DO UPDATE SET name = COALESCE($3, contacts.name)`,
        [req.tenant.id, email, name],
      );
      imported++;
    }

    res.json({
      message: `Import complete`,
      imported,
      skipped,
      total: records.length,
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
      `
            DELETE FROM contacts WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/unsubscribe/:tenantId/:email", async (req, res) => {
  try {
    await pool.query(
      `UPDATE contacts SET subscribed = false WHERE tenant_id = $1 AND email = $2`,
      [req.params.tenantId, decodeURIComponent(req.params.email)],
    );

    res.send(
      `<html>
            <body style="font-family: sans-serif; text-align: center; padding: 40px">
                <h2>You've been unsubscribed.</h2> 
                <p>You won't receive any more emails from this sender.</p>
            </body>
        </html>`,
    );
  } catch (err) {
    res.status(500).json("Something went wrong.");
  }
});
