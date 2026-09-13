"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/current-member";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function updateProfile(formData: FormData) {
  const { memberId } = await getCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome é obrigatório.");

  const avatar = formData.get("avatar");
  let avatarUrl: string | undefined;

  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_AVATAR_BYTES) throw new Error("Foto muito grande (máximo 2MB).");
    if (!ALLOWED_TYPES.includes(avatar.type)) throw new Error("Formato de imagem não suportado.");

    const ext = avatar.name.split(".").pop() || "jpg";
    const path = `${memberId}/avatar.${ext}`;

    // Upload precisa da service role porque o bucket não tem policy de
    // authenticated write — fica só a leitura pública liberada.
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, avatar, { upsert: true, contentType: avatar.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrl } = admin.storage.from("avatars").getPublicUrl(path);
    avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
  }

  const { data, error } = await supabase
    .from("members")
    .update({ display_name: name, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", memberId)
    .select("id");

  if (error) throw new Error(error.message);
  // RLS bloqueando o update não gera erro, só devolve 0 linhas — sem
  // essa checagem a escrita falha em silêncio (foi exatamente o bug
  // antes da policy de UPDATE em `members` existir).
  if (!data || data.length === 0) {
    throw new Error("Não foi possível salvar o perfil (permissão negada).");
  }

  revalidatePath("/", "layout");
}
