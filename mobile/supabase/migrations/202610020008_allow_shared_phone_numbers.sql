-- A mobile number is contact information, not an account identifier. Allow a
-- family/shared phone to be used by more than one email-based login.
alter table public.profiles
  drop constraint if exists profiles_phone_e164_key;
