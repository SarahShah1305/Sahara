-- Sahara account and staff-access schema. Run in Supabase SQL Editor.
-- Every newly registered person starts as a patient. Staff access is never
-- granted from client-supplied metadata or a role selector.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null unique check (phone_e164 ~ '^[+]923[0-9]{9}$'),
  app_role text not null default 'patient'
    check (app_role in ('patient', 'hospital_staff', 'ambulance_coordinator', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated using (user_id = auth.uid());

create or replace function public.create_sahara_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, phone_e164, app_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone_e164', ''),
    'patient'
  );
  return new;
end;
$$;

drop trigger if exists on_sahara_auth_user_created on auth.users;
create trigger on_sahara_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_sahara_profile();

create table if not exists public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('hospital_staff', 'ambulance_coordinator')),
  hospital_name text not null,
  work_email text not null,
  employee_reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- Patient-submitted referral requests. The app stores only the typed/reversed
-- location label and chosen filters, not raw GPS coordinates or symptom notes.
create table if not exists public.care_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hospital_id text not null,
  hospital_name text not null,
  required_resource text not null check (required_resource in ('Emergency', 'ICU', 'Ventilator', 'Trauma', 'Dialysis')),
  urgency text not null check (urgency in ('Emergency now', 'Urgent today')),
  location_label text not null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_requests_user_created_idx
  on public.care_requests(user_id, created_at desc);
alter table public.care_requests enable row level security;
revoke all on public.care_requests from anon, authenticated;
grant select, insert on public.care_requests to authenticated;
create policy "Patients can submit care requests for themselves"
  on public.care_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted');
create policy "Patients can read their own care requests"
  on public.care_requests for select to authenticated
  using (user_id = auth.uid());
create policy "Admins can review care requests"
  on public.care_requests for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.app_role = 'admin'
  ));

create index if not exists staff_access_requests_user_id_idx
  on public.staff_access_requests(user_id, submitted_at desc);
alter table public.staff_access_requests enable row level security;
revoke all on public.staff_access_requests from anon, authenticated;
grant select, insert on public.staff_access_requests to authenticated;
create policy "Applicants can submit pending requests for themselves"
  on public.staff_access_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "Applicants can read their own requests"
  on public.staff_access_requests for select to authenticated
  using (user_id = auth.uid());
create policy "Admins can review staff requests"
  on public.staff_access_requests for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.app_role = 'admin'
  ));

-- Do not grant authenticated users UPDATE access to app_role or request status.
-- Verify staff by contacting the hospital using a separately verified number,
-- then update profile.app_role and the request status through the Supabase
-- Dashboard (or a trusted server-side admin tool). Never put service_role keys
-- in this mobile app.
