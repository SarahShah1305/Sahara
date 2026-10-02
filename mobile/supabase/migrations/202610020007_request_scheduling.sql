-- Let patients and emergency coordinators choose when a bed/room request is needed.

alter table public.sahara_resource_requests
  add column if not exists requested_for timestamptz;

create or replace function public.create_sahara_resource_request(
  p_hospital_id text,
  p_hospital_name text,
  p_resource_type text,
  p_request_kind text default 'bed',
  p_reason text default '',
  p_amount_pkr integer default null,
  p_requested_for timestamptz default null
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

  begin
    insert into public.sahara_resource_requests(
      user_id, requester_name, requester_phone, requester_email, requester_role,
      request_kind, hospital_id, hospital_name, resource_type, reason, amount_pkr,
      requested_for
    ) values (
      auth.uid(), v_name, v_phone, v_email, v_role,
      p_request_kind, p_hospital_id, p_hospital_name, p_resource_type,
      coalesce(p_reason, ''), p_amount_pkr, p_requested_for
    ) returning id into v_id;
  exception when unique_violation then
    select requests.id into v_id
    from public.sahara_resource_requests as requests
    where requests.user_id = auth.uid()
      and requests.hospital_id = p_hospital_id
      and requests.resource_type = p_resource_type
      and requests.request_kind = p_request_kind
      and requests.status = 'pending'
      and requests.duplicate_hidden = false
    order by requests.created_at
    limit 1;
    if v_id is null then raise; end if;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_sahara_resource_request(text, text, text, text, text, integer, timestamptz) from public;
grant execute on function public.create_sahara_resource_request(text, text, text, text, text, integer, timestamptz) to authenticated;
