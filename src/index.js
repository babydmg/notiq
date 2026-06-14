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
import templatesRoutes from "./routes/templates.js";
import trackingRoutes from "./routes/tracking.js";
import webhookRoutes from "./routes/webhooks.js";
import domainRoutes from "./routes/domains.js";
import teamRoutes from "./routes/teams.js";
import settingsRoutes from "./routes/settings.js";
import requireRole from "./middleware/requireRole.js";
import auth from "./middleware/auth.js";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://notifiq-dashboard.vercel.app",
      "https://notifiq-dashboard.vercel.app/signup",
      "https://notifiq-dashboard.vercel.app/*",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key", "Authorization"],
  }),
);
app.use("/billing/webhook", express.raw({ type: "application/json" }));
app.use("/biling/checkout", auth, requireRole("admin"));
app.use("/billing/cancel", auth, requireRole("admin"));
app.use("/team/invite", auth, requireRole("admin"));
app.use("/team/:id", auth, requireRole("admin"));

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
app.use("/templates", templatesRoutes);
app.use("/tracking", trackingRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/domains", domainRoutes);
app.use("/team", teamRoutes);
app.use("/settings", settingsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on PORT: ${PORT}`));
