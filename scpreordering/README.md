# SPC Canteen Pre-Ordering System

React + Vite + Supabase. Free-tier only: Stripe **test mode** for online payments, no email API, no CLI required.
One canteen, no stalls. Responsive from 320px phones up to desktops.

## 1. Supabase setup

### Existing project

You already ran `01`–`08`. Open **SQL Editor** and paste and Run:

- `supabase/09_stripe.sql` — checkout columns, webhook deduplication, settlement RPC, and revocation of the old demo payment RPC

Safe to re-run. Run this before testing online payments.

If you previously ran `09_paymongo.sql`, that is fine — the older `paymongo_*` columns are simply unused. The app now uses Stripe test mode.

### Fresh project

Paste and Run these in order:

1. `supabase/01_schema.sql` — base tables, roles, RLS, storage, realtime
2. `supabase/02_seed.sql` — six departments + sample menu
3. `supabase/03_admin.sql` — creates the first admin account
4. `supabase/04_updates.sql` — departments, School ID, daily board
5. `supabase/05_roles.sql` — roles, payments, live stock
6. `supabase/06_account_access.sql` — account activation and revocation
7. `supabase/07_undo_decline.sql` — restore mistakenly declined orders
8. `supabase/08_order_delete.sql` — student order deletion
9. `supabase/09_stripe.sql` — Stripe test-mode settlement

**In `03_admin.sql`, change the password on the marked line before running it.**
Admin login ID is `admin`. Then turn **Confirm email OFF** in Authentication → Settings.

## 2. Environment

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

`.env` is gitignored. Never put a Stripe secret key or a Supabase `service_role` key here.

## 3. Stripe test-mode setup

Test mode is free: real API and webhooks, fake payments, **no real money**. Live mode needs business verification and charges fees, so it is intentionally out of scope.

### Stripe Dashboard

1. Open <https://dashboard.stripe.com/test> and make sure the **Test mode** toggle is ON.
2. Go to **Developers → API keys** and reveal the **Secret test key** (`sk_test_...`).
3. Go to **Developers → Webhooks → Add endpoint**.
4. Set the endpoint URL to:

   ```text
   https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
   ```

   Get `PROJECT_REF` from **Supabase → Project Settings → General → Reference ID**.

5. Subscribe to these events:

   ```text
   checkout.session.completed
   checkout.session.async_payment_succeeded
   ```

   Only `checkout.session.completed` is needed for card payments, but the second event is safe to include.

6. Copy the webhook **Signing secret** (`whsec_...`) shown after the endpoint is created.

### Supabase Dashboard

1. Go to **Edge Functions → Secrets** and add:

   ```text
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   APP_URL=https://your-deployed-app-url
   ```

   For local testing, `APP_URL=http://localhost:5173` works from that machine. A deployed HTTPS URL is required for normal student use. Do not add a trailing slash.

2. Go to **Edge Functions → Deploy a new function → Via Editor**:

   - Create `stripe-checkout`, paste `supabase/functions/stripe-checkout/index.ts`, and deploy. Leave JWT verification **on** (the default).
   - Create `stripe-webhook`, paste `supabase/functions/stripe-webhook/index.ts`, turn JWT verification **off**, and deploy.

3. Make sure `supabase/09_stripe.sql` has been run in the SQL Editor.

The webhook verifies the raw body and the `v1` signature from `Stripe-Signature` before settling an order. Duplicates are ignored by event ID, so stock is consumed only once.

### Test card

Use this Stripe test card on the hosted checkout page:

```text
Card number: 4242 4242 4242 4242
Expiry:      any future date
CVC:         any 3 digits
ZIP:         any 5 digits
```

## 4. Run the app

```powershell
npm.cmd run dev
```

## 5. Roles

- **Admin:** monitors accounts — browse students/staff, create staff accounts,
  change roles, and activate/revoke accounts. No menu, no orders, no sales.
- **Staff:** runs the canteen — adds/edits menu items, sets usual stock and today's
  board, collects cash, views full order details, and moves orders through the queue.
- **Student:** signs up with name, **School ID** (`YYYY-NNNNN`, e.g. `2023-00000`),
  and one of the six colleges. The School ID is the login ID.

Staff IDs are generated as `ST-0001`, `ST-0002`, and so on. `ST` means **staff**.

## 6. Account access

On the admin **Accounts** page, every account has an **Active** or **Revoked** state.

- **Revoke** blocks sign-in, ends current sessions, and removes app access immediately.
- **Activate** restores access. The user keeps the same ID and password.
- Admins cannot revoke themselves, and the last active admin cannot be revoked.
- Revoked users are signed out automatically if an admin changes their access while
  they are working.

## 7. Payment and stock

At checkout students choose:

- **Pay online (Stripe test):** the student is redirected to Stripe's hosted checkout.
  The basket is kept until the success page is reached. A signed webhook then marks the order paid and moves it to preparing.
- **Pay at the canteen:** the order waits; staff accept it, the student pays at the counter,
  staff click **Collect cash**, then preparation starts.

Nothing is prepared before payment. Adding to a basket reserves nothing — stock is
deducted atomically when payment succeeds, first paid, first served. Placing an order
is blocked if an item is already out of stock. If stock runs out before payment, the
student is told which item is short and can cancel and reorder. Menu quantities update
live through Supabase Realtime.

Extra notes:

- No real money moves. Do not enter live card details.
- The old one-click `pay_online()` demo RPC is revoked by `09_stripe.sql`, so a client cannot mark an online order paid without Stripe.
- If the checkout is cancelled, the order stays unpaid and the basket remains. Use **Pay online** in **My Orders** to retry.
- The success page can appear just before the webhook arrives. The order updates on its own; do not pay twice.

## 8. Menu, stock, and daily board

`menu_items` is the master list. On the staff **Menu** page, staff add dishes, prices,
photos, and **usual stock**. Usual stock is used whenever no board is posted for today.

On **Today's board**, staff set today's availability and **stock left today**. Today's
values override the usual stock. "Reset to usual" clears today's board and returns
students to the master menu values.

Emojis are not used anywhere in the interface. Existing emoji values in the database
are hidden; new and edited menu items are saved without them.

## 9. Staff queue

- Click an order number or **Details** to open the complete order: student, School ID,
  pickup time, payment method and status, notes, every item, and total.
- **Decline** asks for confirmation first. **Keep order** cancels the action;
  **Yes, decline order** applies it.
- A mistaken decline can be restored with **Undo** in the toast, the queue row, or the
  order details modal. There is no time limit while the order stays rejected and unpaid.
  Student cancellations cannot be undone by staff.

## 10. Order receipts

Every order in **My Orders** has a **Receipt** button. The receipt is read-only and shows:

- Order ID (friendly order number and full reference)
- Order date and time
- Ordered items and quantities, with unit and line prices
- Total amount paid (labelled **Total due** while unpaid)
- Payment method (cash at the canteen or online via Stripe test)
- Payment status (**Paid** or **Not paid yet**, plus paid-at time when available)

A receipt is only available while the order is visible in the student's list. Deleting an
order removes its receipt too — there is no separate receipt history.

## 11. Deleting orders

Students can delete orders from **My Orders** after confirming.

- **Unpaid orders** are permanently removed. No stock was consumed and no payment exists.
- **Paid orders** disappear from the student's list only. The canteen keeps the order,
  payment, and sales record for pickup and totals.
- Staff details show “Hidden by student” for soft-deleted paid orders.

## 12. Deploying to Vercel

The app is a static Vite build. All backend work stays in Supabase Edge Functions, so
Vercel only hosts the frontend. `vercel.json` rewrites unknown paths to `index.html`,
which is required for React Router links and Stripe return URLs to work on refresh.

1. Push the project to GitHub, then in Vercel choose **Add New → Project** and import it.
2. Build settings (Vite is auto-detected):
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node.js version: **22.x** (Vite 8 needs Node 20.19+ or 22.12+)
3. Add these in **Project Settings → Environment Variables**, then redeploy:

   ```text
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key from Supabase API settings>
   ```

   `VITE_*` values are baked into the build, so any change requires a new deployment.

4. In Supabase → **Edge Functions → Secrets**, set the checkout return URL:

   ```text
   APP_URL=https://<your-app>.vercel.app
   ```

   No trailing slash. Then redeploy `stripe-checkout` so it uses the new value. If you
   skip this, students return to `localhost` after paying.

5. In Supabase → **Authentication → URL Configuration**:

   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: add `https://<your-app>.vercel.app/**`

6. The Stripe webhook URL and secrets do **not** change — the webhook still points at
   `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`.

After deploying, open `https://<your-app>.vercel.app/login` directly to confirm routing,
then run the payment checklist below against the deployed URL.

## 13. Verification

```powershell
npm.cmd run lint
npm.cmd run build
```

End-to-end payment checklist:

1. Place an online order with the test card and complete hosted checkout.
2. Confirm the order moves to **preparing** in My Orders and the staff queue without a refresh.
3. Confirm stock decreases once, even if Stripe retries the webhook.
4. Cancel a checkout and confirm the basket and unpaid order remain.
5. Place a cash order and confirm staff collection still works.
6. Confirm a revoked account cannot start checkout.
