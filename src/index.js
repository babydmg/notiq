import express from "express";
import dotenv from "dotenv";
import "./db/index.js";
import tenantRoutes from "./routes/tenants.js";
import jobRoutes from "./routes/jobs.js";
import recurringRoutes from "./routes/recurring.js";
import billingRoutes from "./routes/billing.js";

dotenv.config();

const app = express();
app.use("/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use("/tenants", tenantRoutes);
app.use("/jobs", jobRoutes);
app.use("/recurring", recurringRoutes);
app.use("/billing", billingRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on PORT: ${PORT}`));
