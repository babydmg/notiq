import pool from "../db/index.js";
import crypto from "crypto";

export const deliverWebhooks = async (tenantId, event, payload) => {
  try {
    const result = await pool.query(
      `SELECT * FROM webhooks
        WHERE tenant_id = $1
        AND active = true
        AND $2 = ANY(events)`,
      [tenantId, event],
    );

    if (result.rows.length === 0) return;
    for (const webhook of result.rows) {
      const delivery = await pool.query(
        `INSERT INTO webhook_deliveries (webhook_id, job_id, event, status)
            VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [webhook.id, payload.jobId, event],
      );
      const deliveryId = delivery.rows[0].id;

      try {
        const body = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          date: payload,
        });

        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(body)
          .digest("hex");

        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Notifiq-Signature": `sha256=${signature}`,
            "X-Notifiq-Event": event,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        const responseBody = await response.text();

        await pool.query(
          `UPDATE webhook_deliveries
            SET status = $1, response_code = $2, response_body = $3,
                attempts = attempts + 1, delivered_at = NOW()
            WHERE id = $4`,
          [
            response?.ok ? "delivered" : "failed",
            response.status,
            responseBody.slice(0, 500),
            deliveryId,
          ],
        );

        console.log(
          `Webhook ${event} delivered to ${webhook.url} - ${response.status}`,
        );
      } catch (err) {
        await pool.query(
          `
                UPDATE webhooks_deliveries
                SET status = 'failed', response_body = $1, attempts = attempts + 1
                WHERE id = $2`,
          [err.message, deliveryId],
        );
        console.error("Webhook delivery failed:", err.message);
      }
    }
  } catch (err) {
    console.error("deliverWebhooks error:", err.message);
  }
};
