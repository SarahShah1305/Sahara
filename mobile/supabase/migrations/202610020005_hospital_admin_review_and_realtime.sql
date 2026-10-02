-- Add administrator review fields and enable immediate request updates in the app.

alter table public.sahara_hospitals
  add column if not exists verification_status text not null default 'pending',
  add column if not exists account_status text not null default 'active',
  add column if not exists admin_note text not null default '',
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sahara_hospitals_verification_status_check') then
    alter table public.sahara_hospitals
      add constraint sahara_hospitals_verification_status_check
      check (verification_status in ('pending', 'verified', 'inaccurate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sahara_hospitals_account_status_check') then
    alter table public.sahara_hospitals
      add constraint sahara_hospitals_account_status_check
      check (account_status in ('active', 'inactive'));
  end if;
end;
$$;

create or replace function public.review_sahara_hospital(
  p_hospital_id text,
  p_verification_status text,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.sahara_hospitals
  set verification_status = p_verification_status,
      account_status = p_account_status,
      reviewed_at = now()
  where hospital_id = p_hospital_id;
  if not found then raise exception 'Hospital record not found'; end if;
end;
$$;

revoke all on function public.review_sahara_hospital(text, text, text) from public;
grant execute on function public.review_sahara_hospital(text, text, text) to authenticated;

-- Supabase Realtime is optional for the app; keep its four-second refresh as a fallback.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sahara_resource_requests'
     ) then
    execute 'alter publication supabase_realtime add table public.sahara_resource_requests';
  end if;
end;
$$;
