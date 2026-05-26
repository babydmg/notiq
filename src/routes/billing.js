import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post("/checkout", auth, async (req, res) => {
  const { email } = req.body;

  if (!email)
    return res.status(400).json({
      error: "Email is required",
    });

  try {
    const customer = await stripe.customers.create({
      email,
      metadata: { tenantId: req.tenant.id },
    });

    await pool.query(
      `UPDATE tenants SET email = $1, stripe_customer_id = $2 where id = $3`,
      [email, customer.id, req.tenant.id],
    );

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],

      mode: "subscription",
      success_url: "http://localhost:3000/billing/success",
      cancel_url: "http://localhost:3000/billing/cancel",
    });

    res.json({ checkOutUrl: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      await pool.query(
        `UPDATE tenants SET plan = 'pro', stripe_subscription_id = $1 WHERE stripe_customer_id = $2`,
        [subscriptionId, customerId],
      );

      console.log(`✅ Tenant upgraded to pro — customer ${customerId}`);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      await pool.query(
        `UPDATE tenants SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1`,
        [subscription.customer],
      );

      console.log(
        `⚠️ Tenant downgraded to free — customer ${subscription.customer}`,
      );
    }

    res.json({ received: true });
  },
);

router.get("/success", (req, res) =>
  res.json({ message: "Subscription Activated" }),
);
router.get("/cancel", (req, res) =>
  res.json({ message: "Checkout cancelled" }),
);

router.get("/usage", auth, async (req, res) => {
  try {
    const { id, plan } = req.tenant;
    const result = await pool.query(
      `SELECT COUNT(*) FROM jobs
      WHERE tenant_id = $1
      AND status = 'sent'
      AND created_at >= date_trunc('month', NOW())`,
      [id],
    );

    const usage = parseInt(result.rows[0].count);

    res.json({
      plan,
      usage,
      limit: plan === "pro" ? "unlimited" : 100,
      remaining: plan === "pro" ? "unlimited" : Math.max(0, 100 - usage),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
