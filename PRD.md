# Sahara Product Requirements Document

**Product:** Sahara — Hospital Capacity and Care Coordination  
**Tagline:** Right Care. Right Now.  
**Initial geography:** Hyderabad, Sindh, Pakistan  
**Document status:** Hackathon prototype requirements and next-step product direction  
**Project team:** Syeda Sara Shah, Diya Kumari, Noor-ul-huda, Mehreen Nadeem

## 1. Product summary

Sahara helps a patient, family member, or emergency coordinator identify hospitals that may meet a care or resource need. It brings facility details, reported capacity, appointment scheduling, and bed/room/referral requests into one workflow. Hospital staff can review requests and update capacity; administrators can monitor facility records and activity.

The current build is a demonstration prototype. Hospital listings and capacity figures may be synthetic or unverified, role selection is open, and appointment confirmation is simulated by immediately recording a confirmed demo appointment. Sahara is not a clinical triage tool or a source of verified live availability.

## 2. Problem statement

During urgent care, people may need to contact hospitals one at a time to find a suitable service, specialist, bed, ICU resource, ventilator, or emergency facility. This wastes time and makes it hard to compare distance, capacity, and estimated cost. Sahara aims to give users one place to search and coordinate requests, while making resource changes visible to the relevant roles.

## 3. Goals

1. Help users find candidate hospitals using care need, location, resource availability, distance, and estimated budget.
2. Make reported capacity understandable by showing total, occupied, unavailable, and available counts by resource.
3. Separate outpatient appointment scheduling from bed/room admission requests.
4. Route bed/room requests and emergency referrals to hospital staff for review.
5. Update capacity only after staff accepts a bed/room request.
6. Provide role-specific workspaces for patients, hospital staff, ambulance/emergency workers, and administrators.
7. Keep the prototype usable on mobile and accessible through its web link.

## 4. Non-goals for this prototype

- Clinical diagnosis, automated triage, or treatment recommendations.
- A guarantee that listed availability is current or that a hospital will accept a patient.
- Production authentication or verified authorization for staff and administrators.
- Integration with hospital information systems, ambulance dispatch, payment providers, or insurance.
- Road routing or guaranteed travel-time estimates.
- Storing real patient medical records, identity documents, or detailed health histories.

## 5. Users and roles

### Patient / attendant

- Create an account and sign in.
- Search by need, location, distance, cost, specialty, facility type, hours, and ambulance availability.
- Review facility contact details, services, reported capacity, and estimated charges.
- Book a prototype appointment and view hospital, service, date/time, and amount details.
- Request a bed or room and track pending/accepted/rejected status.

### Ambulance / emergency worker

- Compare hospitals with reported emergency resources.
- Send a referral to a selected hospital with an emergency resource and optional note.
- Track hospital response and confirm transfer after acceptance.

### Hospital staff

- Select the facility they are representing in the prototype.
- Review pending bed/room requests and emergency referrals for that facility.
- Accept or reject requests.
- Adjust reported capacity for beds, rooms, ICU, ventilators, emergency resources, and related categories.
- View appointments associated with the selected facility.

### Administrator

- Search the hospital catalogue and filter records needing review or marked inactive.
- Mark facility records verified, inaccurate, pending review, active, or inactive.
- Monitor current capacity, request activity, appointments, and system counts.

**Prototype access note:** Users can choose any dashboard at sign-in. This is solely for judging/demo flow; it does not authenticate a person as a hospital employee, emergency worker, or administrator.

## 6. Core user journeys

### 6.1 Patient hospital search

1. Sign in as Patient.
2. Start a hospital search.
3. Enter an area/address or grant location permission.
4. Select care/resource need and urgency.
5. Set filters for radius, maximum starting charge, hospital type, specialty, 24-hour operation, and ambulance availability.
6. Review matching hospitals with the selected resource count, other key counts, distance when coordinates are available, and estimated price range.
7. Open an appointment or bed/room request for a chosen hospital.

### 6.2 Appointment booking

1. Select **Book appointment** on a hospital.
2. Choose an appointment date and time.
3. Confirm the appointment.
4. Show an immediate prototype confirmation and make details available in the patient dashboard.
5. Do not change resource capacity.

### 6.3 Bed/room request

1. Select a hospital and available resource.
2. Choose the date/time the resource is needed and optionally add a note.
3. Submit a pending request.
4. Show a sent confirmation and the request in the patient dashboard.
5. Show the request in the selected hospital staff queue.
6. On staff acceptance, decrement available capacity and increment occupied capacity atomically; on rejection, leave capacity unchanged.
7. Show the final decision and review time to the requester.

### 6.4 Emergency referral

1. Sign in as Ambulance / emergency worker.
2. Compare available emergency resources at candidate hospitals.
3. Select a hospital and resource; optionally add a transfer note.
4. Submit a referral and show an immediate sent confirmation.
5. Show the referral in the selected hospital’s pending request queue.
6. Hospital staff accept or reject; after acceptance, the coordinator can confirm the transfer.

### 6.5 Capacity update

1. Hospital staff select a facility.
2. View total, occupied, unavailable, and available counts for each resource.
3. Adjust reported availability or respond to a pending request.
4. The app refreshes the facility/request data using Supabase Realtime where available and periodic refresh as a fallback.

## 7. Functional requirements

| ID | Requirement | Current prototype status |
| --- | --- | --- |
| FR-01 | Register and sign in using email/password; validate email, password, name, and Pakistani phone format. | Implemented; sign-up availability depends on Supabase Auth configuration. |
| FR-02 | Offer Patient, Administrator, Hospital Staff, and Ambulance / Emergency Worker role choices. | Implemented as open demo role selection, not staff verification. |
| FR-03 | Search Hyderabad facilities by care/resource need and specialty. | Implemented using bundled JSON data and specialty catalogue. |
| FR-04 | Accept GPS or manually entered area; filter by radius when coordinates are available. | Implemented; distance is straight-line, not road distance. |
| FR-05 | Filter by budget, provider type, specialty, 24-hour availability, and ambulance availability. | Implemented using reported/sample fields. |
| FR-06 | Display capacity counts by resource, including general, emergency, ICU, NICU, ventilator, private room, isolation, operation theatre, trauma, and dialysis. | Implemented with Supabase values preferred where present and dataset fallbacks. |
| FR-07 | Allow a user to book an appointment for a selected date/time and show appointment details. | Implemented as immediate demo confirmation; it does not consume capacity. |
| FR-08 | Let a patient request a bed/room with requested date/time and optional note. | Implemented through Supabase RPC; requires the latest database migrations. |
| FR-09 | Let ambulance/emergency users send referrals to a selected hospital/resource. | Implemented through the shared request RPC and staff queue; requires migrations and working Supabase access. |
| FR-10 | Let hospital staff accept/reject pending requests for the selected facility. | Implemented; acceptance updates bed/room capacity transactionally. |
| FR-11 | Let hospital staff view and adjust resource capacity. | Implemented for prototype resource rows. |
| FR-12 | Let ambulance/emergency users track referral response and confirm a transfer. | Implemented in the demo workflow. |
| FR-13 | Let administrators search/filter records, update review status, and inspect capacity/request activity. | Implemented as prototype controls. |
| FR-14 | Refresh request state quickly across separate sessions. | Realtime subscription plus four-second polling fallback. |
| FR-15 | Keep the same production web alias when deploying new web builds. | Supported by Expo EAS Hosting production alias; the deployment still requires preview/release checks. |

## 8. Hospital search and matching

### Hard filters

- Facility is not marked inactive.
- Facility matches the entered city/area/address when location is text-based.
- Distance is within the selected radius when the user provides GPS coordinates.
- A reported count for the required resource is greater than zero.
- The minimum reported daily charge is within the user’s budget, if set.
- Hospital type, requested specialty, 24-hour operation, and ambulance filters match, if selected.

### Ordering

- With GPS coordinates, results are sorted by straight-line distance.
- Without coordinates, results are sorted alphabetically.
- The first result is visually highlighted as the best match from the current filtered set; this is not a clinical recommendation or a weighted AI score.

### Capacity categories

General beds, emergency beds, ICU beds, NICU beds, ventilators, private rooms, isolation beds, operation theatres, trauma capacity, dialysis machines, and ambulances. Every operational capacity record should track total, occupied, unavailable, available, and last updated time.

## 9. Data and trust requirements

- Store app accounts in Supabase Auth; store profile fields separately.
- Store hospital/resource data and workflow requests in structured tables with stable identifiers.
- Represent appointments separately from bed/room/referral requests.
- Keep `available`, `occupied`, and other capacity fields consistent through database transactions/functions.
- Display when information was updated and make the source/verification state clear.
- Mark seeded/demo information as synthetic or unverified in a single, visible demo notice.
- Do not use patient-sensitive data in demo fixtures or commit secrets to Git.

## 10. Non-functional requirements

- **Usability:** Mobile-first layouts, clear role-specific tasks, accessible touch targets, visible validation and submission feedback.
- **Reliability:** A failed request must show an actionable error; a successful request must return a visible confirmation and appear for the requester and receiving facility.
- **Consistency:** Capacity acceptance must be atomic and must not permit over-allocation.
- **Privacy:** Minimize patient information; production needs a privacy/security review before collecting real health data.
- **Compatibility:** Keep Expo/React Native package versions compatible with the repository’s Expo SDK. The current SDK baseline supports Android 7+ according to Expo’s SDK compatibility table.
- **Maintainability:** Keep UI feature code, static seed catalogues, Supabase client, SQL schema/migrations, and product/architecture docs organized.
- **Availability:** Clearly distinguish reported/sample capacity from verified live capacity and instruct users to contact providers directly during emergencies.

## 11. Success criteria for the hackathon demo

1. A new account can be created and immediately sign in using the configured Supabase project.
2. Each of the four role dashboards opens from the role selector.
3. Patient search applies selected location, service, budget, and facility filters.
4. A patient appointment shows hospital, care type, specialty, date/time, amount, and booking timestamp without changing capacity.
5. A patient bed/room request appears once in the corresponding hospital staff queue.
6. An ambulance referral shows a sent confirmation and appears in the selected hospital staff queue.
7. Staff acceptance changes available/occupied capacity once; rejection leaves counts unchanged.
8. Request status updates are visible to the original requester after staff action.
9. Admin can find a facility and change its review/active state.
10. Web and Android builds load the same current app logic, with separate deployment/build artifacts.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Demo capacity is mistaken for live hospital availability. | Persistent, concise demo/source status; show timestamps; never claim live integration. |
| Open role selector is mistaken for staff verification. | Label it prototype-only and restrict role assignment server-side before production. |
| Duplicate or concurrent requests overbook a resource. | Unique pending-request index and transaction-backed capacity update. |
| Supabase migrations are missing or applied to the wrong project. | Apply migrations in order and verify the app `.env` references that same project. |
| Auth signup appears to do nothing. | Show inline validation and Supabase errors; verify email sign-ups are enabled and email confirmation is configured as intended. |
| User expects route travel time from distance filter. | Label current value as straight-line distance; integrate a routing provider only after evaluating cost and reliability. |
| Real medical data introduces privacy or safety concerns. | Avoid real health data in the prototype; complete legal, privacy, safety, and operational review before launch. |

## 13. Next product milestones

1. **Prototype reliability:** complete current role flows, request errors/confirmation, schema migration instructions, and Android compatibility checks.
2. **Trusted hospital pilot:** onboard real facilities; confirm every capacity, price, location, and specialty; establish who updates data and how often.
3. **Secure authorization:** staff identity checks, facility-scoped permissions, server-side role administration, audit log, rate limiting, and account recovery.
4. **Operational integrations:** verified hospital capacity feeds, referral acknowledgement SLAs, transfer tracking, and optional ambulance coordination.
5. **Patient-ready launch:** privacy and legal review, accessibility and localization (English/Urdu/Sindhi), clinical safety review, monitoring, backups, incident process, and supported distribution channels.
