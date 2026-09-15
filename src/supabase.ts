import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    "https://iqgrvptrtphvbmvrqntm.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_ZeUC_rH70nELk4No1GnTNg_XBtc_GlD",
);
