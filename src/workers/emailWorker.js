import { Worker } from "bullmq";
import { Resend } from "resend";
import { connection } from "../queues/emailQueue.js";
import dotenv from "dotenv";
import pool from "../db/index.js";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const worker = new Worker(
  "emails",
  async (job) => {
    const { jobId, to, subject, body } = job.data;
    console.log(`Processing job ${jobId} - sending to ${to}`);

    const { error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject,
      html: `<p>${body}</p>`,
    });

    if (error) throw new Error(error.message);

    await pool.query(
      `UPDATE jobs SET status = 'sent', sent_at = NOW() where id = $1`,
      [jobId],
    );

    console.log(`Job ${jobId} sent successfully`);
  },
  { connection },
);

worker.on("failed", async (job, err) => {
  console.error(`Job ${job.id} failed: `, err.message);

  await pool.query(
    `UPDATE jobs SET status = 'failed', error = $1 where id = $2`,
    [err.message, job.data.jobId],
  );
});

console.log("Email worker running......");
