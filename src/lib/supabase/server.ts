import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Sem generic de Database ainda — trocar por createServerClient<Database>
// depois de rodar `supabase gen types` contra o projeto real (ver
// src/lib/supabase/types.ts).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado de um Server Component sem permissão de escrita;
            // o middleware já cuida de renovar a sessão nesse caso.
          }
        },
      },
    },
  );
}
