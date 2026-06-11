// Public, client-safe Supabase credentials. The publishable/anon key is
// designed to be exposed in front-end code; access control is enforced
// server-side via the SECURITY DEFINER RPC functions (see supabase-schema.sql),
// which require the account hash. There is no email/password auth — the hash
// is the credential.
//
// We talk to Supabase over plain `fetch` against the PostgREST RPC endpoints
// (see store.js) instead of @supabase/supabase-js. We only ever call two
// functions, so the full client library (auth + realtime + storage) was pure
// dead weight in the bundle.
export const SUPABASE_URL = "https://uwmgisvhhzcbcisdlafp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_9B09KmOSMndFqdhDsHt6Kw_TRZd_jZ5";
