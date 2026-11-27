# SPC Canteen Pre-Ordering System

React + Vite + Supabase. Free-tier only: Stripe **test mode** for online payments, no email API, no CLI required.
One canteen, no stalls. Responsive from 320px phones up to desktops: phones get a
fixed bottom navigation bar with icons above labels, while tablets and laptops keep
the top navigation.

## 1. Supabase setup

### Existing project

You already ran `01`–`12`. **Do not copy, modify, or rerun script `12`** — the version
you ran is fine. Open **SQL Editor** and paste and Run only these new scripts, in order:

1. `supabase/13_cash_wait.sql` — cash window fields, 15-minute staff release RPC, and the 1-hour auto-close function
2. `supabase/14_cash_notifications.sql` — upgrades the existing notification trigger with cash close reasons
3. `supabase/15_cash_close_schedule.sql` — enables `pg_cron` and schedules the auto-close check every minute
4. `supabase/16_canteen_status.sql` — staff-controlled open/closed counter and new-order guard

All four are additive and safe to re-run. Nothing from `01`–`12` needs to be run again.

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
10. `supabase/10_completed_by.sql` — staff member who completed each order
11. `supabase/11_staff_order_actions.sql` — staff status undo and unpaid-order deletion
12. `supabase/12_notifications.sql` — realtime staff and customer notifications
13. `supabase/13_cash_wait.sql` — cash window fields, release RPC, and auto-close function
14. `supabase/14_cash_notifications.sql` — cash-aware notification trigger upgrade
15. `supabase/15_cash_close_schedule.sql` — `pg_cron` schedule for 1-hour auto-close
16. `supabase/16_canteen_status.sql` — counter open/closed status and new-order guard

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
  board, opens or closes the counter for new orders, collects cash, views full order
  details, and moves orders through the queue.
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
- Use **Find an order by Order ID** to filter the queue by friendly order number or the
  full UUID. **Clear** restores the whole list. Counts and charts still use all orders.
- Completed orders also show **Completed by** and **Completed at** — the staff member
  who clicked **Complete** at the counter.
- **Decline** asks for confirmation first. **Keep order** cancels the action;
  **Yes, decline order** applies it.
- **Undo** restores the last staff status change from the queue row or Details, e.g.
  Complete → Ready. Undoing a completion also clears the completed-by receipt fields.
  A mistaken decline keeps its existing **Undo decline**; student cancellations cannot
  be undone by staff.
- **Delete** is available for unpaid orders from the queue row or Details and asks for
  confirmation. Paid orders cannot be deleted — sales, stock, and receipts stay intact.
- Unpaid cash orders show their wait time. After **15 minutes**, staff can **Cancel
  no-show** or **Release order** from the queue row or Details. Both close the unpaid
  order and notify the customer. No stock was reserved, so released portions are
  available for another student. Any unpaid cash order still open at **1 hour** closes
  automatically.

## 10. Notifications

The notification bell sits at the top-right of **Incoming orders** for staff and **The
ledger** on the student Today page. It shows unread count and opens a short history.
New notifications also appear as instant toasts. Click an item to mark it read, or use
**Mark all read**.

- Staff receive **New order placed** when a student places an order, and **Payment
  completed** when cash is collected or an online payment is confirmed.
- Customers receive notifications when their order is **confirmed**, **being prepared**,
  **ready for pickup**, **completed**, **declined**, or **cancelled**. Cash no-show
  release, cancellation, and 1-hour auto-close get their own clear messages.

Notifications are created by database triggers, so clients cannot insert them. Realtime
updates require `supabase/12_notifications.sql`; the cash no-show messages added by
`supabase/14_cash_notifications.sql` are optional but recommended.

## 11. Order receipts

Every order in **My Orders** has a **Receipt** button. The receipt is read-only and shows:

- Order ID (friendly order number and full reference)
- Order date and time
- Ordered items and quantities, with unit and line prices
- Total amount paid (labelled **Total due** while unpaid)
- Payment method (cash at the canteen or online)
- Payment status (**Paid** or **Not paid yet**, plus paid-at time when available)
- For completed orders, **Completed by** and **Completed at** (the staff member who
  handed over the order)

A receipt is only available while the order is visible in the student's list. Deleting an
order removes its receipt too — there is no separate receipt history.

## 12. Deleting orders

Students can delete orders from **My Orders** after confirming.

- **Unpaid orders** are permanently removed. No stock was consumed and no payment exists.
- **Paid orders** disappear from the student's list only. The canteen keeps the order,
  payment, and sales record for pickup and totals.
- Staff details show “Hidden by student” for soft-deleted paid orders.

## 13. Counter open/closed

On **Today's board**, staff can **Close counter** (with an optional short message
for students) and **Reopen counter** at any time. Both actions ask for confirmation
first. Staff and admins also see a small **Open** / **Closed** chip beside the school
name.

While closed:

- Students see a banner explaining that new orders are paused, including the staff message.
- **Add to basket** on the menu and **Place order** in the cart are disabled.
- The database also blocks `place_order`, so a stale browser tab cannot place an order.
- Orders already placed are unaffected — they can still be paid, collected, prepared, and completed.
- The counter stays closed until a staff member or admin reopens it.

This needs `supabase/16_canteen_status.sql` in Supabase. On phones, the navigation
moves to a fixed bottom bar with the icon above each label; the sign-out button and
status chip stay in the compact top bar.

## 14. Deploying to Vercel

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

7. After each push to `main`, open **Vercel → Deployments** and confirm a new build
   appears for that commit. GitHub should show a green **Vercel** check on the commit;
   if it does not, check **Project Settings → Git** for the connected repo, production
   branch `main`, and that deployments are not paused.

After deploying, open `https://<your-app>.vercel.app/login` directly to confirm routing,
then run the payment checklist below against the deployed URL.

## 15. Verification

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
7. Change a staff-controlled status, then use **Undo**; confirm the previous stage returns.
8. Try to delete a paid order (blocked), then delete an unpaid order and confirm it disappears.
9. Search by friendly order number and by full UUID.
10. In two browser sessions, place an order and confirm staff see a new-order toast and badge;
    confirm the customer sees toasts for confirmed, preparing, ready, completed, declined,
    and cancelled updates.
11. Place a cash order and confirm the customer sees the counter deadline. Before 15 minutes,
    staff should not see the no-show actions.
12. For a test cash order older than 15 minutes, confirm **Cancel no-show** and **Release order**
    close it and notify the customer. Confirm another student can order the same items.
13. For auto-close testing, set a test order's `cash_hold_until` to a minute from now in SQL
    Editor and confirm it closes within a minute with the customer notification.
14. Close the counter on **Today's board** and confirm students see the banner, the menu/cart
    buttons disable, and the staff/admin chip changes to **Closed**.
15. Confirm an order placed before closing can still be paid and moved through the staff queue.
16. Reopen the counter and confirm students can order again without refreshing.
17. At a 320px phone width, confirm the bottom bar shows icons above labels, page content is
    not hidden behind it, and notifications and toasts appear above the bar.
