import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora RLS. Só para uso em Server
// Actions que precisam escrever em recursos sem policy de usuário
// autenticado (ex.: upload no bucket "avatars"). Nunca importar isso
// num Client Component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
