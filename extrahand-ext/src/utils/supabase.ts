// supabase.ts
import { createClient } from '@supabase/supabase-js';

// We get these from the Vite env or hardcode for now based on the webapp config
const SUPABASE_URL = 'https://qqrsbytiqwwuumyctrsc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OYYr4EQYe1swYIu8rNG5Iw_JWZtXI5W';

export function getSupabaseClient(authToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  });
}

export async function syncPublicKeyToSupabase(authToken: string, publicKeyJwk: string) {
  const supabase = getSupabaseClient(authToken);
  
  // We don't have the user ID directly from the token payload easily on client side without a JWT decoder,
  // but Supabase infers it from the Authorization header for RLS.
  // Actually, we can fetch the user to get their ID:
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Could not get user from auth token");

  const { error } = await supabase
    .from('user_public_keys')
    .upsert({ user_id: user.id, public_key: publicKeyJwk });

  if (error) {
    console.error("Failed to sync public key:", error);
    throw error;
  }
}

export async function getEncryptedApiKeys(authToken: string) {
  const supabase = getSupabaseClient(authToken);
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('*')
    .single();

  if (error) {
    console.error("Failed to get API keys:", error);
    return null;
  }
  return data;
}
