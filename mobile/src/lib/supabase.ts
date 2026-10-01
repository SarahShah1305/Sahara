import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

// Supabase publishable keys are designed to be included in client apps.
// Row Level Security must still protect database data; never put a service_role
// key in this app. Environment variables can override these demo defaults.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  'https://wfwzuoctdnhplnmvvuok.supabase.co';
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_zgu5ckHUkTa_BqN9xxSKGA_d4liolhZ';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
