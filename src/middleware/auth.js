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

      if (decoded.memberId) {
        const memberResult = await pool.query(
          `SELECT tm.*, t.* FROM team_members tm
            JOIN tenants t ON t.id = tm.tenant_id
            WHERE tm.id = $1 AND tm.status = 'active'`,
          [decoded.memberId],
        );
        if (memberResult.rows.length === 0) {
          return res
            .status(401)
            .json({ error: "Team member not found or inactive" });
        }

        const row = memberResult.rows[0];

        req.tenant = {
          id: row.tenant_id,
          name: row.name,
          email: row.email,
          plan: row.plan,
          api_key: row.api_key,
          stripe_customer_id: row.stripe_customer_id,
          stripe_subscription_id: row.stripe_subscription_id,
          from_email_custom: row.from_email_custom,
        };
        req.member = {
          id: decoded.memberId,
          role: decoded.role,
          email: memberResult.rows[0].email,
        };

        return next();
      }
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
