import { createClient } from '@supabase/supabase-js';

// these are public keys, ok to be in the browser. can override with .env
const url = import.meta.env.VITE_SUPABASE_URL || 'https://oiqyvugxcmbqhmpfjoqp.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable__Am00oAGfjnzS4Fq7kOlzA_XUzaj5CP';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// call an edge function, returns the json or throws the error message
export async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data;
}
