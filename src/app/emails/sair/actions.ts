"use server";

import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/email/unsubscribe";

export async function confirmUnsubscribe(formData: FormData) {
  const t = String(formData.get("t") ?? "");
  const k = String(formData.get("k") ?? "");
  const ok = await unsubscribeByToken(t, k);
  const params = new URLSearchParams({ t, k, ...(ok ? { feito: "1" } : { erro: "1" }) });
  redirect(`/emails/sair?${params.toString()}`);
}
