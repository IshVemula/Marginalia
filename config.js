// Supabase connection settings (Project Settings -> API in the Supabase dashboard).
//
// The anon key is designed to be public: it only identifies the project. What it can
// access is controlled by the row-level security policies in supabase/schema.sql, which
// only let the signed-in owner read or write their data.
//
// NEVER put the "service_role" key here.
window.MARGINALIA_CONFIG = {
  supabaseUrl: "https://jcxaojzpmbqywpcmyumq.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjeGFvanpwbWJxeXdwY215dW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MjE3MjQsImV4cCI6MjEwNzQ5NzcyNH0.p5xjMTN6JzvEWKrKAH_61L9rKL11uonNiQNvyqxTgwo"
};
