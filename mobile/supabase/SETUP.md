# Connect authentication and staff approvals

The app uses Supabase Auth for email/password accounts. A new account is always created as `patient`. Pakistani mobile numbers are stored in `+923XXXXXXXXX` format; the app checks the format, but does not prove that the user owns that number. Phone ownership checks require an SMS/WhatsApp OTP provider, which can add cost.

## First setup

1. Create a Supabase project and wait for its database to finish provisioning.
2. In Supabase, open **SQL Editor → New query**, paste `schema.sql`, and run it.
3. In **Project settings → API**, copy the project URL and the publishable key. Do not use or expose the `service_role` key in the app.
4. In `mobile/`, copy `.env.example` to `.env`, then replace the two placeholders with the URL and publishable key.
5. Restart Expo after saving `.env`:

   ```sh
   cd mobile
   npx expo start --tunnel --clear
   ```

6. Create a patient account with a valid email, Pakistani mobile number and matching passwords. Confirm the email link, then sign in with email and password.

Until these steps are done, the app validates the form but explicitly tells the user that the account was not saved.

## Demo dashboards, specialties, appointments and capacity

For the hackathon demonstration, run `supabase/migrations/202610010002_demo_portal.sql` in the Supabase SQL Editor after `schema.sql`. This seeds all 30 workbook hospitals, 31 specialty categories, synthetic demo doctors for each hospital/specialty, bed/resource counts, and private-room counts. Everything seeded by this migration is marked `demo_only`; the workbook’s capacities and hospital records are not live or independently verified.

The patient results show General, Private Room and ICU counts. Appointment booking offers demo dates/times and synthetic doctors. Reserving a bed calls an atomic database function so concurrent bookings cannot claim the same remaining count. Other signed-in app sessions refresh counts about every four seconds. The app marks the appointment `DEMO ACCEPTED` after a short delay; this is an automated prototype state, not a hospital response.

The home screen has a prototype role picker for Patient, Hospital Staff, Administrator and Ambulance Coordinator. Selecting a staff role is only a local demo preview, not staff authentication. Appointment rows remain private to their owner, including when previewing another dashboard role. Never enter real patient data or use these demo counts for care decisions. Remove the demo role picker and tighten database policies before a real pilot.

