import { Resend } from "resend";
import dotenv from "dotenv";
import { injectTracking } from "../utils/trackEmail.js";
import { deliverWebhooks } from "../utils/deliverWebhooks.js";
import pool from "../db/index.js";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const processJobs = async () => {
  try {
    const result = await pool.query(`
      SELECT * FROM jobs
      WHERE status = 'pending'
      AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 50
    `);
    if (result.rows.length === 0) return;
    console.log(`Processing ${result.rows.length} jobs....`);
    for (const job of result.rows) {
      try {
        const { to, subject, body } = job.payload;

        await pool.query(
          `UPDATE jobs SET status = 'processing' WHERE id = $1`,
          [job.id],
        );

        const trackedBody = injectTracking(
          body,
          job.id,
          process.env.BACKEND_URL,
        );

        const { error } = await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to,
          subject,
          html: trackedBody,
        });
        if (error) throw new Error(error.message);
        await pool.query(
          `UPDATE jobs SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [job.id],
        );

        await deliverWebhooks(job.tenant_id, "email.sent", {
          jobId: job.id,
          to,
          subject,
          sentAt: new Date().toISOString(),
        });

        console.log(`Job ${job.id} sent to ${to}`);
      } catch (err) {
        await pool.query(
          `UPDATE jobs SET status = 'failed', error = $1 WHERE id = $2`,
          [err.message, job.id],
        );

        await deliverWebhooks(job.tenant_id, "email.failed", {
          jobId: job.id,
          error: err.message,
        });
        console.error(`Job ${job.id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("Worker error:", err.message);
  }
};

console.log("Worker started - polling every 30 seconds");
processJobs();
setInterval(processJobs, 30 * 1000);
