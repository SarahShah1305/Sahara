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

For the hackathon demonstration, run `supabase/migrations/202610010002_demo_portal.sql` and `202610010003_demo_open_role_workflows.sql` in the Supabase SQL Editor after `schema.sql`, in that order. They seed the workbook hospitals, synthetic doctors and demo resource counts, then enable role dashboard previews.

Then run migrations `202610020004_separate_appointments_and_resource_requests.sql`, `202610020005_hospital_admin_review_and_realtime.sql`, `202610020006_dedupe_resource_requests.sql`, `202610020007_request_scheduling.sql`, and `202610020008_allow_shared_phone_numbers.sql` in order. Appointments confirm immediately and do not consume capacity. Bed/room requests appear in the hospital staff dashboard; accepting one atomically decreases available capacity and increases occupied capacity. Rejecting one leaves capacity unchanged. The patient sees request status, requested date/time, and review time. Migration 005 adds administrator controls for verification status and active/inactive hospital records, and enables Realtime request notifications with periodic refresh as a fallback. Migration 006 hides duplicate pending requests and prevents another active duplicate from being created. Migration 007 stores the date/time requested for a bed or room. Migration 008 allows different email accounts to share a contact phone number. App screens display one `DEMO` label; seeded figures and appointments are synthetic and are not live hospital availability.

The sign-in screen lets the team preview Patient, Hospital Staff, Administrator and Ambulance / Emergency Worker roles. These are prototype role selections, not staff authentication. Database policies intentionally permit signed-in demo accounts to review requests across roles. Do not use real patient data or these sample capacity figures for care decisions.
