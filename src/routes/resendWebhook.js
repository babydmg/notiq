import express from "express";
import { Webhook } from "svix";
import pool from "../db/index.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    try {
      const wh = new Webhook(webhookSecret);
      const payload = wh.verify(req.body, {
        "svix-id": req.headers["svix-id"],
        "svix-timestamp": req.headers["svix-timestamp"],
        "svix-signature": req.headers["svix-signature"],
      });

      const { type, data } = payload;
      console.log(`Resend webhook: ${type}`);

      const jobResult = await pool.query(
        `SELECT * FROM jobs WHERE payload->>'resend_id' = $1`,
        [data.email_id],
      );

      if (jobResult.rows.length === 0) {
        return res.json({
          received: true,
        });
      }

      const job = jobResult.rows[0];
      const email = job.payload.to;

      if (type === "email.bounced") {
        const bounceType = data.bounce?.type || "hard";

        await pool.query(`UPDATE jobs SET bounce_type = $1 WHERE id = $2`, [
          bounceType,
          job.id,
        ]);

        if (bounceType === "hard") {
          await pool.query(
            `UPDATE contacts
                SET subscribed = false, status = 'bounced',
                    bounce_count = bounce_count + 1,
                    last_bounced_at = NOW()
                WHERE email = $1 AND tenant_id = $2`,
            [email, job.tenant_id],
          );
          console.log(`Hard bounce - unsubscribed ${email}`);
        } else {
          const result = await pool.query(
            `
                UPDATE contacts
                SET bounce_count = bounce_count + 1,
                last_bounced_at = NOW()
                WHERE email = $1 AND tenant_id = $2
                RETURNING bounce_count`,
            [email, job.tenant_id],
          );
          if (result.rows[0]?.bounce_count >= 3) {
            await pool.query(
              `UPDATE contacts SET subscribed = false, status = 'bounced'
                WHERE email = $1 AND tenant_id = $2
                RETURNING bounce_count`,
              [email, job.tenant_id],
            );
          }
        }
      }

      if (type === "email.complained") {
        await pool.query(
          `UPDATE contacts
            SET subscribed = false, status = 'complained'
                marked_spam_at = NOW()
            WHERE email = $1 AND tenant_id = $2`,
          [email, job.tenant_id],
        );
        console.log(`Spam complaint - unsubscribed ${email}`);
      }

      if (type === "email.delivered") {
        await pool.query(
          `UPDATE contacts SET bounce_count = 0 WHERE email = $1 AND tenant_id = $2`,
          [email, job.tenant_id],
        );
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Resend webhook error:", err.message);
      res.status(400).json({
        error: err.message,
      });
    }
  },
);

export default router;
