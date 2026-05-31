import pool from "../db/index.js";

const FREE_LIMIT = 100;

const planCheck = async (req, res, next) => {
  try {
    const { id, plan } = req.tenant;

    if (plan === "pro") return next();

    const result = await pool.query(
      `SELECT COUNT(*) FROM jobs
        WHERE tenant_id = $1
        AND status = 'sent'
        AND created_at >= date_trunc('month', NOW())`,
      [id],
    );

    const usage = parseInt(result.rows[0].count);

    if (usage >= FREE_LIMIT) {
      return res.status(403).json({
        error: `Free plan limit reached (${FREE_LIMIT}/month). Upgrade to pro for unlimited emails.`,
        upgradeUrl: "http://localhost:3000/billing/checkout",
      });
    }

    req.usage = { current: usage, limit: FREE_LIMIT };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default planCheck;
