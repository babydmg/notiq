import express from "express";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
            SELECT s.*, COUNT(cs.contact_id) as contact_count
            FROM segments s
            LEFT JOIN contact_segments cs ON cs.segment_id = s.id
            WHERE s.tenant_id = $1
            GROUP BY s.id
            ORDER BY s.created_at DESC`,
      [req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", auth, async (req, res) => {
  const { name, filters } = req.body;

  if (!name)
    return res.status(400).json({
      error: "Name is required",
    });

  try {
    const contacts = await applyFilters(req.tenant.id, filters || {});
    const result = await pool.query(
      `INSERT INTO segments (tenant_id, name, filters)
            VALUES ($1, $2, $3) RETURNING *`,
      [req.tenant.id, name, JSON.stringify(filters || {})],
    );

    const segment = result.rows[0];

    for (const contact of contacts) {
      await pool.query(
        `
                INSERT INTO contact_segments (contact_id, segment_id)
                VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [contact.id, segment.id],
      );
    }

    res.status(201).json({
      ...segment,
      contact_count: contacts.length,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/preview", auth, async (req, res) => {
  const { filters } = req.body;
  try {
    const contacts = await applyFilters(req.tenant.id, filters || {});
    res.json({ count: contacts.length, contacts: contacts.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/contacts", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.* FROM contacts c
            JOIN contact_segments cs ON cs.contact_id = c.id
            WHERE cs.segment_id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/:id/fresh", auth, async (req, res) => {
  try {
    const segResult = await pool.query(
      `SELECT * FROM segments WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id],
    );

    if (segResult.rows.length === 0) {
      return res.status(404).json({
        error: "Segment not found",
      });
    }

    const segment = segResult.rows[0];
    const contacts = await applyFilters(req.tenant_id, segment.filters);

    await pool.query(`DELETE FROM contact_segments WHERE segment_id = $1`, [
      segment.id,
    ]);

    for (const contact of contacts) {
      await pool.query(
        `INSERT INTO contact_segments (contact_id, segment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [contact.id, segment.id],
      );
    }
    res.json({ message: "Segment refreshed", contact_count: contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM segments WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      req.tenant.id,
    ]);
    res.json({ message: "Segment deleted" });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

const applyFilters = async (tenantId, filters) => {
  let query = `SELECT * FROM contacts WHERE tenant_id = $1 AND subscribed = true`;
  const params = [tenantId];
  let idx = 2;

  if (filters.tag) {
    query += ` AND name ILIKE $${idx}`;
    params.push(`%${filters.nameContains}%`);
    idx++;
  }

  if (filters.nameContains) {
    query += ` AND name ILIKE $${idx}`;
    params.push(`%${filters.nameContains}%`);
    idx++;
  }

  if (filters.emailDomain) {
    query += ` AND email LIKE $${idx}`;
    params.push(`%@${filters.emailDomain}`);
    idx++;
  }

  if (filters.subscribed === false) {
    query = query.replace("AND subscribe = true", "AND subscribe = false");
  }

  const result = await pool.query(query, params);
  return result.rows;
};

export default router;
