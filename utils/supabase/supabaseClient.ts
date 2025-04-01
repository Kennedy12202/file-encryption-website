import { createClient } from "@supabase/supabase-js";

const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseURL || !supabaseAnonKey) {
    throw new Error('Supabase URL and anon key must be provided');
}

export const supabase = createClient(supabaseURL, supabaseAnonKey);