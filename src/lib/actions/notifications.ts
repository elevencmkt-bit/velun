"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/current-member";

// Marca o momento em que o membro abriu o sino. Serve só pra decidir o
// ponto vermelho — a notificação em si continua na lista depois de lida,
// porque o registro de uma mudança de privacidade não deve sumir só
// porque alguém passou o olho.
export async function markNotificationsSeen() {
  const { memberId } = await getCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("members")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
