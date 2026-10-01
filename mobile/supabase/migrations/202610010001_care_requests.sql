-- Apply this migration if Sahara's initial profiles/staff schema was already run.
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

drop policy if exists "Patients can submit care requests for themselves" on public.care_requests;
create policy "Patients can submit care requests for themselves"
  on public.care_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted');

drop policy if exists "Patients can read their own care requests" on public.care_requests;
create policy "Patients can read their own care requests"
  on public.care_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can review care requests" on public.care_requests;
create policy "Admins can review care requests"
  on public.care_requests for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.app_role = 'admin'
  ));
