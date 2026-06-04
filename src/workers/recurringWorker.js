import pool from "../db/index.js";
import { parseCronExpression } from "cron-schedule";
import dotenv from "dotenv";

dotenv.config();

const scheduleRecurringJobs = async () => {
  try {
    const result = await pool.query(
      `SELECT * FROM recurring_jobs WHERE active = true`,
    );
    for (const recurring of result.rows) {
      try {
        const interval = parseCronExpression(recurring.cron);
        const nextRun = interval.getNextDate(new Date());

        const existing = await pool.query(
          `
                    SELECT id FROM jobs
                    WHERE tenant_id = $1
                    AND payload->>'recurring_id' = $2
                    AND scheduled_at = $3
                `,
          [recurring.tenant_id, recurring.id, nextRun],
        );

        if (existing.rows.length > 0) continue;

        const { to, subject, body } = recurring.payload;

        await pool.query(
          `
            INSERT INTO jobs (tenant_id, type, payload, scheduled_at)
            VALUES ($1, 'email', $2, $3)`,
          [
            recurring.tenant_id,
            {
              to,
              subject,
              body,
              recurring_id: recurring.id,
            },
            nextRun,
          ],
        );

        console.log(`Scheduled recurring job ${recurring.id} for ${nextRun}`);
      } catch (err) {
        console.error(`Recurring jobs ${recurring.id} error:`, err.message);
      }
    }
  } catch (err) {
    console.error("Recurring worker error:", err.message);
  }
};

console.log("Recurring worker started - polling every 5 minutes");
scheduleRecurringJobs();
setInterval(scheduleRecurringJobs, 5 * 60 * 1000);
