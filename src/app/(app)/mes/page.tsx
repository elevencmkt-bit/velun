import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MesPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("accounts").select("id").limit(1);

  const isEmpty = !accounts || accounts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-medium">Mês</h1>
      {isEmpty ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal text-[--ink]/70">
              Household vazio
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[--ink]/70">
            Nenhuma conta ou transação ainda. Cadastre uma conta em{" "}
            <span className="font-medium">Contas</span> ou importe um extrato em{" "}
            <span className="font-medium">Importar</span> para começar.
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-[--ink]/70">
          Entrou / Saiu / Sobrou e o donut de despesas chegam na Fase 5.
        </p>
      )}
    </div>
  );
}
