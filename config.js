// Supabase connection settings (Project Settings -> API in the Supabase dashboard).
//
// The anon key is designed to be public: it only identifies the project. What it can
// access is controlled by the row-level security policies in supabase/schema.sql, which
// only let the signed-in owner read or write their data.
//
// NEVER put the "service_role" key here.
window.MARGINALIA_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY"
};
