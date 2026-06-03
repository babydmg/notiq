import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import "./db/index.js";
import tenantRoutes from "./routes/tenants.js";
import jobRoutes from "./routes/jobs.js";
import recurringRoutes from "./routes/recurring.js";
import billingRoutes from "./routes/billing.js";
import authRoutes from "./routes/auth.js";
import contactRoutes from "./routes/contacts.js";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://notifiq-dashboard.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key", "Authorization"],
  }),
);
app.use("/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use("/tenants", tenantRoutes);
app.use("/auth", authRoutes);
app.use("/jobs", jobRoutes);
app.use("/recurring", recurringRoutes);
app.use("/billing", billingRoutes);
app.use("/contacts", contactRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on PORT: ${PORT}`));
