import pool from "../db/index.js";

const auth = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) return res.status(401).json({ error: "Missing API Key" });

  try {
    const result = await pool.query(
      `SELECT * FROM tenants WHERE api_key = $1`,
      [apiKey],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.tenant = result.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default auth;
