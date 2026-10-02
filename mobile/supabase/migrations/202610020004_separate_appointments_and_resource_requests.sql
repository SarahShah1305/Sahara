-- Separate immediate demo appointment confirmations from manual bed/resource requests.
-- Apply this migration in the Supabase SQL editor before deploying the new app.

alter table public.sahara_appointments
  add column if not exists amount_pkr integer,
  add column if not exists care_type text not null default 'General Medicine';

-- Older prototype appointment rows also consumed capacity immediately. They were
-- not real admissions, so restore their capacity before detaching them from appointments.
with old_reservations as (
  select hospital_id, resource_type, count(*)::integer as quantity
  from public.sahara_appointments
  where resource_type is not null and status <> 'cancelled'
  group by hospital_id, resource_type
)
update public.hospital_resources as resources
set available = least(
      resources.total - resources.occupied - resources.unavailable,
      resources.available + old_reservations.quantity
    ),
    occupied = greatest(0, resources.occupied - old_reservations.quantity),
    updated_at = now()
from old_reservations
where resources.hospital_id = old_reservations.hospital_id
  and resources.resource_type = old_reservations.resource_type;

update public.sahara_appointments
set resource_type = null
where resource_type is not null;

drop function if exists public.create_demo_appointment(text, text, text, timestamptz, integer);

create function public.create_demo_appointment(
  p_hospital_id text,
  p_care_type text,
  p_specialty text,
  p_doctor_name text,
  p_appointment_at timestamptz,
  p_amount_pkr integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  insert into public.sahara_appointments(
    user_id, hospital_id, care_type, specialty, doctor_name, appointment_at,
    amount_pkr, resource_type, status, demo_only
  ) values (
    auth.uid(), p_hospital_id, p_care_type, p_specialty, p_doctor_name, p_appointment_at,
    p_amount_pkr, null, 'demo_accepted', true
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_demo_appointment(text, text, text, text, timestamptz, integer) from public;
grant execute on function public.create_demo_appointment(text, text, text, text, timestamptz, integer) to authenticated;

create table if not exists public.sahara_resource_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null default 'Patient',
  requester_phone text,
  requester_email text,
  requester_role text not null default 'patient'
    check (requester_role in ('patient', 'hospital_staff', 'administrator', 'ambulance_coordinator')),
  request_kind text not null default 'bed'
    check (request_kind in ('bed', 'referral')),
  hospital_id text not null references public.sahara_hospitals(hospital_id),
  hospital_name text not null,
  resource_type text not null
    check (resource_type in ('general_bed', 'private_room', 'emergency_bed', 'icu_bed', 'nicu_bed', 'ventilator', 'isolation_bed', 'operation_theatre', 'trauma_bed', 'dialysis_machine')),
  reason text not null default '',
  amount_pkr integer,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'transfer_confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sahara_resource_requests_hospital_status_idx
  on public.sahara_resource_requests(hospital_id, status, created_at desc);
create index if not exists sahara_resource_requests_user_created_idx
  on public.sahara_resource_requests(user_id, created_at desc);

alter table public.sahara_resource_requests enable row level security;
revoke all on public.sahara_resource_requests from anon, authenticated;
grant select on public.sahara_resource_requests to authenticated;

drop policy if exists "Signed in users read demo resource requests" on public.sahara_resource_requests;
create policy "Signed in users read demo resource requests"
  on public.sahara_resource_requests for select to authenticated
  using (true);

create or replace function public.create_sahara_resource_request(
  p_hospital_id text,
  p_hospital_name text,
  p_resource_type text,
  p_request_kind text default 'bed',
  p_reason text default '',
  p_amount_pkr integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_request_kind not in ('bed', 'referral') then raise exception 'Invalid request type'; end if;

  select
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Patient'),
    nullif(u.raw_user_meta_data ->> 'phone_e164', ''),
    u.email,
    case coalesce(u.raw_user_meta_data ->> 'demo_role', 'patient')
      when 'hospital_staff' then 'hospital_staff'
      when 'administrator' then 'administrator'
      when 'ambulance_coordinator' then 'ambulance_coordinator'
      else 'patient'
    end
  into v_name, v_phone, v_email, v_role
  from auth.users as u
  where u.id = auth.uid();

  insert into public.sahara_resource_requests(
    user_id, requester_name, requester_phone, requester_email, requester_role,
    request_kind, hospital_id, hospital_name, resource_type, reason, amount_pkr
  ) values (
    auth.uid(), v_name, v_phone, v_email, v_role,
    p_request_kind, p_hospital_id, p_hospital_name, p_resource_type,
    coalesce(p_reason, ''), p_amount_pkr
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.review_sahara_resource_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.sahara_resource_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  select * into v_request
  from public.sahara_resource_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'This request has already been handled';
  end if;

  if p_accept then
    update public.hospital_resources
    set available = available - 1,
        occupied = occupied + 1,
        updated_at = now()
    where hospital_id = v_request.hospital_id
      and resource_type = v_request.resource_type
      and available > 0;

    if not found then raise exception 'No available capacity remains for this resource'; end if;

    update public.sahara_resource_requests
    set status = 'accepted', updated_at = now()
    where id = p_request_id;
  else
    update public.sahara_resource_requests
    set status = 'rejected', updated_at = now()
    where id = p_request_id;
  end if;
end;
$$;

create or replace function public.confirm_sahara_transfer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  update public.sahara_resource_requests
  set status = 'transfer_confirmed', updated_at = now()
  where id = p_request_id
    and user_id = auth.uid()
    and request_kind = 'referral'
    and status = 'accepted';

  if not found then raise exception 'Accepted referral was not found'; end if;
end;
$$;

revoke all on function public.create_sahara_resource_request(text, text, text, text, text, integer) from public;
revoke all on function public.review_sahara_resource_request(uuid, boolean) from public;
revoke all on function public.confirm_sahara_transfer(uuid) from public;
grant execute on function public.create_sahara_resource_request(text, text, text, text, text, integer) to authenticated;
grant execute on function public.review_sahara_resource_request(uuid, boolean) to authenticated;
grant execute on function public.confirm_sahara_transfer(uuid) to authenticated;
