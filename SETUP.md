# BodaLink on Supabase

The site is plain HTML and JavaScript. Its backend is the **BODALINK** Supabase project
(tables, security rules, trip functions and storage are already created).
Accounts use **email and password**. The phone number is required as a contact number.

## Before the first sign-up (3 minutes)
1. Supabase dashboard, **Authentication, URL Configuration**:
   - Site URL: `https://josephkitonga-ship.github.io/BODALINK-/`
   - Redirect URLs: add `https://josephkitonga-ship.github.io/BODALINK-/**`
   (Email links for confirming and password reset send people back to this address.)
2. **Authentication, Sign In / Providers, Email**: for testing, turn **Confirm email OFF**.
3. Upload these files to the GitHub repo (replacing the old ones) and delete `js/server.js`.
4. Open the site, create your own account, then tell Claude your email so it can be made an admin.
   (SQL: `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`)

## Before real users sign up
Supabase's built-in email sender only delivers to your own team's addresses and is heavily limited.
Connect your own email service (Resend or Brevo both have free plans) in
**Authentication, Emails, SMTP Settings**, then turn **Confirm email ON**.
Without this, password reset emails will not reach riders and passengers.

## Also worth switching on
- Supabase, **Authentication, Password security**: turn on leaked password protection (blocks known breached passwords). It is a Supabase plan feature, so it may not be available on the free plan.

## Settings you can edit in `js/config.js`
- `SITE_URL`: the address of the live site (used in email links).
- `SUPPORT_WHATSAPP`, `SUPPORT_PHONE`, `SUPPORT_EMAIL`: shown on the Contact page and used for the WhatsApp buttons. Leave one empty to hide it. Use digits with country code, e.g. `254712345678`.
- `MPESA_NOTE`: what riders see when buying a pass, e.g. `Send KSh 100 to Till 123456`.
- `VAPID_PUBLIC_KEY`: leave empty until push alerts are built.

## How it works now
- **Day passes:** the rider pays by M-Pesa and messages BodaLink; an admin opens the rider in Admin, Riders and taps
  *Record M-Pesa payment*. New riders get a free first day when approved (switch in Admin, Rates).
- **Bidding, accepting, pickup codes, ratings, expiry:** database functions (`place_bid`, `accept_bid`, `confirm_pickup`, ...).
- **Rider IDs and selfies:** private storage; admins see them through short-lived links.
- **Adverts:** public `adverts` bucket, edited in Admin.

## Not built yet
- Push notifications to phones (needs a sender function and VAPID keys). In-app alerts work.
- M-Pesa payment automation (STK push).
- Phone number verification by SMS.
- Scheduled cleanup: the app calls `sweep` every 20 seconds while someone is signed in. `pg_cron` would make it independent.
- Fare estimate values (`fare_base`, `fare_medium`, `fare_large`) are placeholders; estimates are off by default.

## Security notes
- The anon key in `config.js` is meant to be public. **Never** put the `service_role` key in the site.
- Phone numbers are contact details only and are not verified, so someone could enter a number that is not theirs.

## Last checked
Every screen was loaded at phone (390 and 360 wide) and desktop (1280 wide) sizes against a stand-in Supabase, with no script errors, no sideways scrolling and the sign-in, booking, bidding, password reset and admin flows exercised.
The database trip flow was also tested end to end. What has not been tried is the live site talking to the real Supabase, so do one real sign-up, one ride and one parcel after you upload.

## Footer and information pages
The footer (About BodaLink, Policies and terms, Contact us, and the Flynn Technologies link) shows on the public pages. The three pages are `views/about.html`, `views/terms.html` and `views/contact.html`. Prices on them come from the live settings.
Delete the old `deck` folder from the GitHub repository. It held the presentation files, which are no longer part of the site.
The Policies and terms page is a plain-language draft. Have it reviewed before you rely on it, and check whether BodaLink must register with Kenya's Office of the Data Protection Commissioner (odpc.go.ke), since rider ID photos are personal data.
