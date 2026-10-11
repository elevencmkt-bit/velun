"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import {
  confirmImport,
  discardImport,
  importStatement,
  setStagedCategory,
  toggleStagedRow,
} from "@/lib/actions/imports";
import { formatCents, type CurrencyCode } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Account = { id: string; name: string; isPersonal: boolean };
type Category = { id: string; name: string; kind: string };
type OpenImport = {
  id: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  balanceMatches: boolean;
};
type Row = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  direction: "in" | "out";
  categoryId: string | null;
  isDuplicate: boolean;
  isIncluded: boolean;
};

const NO_CATEGORY = "__none__";

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function ImportWorkspace({
  accounts,
  categories,
  openImport,
  rows,
  currency,
}: {
  accounts: Account[];
  categories: Category[];
  openImport: OpenImport | null;
  rows: Row[];
  currency: CurrencyCode;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Algo deu errado.");
      }
    });
  }

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await importStatement(formData);
        // Falha prevista volta como resultado, não como exceção — a
        // mensagem aqui é a real, não um código do React.
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Algo deu errado ao ler o extrato.");
      }
    });
  }

  const included = rows.filter((r) => r.isIncluded);
  const includedTotal = included.reduce(
    (sum, r) => sum + (r.direction === "in" ? r.amountCents : -r.amountCents),
    0,
  );
  const duplicates = rows.filter((r) => r.isDuplicate).length;

  if (!openImport) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Importar</h1>
          <p className="text-page-subtitle">
            Extrato da Regions em PDF. Os lançamentos passam por revisão antes de entrar.
          </p>
        </div>

        <Card className="max-w-xl">
          <CardContent>
            <form onSubmit={onUpload} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="account_id">Conta do extrato</Label>
                <Select name="account_id" required>
                  <SelectTrigger id="account_id">
                    <SelectValue placeholder="Escolha a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.isPersonal ? " (pessoal)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="file">Arquivo PDF</Label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="text-sm file:mr-3 file:rounded-lg file:border file:border-(--border-primary) file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
                />
              </div>

              {error ? <p className="text-sm text-(--expense)">{error}</p> : null}

              <Button type="submit" disabled={isPending || accounts.length === 0}>
                <Upload className="mr-2 h-4 w-4" />
                {isPending ? "Lendo o extrato..." : "Importar extrato"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Revisar importação</h1>
          <p className="text-page-subtitle">
            {openImport.fileName} · {shortDate(openImport.periodStart)} a{" "}
            {shortDate(openImport.periodEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => discardImport(openImport.id))}
          >
            Descartar
          </Button>
          <Button
            disabled={isPending || included.length === 0}
            onClick={() => run(() => confirmImport(openImport.id))}
          >
            {isPending ? "Confirmando..." : `Confirmar ${included.length} lançamentos`}
          </Button>
        </div>
      </div>

      {/* A conferência contra o próprio extrato é o que separa importação
          automática confiável de aposta. Fica em cima, antes da grade. */}
      <Card>
        <CardContent className="flex items-start gap-3">
          {openImport.balanceMatches ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--income)" }} />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--expense)" }} />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-card-title">
              {openImport.balanceMatches
                ? "O saldo bate com o extrato"
                : "O saldo não bate com o extrato"}
            </span>
            <span className="text-sm text-(--text-muted)">
              {openImport.balanceMatches
                ? `${rows.length} lançamentos lidos, e o saldo reconstruído dia a dia fecha com o do banco.`
                : "Revise os lançamentos antes de confirmar — pode haver linha faltando ou lida errado."}
            </span>
          </div>
        </CardContent>
      </Card>

      {duplicates > 0 ? (
        <p className="text-sm text-(--text-muted)">
          {duplicates === 1
            ? "1 lançamento já existe nessa conta e veio desmarcado."
            : `${duplicates} lançamentos já existem nessa conta e vieram desmarcados.`}
        </p>
      ) : null}

      {error ? <p className="text-sm text-(--expense)">{error}</p> : null}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-(--text-muted)">
                <th className="w-12 px-4 py-3" />
                <th className="w-20 px-2 py-3">Data</th>
                <th className="px-2 py-3">Descrição</th>
                <th className="w-52 px-2 py-3">Categoria</th>
                <th className="w-32 px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0"
                  style={{ opacity: row.isIncluded ? 1 : 0.45 }}
                >
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={row.isIncluded}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        run(() => toggleStagedRow(row.id, checked === true))
                      }
                      aria-label={`Incluir ${row.description}`}
                    />
                  </td>
                  <td className="px-2 py-2 text-(--text-muted)">{shortDate(row.date)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{row.description}</span>
                      {row.isDuplicate ? <Badge variant="secondary">Já existe</Badge> : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={row.categoryId ?? NO_CATEGORY}
                      disabled={isPending}
                      onValueChange={(value) =>
                        run(() =>
                          setStagedCategory(row.id, value === NO_CATEGORY ? null : value),
                        )
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                        {categories
                          .filter((c) =>
                            row.direction === "in" ? c.kind === "income" : c.kind === "expense",
                          )
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{ color: row.direction === "in" ? "var(--income)" : "var(--expense)" }}
                  >
                    {row.direction === "in" ? "+" : "-"}
                    {formatCents(row.amountCents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-sm text-(--text-muted)">
        Marcados somam {formatCents(includedTotal, currency)} no período.
      </p>
    </div>
  );
}
