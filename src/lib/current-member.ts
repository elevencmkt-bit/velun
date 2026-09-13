import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("id, household_id")
    .eq("id", user.id)
    .single();

  if (error || !member) {
    throw new Error("Usuário autenticado sem membership em nenhum household.");
  }

  return { memberId: member.id as string, householdId: member.household_id as string };
}
