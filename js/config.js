/* BodaLink settings. The Supabase URL and anon key are meant to be public (row level security protects the data).
   Never put a service_role key in this file. */
window.BL_CONFIG = {
  SUPABASE_URL: "https://iommsdxzpswgdvxxxmdc.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvbW1zZHh6cHN3Z2R2eHh4bWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NTU0MDUsImV4cCI6MjExMDIzMTQwNX0.QpKg5IORPIoKUXidbfiB-q2xEokuDL0olYGkvOAZeWU",
  // Where email links (confirm, reset password) send people back to. Must also be listed in Supabase, Authentication, URL Configuration.
  SITE_URL: "https://josephkitonga-ship.github.io/BODALINK-/",
  // Where riders and passengers can reach BodaLink on WhatsApp, digits only with country code, e.g. "254712345678".
  SUPPORT_WHATSAPP: "254742258137",
  // Shown on the Contact page. Phone and email are optional, leave empty to hide them.
  SUPPORT_PHONE: "254742258137",
  SUPPORT_EMAIL: "",
  // Shown to a rider who wants to buy a day pass, e.g. "Send KSh 100 to Till 123456".
  MPESA_NOTE: "",
  // Public VAPID key for web push alerts (needs a push sender, see SETUP.md). Leave empty to hide alerts opt-in.
  VAPID_PUBLIC_KEY: "",
};
