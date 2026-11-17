import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://okqhitcqzfocepdufieh.supabase.co';
const supabaseKey = 'sb_publishable_CBhc2QC60jM87NsdXq0ymA_CAjYYLRG';

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
);
