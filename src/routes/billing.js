import express from "express";
import Stripe from "stripe";
import pool from "../db/index.js";
import auth from "../middleware/auth.js";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.post("/checkout", auth, async (req, res) => {
  const { email, id, name } = req.tenant;

  try {
    let customerId = req.tenant.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: { tenantId: id },
      });
      customerId = customer.id;

      await pool.query(
        `UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, id],
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard`,
    });

    res.json({ checkoutUrl: session.url });
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
      await pool.query(
        `UPDATE tenants SET plan = 'pro', stripe_subscription_id = $1 WHERE stripe_customer_id = $2`,
        [session.subscription, session.customer],
      );
      console.log(`✅ Tenant upgraded to pro — customer ${session.customer}`);
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

router.post("/cancel", auth, async (req, res) => {
  const { stripe_subscription_id } = req.tenant;

  if (!stripe_subscription_id) {
    return res.status(400).json({ error: "No active subscription" });
  }

  try {
    await stripe.subscriptions.cancel(stripe_subscription_id);
    await pool.query(
      `UPDATE tenants SET plan = 'free', stripe_subscription_id = NULL WHERE id = $1`,
      [req.tenant.id],
    );
    res.json({ message: "Subscription cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal", auth, async (req, res) => {
  try {
    if (!req.tenant.stripe_customer_id) {
      return res
        .status(400)
        .json({ error: "No billing account found. Please subscribe first." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.tenant.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/invoices", auth, async (req, res) => {
  try {
    if (!req.tenant.stripe_customer_id) {
      return res.json([]);
    }

    const invoices = await stripe.invoices.list({
      customer: req.tenant.stripe_customer_id,
      limit: 12,
    });

    res.json(
      invoices.data.map((inv) => ({
        id: inv.id,
        amount: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        status: inv.status,
        date: new Date(inv.created * 1000).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        pdf: inv.invoice_pdf,
        hosted_url: inv.hosted_invoice_url,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/success", (req, res) =>
  res.json({ message: "🎉 Subscription activated!" }),
);
router.get("/cancel", (req, res) =>
  res.json({ message: "Checkout cancelled." }),
);

export default router;
