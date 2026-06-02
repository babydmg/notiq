import pool from "../db/index.js";
import jwt from "jsonwebtoken";

const auth = async (req, res, next) => {
  // const apiKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];

  // if (!apiKey) return res.status(401).json({ error: "Missing API Key" });

  try {
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const result = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [
        decoded.tenantId,
      ]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid token" });
      }
      req.tenant = result.rows[0];
      return next();
    }
    // if (apiKey) {
    //   const result = await pool.query(
    //     `SELECT * FROM tenants WHERE api_key = $1`,
    //     [apiKey],
    //   );

    //   if (result.rows.length === 0) {
    //     return res.status(401).json({ error: "Invalid API key" });
    //   }

    //   req.tenant = result.rows[0];
    //   return next();
    // }
    return res.status(401).json({ error: "Authentication Required" });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export default auth;
