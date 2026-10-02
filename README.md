# Sahara

**Right Care. Right Now.**

Sahara brings patients, emergency coordinators, hospital teams, and administrators into one care-coordination app for Hyderabad, Sindh. It helps people discover nearby hospitals, compare reported services and capacity, schedule appointments, and send bed or emergency referral requests to the right hospital team—all from one place.

> **Prototype notice:** Hospital listings and seeded capacity, prices, doctors, and activity may be synthetic or unverified. Sahara is not connected to hospital operating systems and must not be used to make real emergency or treatment decisions. Call local emergency services or the hospital directly when urgent care is needed.

## Project team

- Syeda Sara Shah
- Diya Kumari
- Noor-ul-huda
- Mehreen Nadeem

## Current app

- **Patient:** search Hyderabad hospitals by care/resource need, location, distance, starting budget, hospital type, specialty, 24-hour availability, and ambulance availability; create an immediately confirmed prototype appointment; submit bed/room requests and view their status.
- **Ambulance / emergency worker:** compare emergency resources, send referrals to a hospital, and track referral responses.
- **Hospital staff:** view requests for a selected hospital, accept or reject them, and adjust reported resource capacity.
- **Administrator:** search facility records, filter for review/inactive status, update review status, and view requests and activity.
- **Appointment and request scheduling:** choose a date and time. Appointments and bed/room requests are separate: accepting a bed/room request changes capacity; booking an appointment does not.
- **Platforms:** Expo Go for development, a web build hosted on Expo, and an internal Android APK build through EAS.

Role selection is intentionally open for this hackathon prototype. It is **not** real staff verification or production authorization.

## Repository layout

```text
.
├── README.md
├── architecture.md
├── PRD.md
└── mobile/
    ├── App.tsx                    # App flow, search, booking, and request orchestration
    ├── app.json                   # Expo app and platform configuration
    ├── eas.json                   # EAS build profiles (preview creates an APK)
    ├── src/
    │   ├── data/                  # Hospital and specialty seed datasets
    │   ├── features/auth/         # Email/password account screen and validation
    │   ├── features/dashboard/    # Role-specific dashboards
    │   └── lib/                   # Supabase client
    └── supabase/
        ├── schema.sql             # Base tables, profiles, and RLS setup
        └── migrations/            # Demo seed, request, capacity, and review SQL
```

## Run locally

Requirements: Node.js/npm, Git, and Expo Go on a compatible phone for device preview.

```sh
cd mobile
npm ci
```

Create `mobile/.env` from `mobile/.env.example`, then set the Supabase project URL and **publishable** key:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

Never put a Supabase `service_role` key in the app. Keep `.env` local; do not commit it. The app needs a working Supabase project for sign-up, sign-in, appointments, and shared requests.

Start Expo from the `mobile` folder:

```sh
npx expo start
```

Scan the QR code with Expo Go. To run the browser version locally:

```sh
npm run web
```

## Supabase setup

Follow [mobile/supabase/SETUP.md](mobile/supabase/SETUP.md). In summary:

1. Create a Supabase project and configure email/password sign-ups to match the prototype (email confirmation is expected to be off for immediate sign-in).
2. Run `mobile/supabase/schema.sql` in the Supabase SQL Editor.
3. Run the demo and feature migrations in filename order: `202610010002`, `202610010003`, then `202610020004` through `202610020008`.
4. Confirm the app’s local `.env` values point to this same Supabase project.

Migrations add demo facilities/capacity, role-preview policies, appointment/resource-request separation, admin review fields, duplicate-request handling, request scheduling, and shared-phone support. Apply migrations to the same Supabase project used by the app. Never use live patient information in this prototype.

## Deployments

- **Web demo:** [sahara-support.expo.app](https://sahara-support.expo.app). The Expo production URL is a stable alias for its EAS Hosting project; production deployments update the app shown there.
- **Android APK:** from `mobile/`, run `npx eas-cli@latest build --platform android --profile preview`. The `preview` profile is configured for an installable APK. Builds must use the existing Sahara EAS project and signing credentials to update an existing installation.

Only deploy after reviewing the preview build. The Android APK and web deployment are separate deliverables.

## Useful commands

Run these from `mobile/`:

```sh
npm ci
npx expo start
npm run web
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile preview
```

## Product and technical docs

- [Product requirements](PRD.md)
- [Architecture](architecture.md)
- [Supabase setup](mobile/supabase/SETUP.md)
