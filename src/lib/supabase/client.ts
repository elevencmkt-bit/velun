import { createBrowserClient } from "@supabase/ssr";

// Sem generic de Database ainda — trocar por createBrowserClient<Database>
// depois de rodar `supabase gen types` contra o projeto real (ver
// src/lib/supabase/types.ts).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
