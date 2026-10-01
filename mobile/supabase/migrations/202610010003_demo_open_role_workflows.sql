-- Prototype-only: any signed-in account may use any role dashboard.
-- This deliberately opens demo appointment visibility and response controls.

drop policy if exists "Users read own demo appointments" on public.sahara_appointments;
drop policy if exists "Demo users read all demo appointments" on public.sahara_appointments;
create policy "Demo users read all demo appointments"
  on public.sahara_appointments for select to authenticated
  using (demo_only = true);

create or replace function public.mark_demo_appointment_accepted(p_appointment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.sahara_appointments
  set status = 'demo_accepted'
  where id = p_appointment_id and status = 'requested' and demo_only = true;
  if not found then raise exception 'Demo appointment could not be updated'; end if;
end;
$$;

create or replace function public.reject_demo_appointment(p_appointment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_hospital_id text; v_resource_type text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.sahara_appointments
  set status = 'cancelled'
  where id = p_appointment_id and status = 'requested' and demo_only = true
  returning hospital_id, resource_type into v_hospital_id, v_resource_type;
  if not found then raise exception 'Demo appointment could not be rejected'; end if;
  if v_resource_type is not null then
    update public.hospital_resources
    set available = available + 1, occupied = greatest(occupied - 1, 0), updated_at = now()
    where hospital_id = v_hospital_id and resource_type = v_resource_type;
  end if;
end;
$$;

revoke all on function public.mark_demo_appointment_accepted(uuid) from public;
grant execute on function public.mark_demo_appointment_accepted(uuid) to authenticated;
revoke all on function public.reject_demo_appointment(uuid) from public;
grant execute on function public.reject_demo_appointment(uuid) to authenticated;
