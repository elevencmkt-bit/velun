"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Info,
  Link2,
  Lock,
  Link2Off,
  Pencil,
  Sparkles,
  Undo2,
  Upload,
} from "lucide-react";
import {
  confirmImport,
  discardImport,
  dismissForecast,
  importStatement,
  setStagedCategory,
  setStagedMerge,
  toggleStagedRow,
  renameStagedRow,
  setStagedCardPayment,
  undoImport,
  type ActionResult,
} from "@/lib/actions/imports";
import { extractPdfText } from "@/lib/import/extract-pdf-text";
import type { CurrencyCode } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Money } from "@/components/money";
import { AccountAvatar } from "@/components/account-avatar";

type Account = { id: string; name: string; isPersonal: boolean; type: string; institution: string | null };
type Category = { id: string; name: string; kind: string };
type OpenImport = {
  id: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  /** null: o extrato não traz saldo pra conferir (Nomad). */
  balanceMatches: boolean | null;
};
type HistoryEntry = {
  id: string;
  fileName: string;
  accountName: string;
  accountType: string;
  accountInstitution: string | null;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
};
type Row = {
  id: string;
  date: string;
  description: string;
  /** Texto como veio do banco, quando difere do nome limpo. */
  bankDescription: string | null;
  amountCents: number;
  direction: "in" | "out";
  categoryId: string | null;
  /** De onde veio a categoria: escolhida na mão ou sugerida. */
  categorySource: "manual" | "model" | "rule" | "none";
  isDuplicate: boolean;
  /** Linha que parece ser pagamento da fatura de um cartão. */
  cardPayment: { cardName: string; accepted: boolean } | null;
  isIncluded: boolean;
  /**
   * Lançamento seu que esta linha parece ser: uma previsão (vem marcada
   * pra juntar) ou um lançamento já confirmado (vem desmarcado).
   */
  match: {
    description: string;
    date: string;
    accepted: boolean;
    kind: "forecast" | "confirmed";
  } | null;
};
type Double = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  direction: "in" | "out";
  statementDates: string[];
};
type Forecast = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  direction: "in" | "out";
};

const NO_CATEGORY = "__none__";

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Seletor de categoria de uma linha da revisão.
 *
 * As opções são filtradas pela direção da linha — categoria de despesa
 * não serve pra entrada. E se a categoria marcada não estiver entre
 * elas, o seletor mostra "Sem categoria" em vez de ficar em branco:
 * seletor vazio é pior que seletor errado, porque esconde que tem algo
 * marcado e quem revisa nem sabe que precisa mexer.
 */
function CategoryCell({
  row,
  categories,
  disabled,
  onChange,
}: {
  row: Row;
  categories: Category[];
  disabled: boolean;
  onChange: (categoryId: string | null) => void;
}) {
  const options = categories.filter((c) =>
    row.direction === "in" ? c.kind === "income" : c.kind === "expense",
  );

  const selected = options.some((c) => c.id === row.categoryId)
    ? row.categoryId
    : null;
  // Sugerida (pelo que a pessoa ensinou ou pelo código do cartão): leva
  // uma marquinha pra bater o olho e conferir. Some quando ela escolhe.
  const isAuto =
    selected != null &&
    (row.categorySource === "model" || row.categorySource === "rule");

  return (
    <div className="flex items-center gap-1.5">
    <Select
      value={selected ?? NO_CATEGORY}
      disabled={disabled}
      onValueChange={(value) => onChange(value === NO_CATEGORY ? null : value)}
    >
      <SelectTrigger className="h-8">
        <SelectValue placeholder="Sem categoria" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
        {options.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {isAuto ? (
      <span
        title="Categoria automática — confira"
        aria-label="Categoria automática — confira"
        className="flex h-5 w-5 shrink-0 items-center justify-center text-(--primary)"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
    ) : (
      <span className="h-5 w-5 shrink-0" aria-hidden="true" />
    )}
    </div>
  );
}

/**
 * Nome da linha, editável no lugar. O texto do banco aparece embaixo,
 * pequeno, pra quem quiser conferir de onde o nome saiu.
 */
function NameCell({
  row,
  disabled,
  onRename,
}: {
  row: Row;
  disabled: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.description);

  function commit() {
    setEditing(false);
    const name = draft.replace(/\s+/g, " ").trim();
    if (name && name !== row.description) onRename(name);
    else setDraft(row.description);
  }

  return (
    <div className="flex min-w-0 flex-col">
      {editing ? (
        <Input
          autoFocus
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(row.description);
              setEditing(false);
            }
          }}
          className="h-8"
          aria-label="Nome do lançamento"
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft(row.description);
            setEditing(true);
          }}
          className="group flex min-w-0 items-center gap-1.5 text-left"
          title="Renomear"
        >
          <span className="truncate font-medium text-(--text-primary)">
            {row.description}
          </span>
          <Pencil className="h-3 w-3 shrink-0 text-(--text-muted) opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" />
        </button>
      )}
      {row.bankDescription && row.bankDescription !== row.description ? (
        <span
          className="truncate text-[11px] text-(--text-muted)"
          title={row.bankDescription}
        >
          {row.bankDescription}
        </span>
      ) : null}
    </div>
  );
}

export function ImportWorkspace({
  accounts,
  categories,
  openImport,
  rows,
  forecasts,
  doubles,
  history,
  currency,
}: {
  accounts: Account[];
  categories: Category[];
  openImport: OpenImport | null;
  rows: Row[];
  forecasts: Forecast[];
  doubles: Double[];
  history: HistoryEntry[];
  currency: CurrencyCode;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Mensagem técnica do erro, quando houver. Fica separada da frase pra
  // quem está usando: aparece embaixo, menor, e é o que permite
  // descobrir a causa sem acesso ao log do servidor.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // Aviso de uma importação que deu certo (ex.: "ajustei o fechamento").
  const [notice, setNotice] = useState<string | null>(null);
  // Desfazer apaga lançamentos. Pede confirmação na própria linha em vez
  // de um dialog: a pergunta fica ao lado do que vai ser apagado.
  const [confirmingUndo, setConfirmingUndo] = useState<string | null>(null);
  const router = useRouter();

  // Aviso rápido no rodapé ("mais 12 Publix foram pra Mercado").
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function run<R extends ActionResult>(
    fn: () => Promise<R>,
    onOk?: (result: R) => void,
  ) {
    setError(null);
    setErrorDetail(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          setError(result.error);
          setErrorDetail(result.detail ?? null);
          return;
        }
        onOk?.(result);
        router.refresh();
      } catch (err) {
        // Só chega aqui falha de rede ou do próprio Next — as ações não
        // lançam mais.
        setError(err instanceof Error ? err.message : "Algo deu errado.");
      }
    });
  }

  const errorBlock = error ? (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-(--expense)">{error}</p>
      {errorDetail ? (
        <p className="font-mono text-xs break-all text-(--text-muted)">
          {errorDetail}
        </p>
      ) : null}
    </div>
  ) : null;

  // Conta escolhida e arquivo, fora de um <form>: o arquivo pode chegar
  // arrastado pra área, não só pelo seletor.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const chosen = accounts.find((a) => a.id === accountId) ?? null;
  const isCardChosen = chosen?.type === "credit_card";

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    setError(null);
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Por enquanto só PDF: extrato da Regions ou da Nomad, ou fatura do Nubank.");
      return;
    }
    setFile(f);
  }

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!accountId) return setError("Escolha de qual conta é o extrato.");
    if (!file || file.size === 0) return setError("Escolha o arquivo PDF.");

    startTransition(async () => {
      // O PDF é lido aqui, no navegador. Pro servidor vai só o texto
      // extraído — o arquivo não sai da máquina.
      let text: string;
      try {
        text = await extractPdfText(file);
      } catch {
        setError(
          "Não consegui abrir esse PDF. Ele pode estar protegido por senha.",
        );
        return;
      }

      try {
        const result = await importStatement({
          accountId,
          fileName: file.name,
          text,
        });
        // Falha prevista volta como resultado, não como exceção — a
        // mensagem aqui é a real, não um código do React.
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setNotice(result.message);
        setFile(null);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Algo deu errado ao ler o extrato.",
        );
      }
    });
  }

  const included = rows.filter((r) => r.isIncluded);
  const includedTotal = included.reduce(
    (sum, r) => sum + (r.direction === "in" ? r.amountCents : -r.amountCents),
    0,
  );
  const duplicates = rows.filter((r) => r.isDuplicate).length;
  const merges = rows.filter((r) => r.match && r.match.accepted).length;

  if (!openImport) {
    const checking = accounts.filter((a) => a.type !== "credit_card");
    const cards = accounts.filter((a) => a.type === "credit_card");
    const accountButton = (a: Account) => {
      const on = a.id === accountId;
      return (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            setAccountId(a.id);
            setError(null);
          }}
          aria-pressed={on}
          className={`flex h-16 w-full items-center gap-3 rounded-[16px] border-[1.5px] bg-(--bg-surface) px-3.5 text-left transition-colors ${
            on
              ? "border-(--primary) bg-[#F5F6FF] shadow-[0_0_0_3px_rgba(83,109,254,.12)]"
              : "border-[#EAECF0] hover:border-[#C7D0FF]"
          }`}
        >
          <AccountAvatar institution={a.institution} type={a.type} size={38} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-(--text-primary)">{a.name}</span>
            <span className="block text-xs text-(--text-muted)">
              {a.type === "credit_card" ? "Cartão · fatura" : "Conta · extrato"}
              {a.isPersonal ? " · minha" : ""}
            </span>
          </span>
        </button>
      );
    };

    return (
      <div className="flex flex-col gap-5 md:gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">Importar</h1>
          <p className="text-page-subtitle">
            Traga o extrato do banco ou a fatura do cartão. Nada entra sem você revisar.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
          <form
            onSubmit={onUpload}
            className="flex flex-col gap-5 rounded-[20px] bg-(--bg-surface) p-4 shadow-(--shadow-card) md:gap-6 md:p-6"
          >
            <div>
              <div className="mb-2.5 text-[11px] font-bold tracking-[0.04em] text-(--text-light) uppercase md:text-xs">
                1 · De qual conta é?
              </div>
              {accounts.length === 0 ? (
                <p className="text-sm text-(--text-muted)">Crie uma conta antes de importar.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-2.5">{checking.map(accountButton)}</div>
                  {cards.length > 0 ? (
                    <>
                      <div className="mt-3.5 mb-2 text-xs font-semibold text-(--text-light)">Cartões</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-2.5">{cards.map(accountButton)}</div>
                    </>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <div className="mb-2.5 text-[11px] font-bold tracking-[0.04em] text-(--text-light) uppercase md:text-xs">
                2 · {isCardChosen ? "Mande a fatura" : "Mande o PDF"}
              </div>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-[18px] border-2 border-dashed px-4 transition-colors max-md:h-[76px] md:h-[200px] md:flex-col md:justify-center md:gap-2.5 md:px-6 md:text-center ${
                  dragging ? "border-(--primary) bg-[#EEF1FF]" : "border-[#C7D0FF] bg-[#F8F9FF] hover:bg-[#F3F5FF]"
                }`}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--primary-light) text-(--primary) md:h-[52px] md:w-[52px] md:rounded-[16px]">
                  {file ? <FileText className="h-5 w-5 md:h-6 md:w-6" /> : <Upload className="h-5 w-5 md:h-6 md:w-6" />}
                </span>
                {file ? (
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-(--text-primary)">{file.name}</span>
                    <span className="block text-[13px] text-(--text-muted)">
                      Pronto pra ler · <span className="font-semibold text-(--primary)">trocar arquivo</span>
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-(--text-primary)">
                      <span className="max-md:hidden">Arraste {isCardChosen ? "a fatura do cartão" : "o extrato"} aqui</span>
                      <span className="md:hidden">Escolher {isCardChosen ? "a fatura" : "o extrato"}</span>
                    </span>
                    <span className="block text-[13px] text-(--text-muted)">
                      <span className="max-md:hidden">
                        ou <span className="font-semibold text-(--primary)">clique pra escolher</span> · só PDF
                      </span>
                      <span className="md:hidden">Regions, Nomad ou Nubank, em PDF</span>
                    </span>
                  </span>
                )}
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2 max-md:hidden">
                <span className="text-xs text-(--text-light)">O Velun lê:</span>
                <span className="inline-flex h-7 items-center rounded-full bg-[#F4F5F8] px-2.5 text-xs font-semibold text-(--text-secondary)">
                  Extrato Regions
                </span>
                <span className="inline-flex h-7 items-center rounded-full bg-[#F4F5F8] px-2.5 text-xs font-semibold text-(--text-secondary)">
                  Extrato Nomad
                </span>
                <span className="inline-flex h-7 items-center rounded-full bg-[#F4F5F8] px-2.5 text-xs font-semibold text-(--text-secondary)">
                  Fatura Nubank
                </span>
                <span className="inline-flex h-7 items-center rounded-full border-[1.5px] border-dashed border-[#D0D5DD] px-2.5 text-xs font-semibold text-(--text-light)">
                  mais bancos em breve
                </span>
              </div>
            </div>

            {errorBlock}
            {notice ? (
              <p className="rounded-xl bg-(--primary-soft) px-3 py-2 text-sm text-(--primary-hover)" role="status">
                {notice}
              </p>
            ) : null}

            <Button type="submit" disabled={isPending || accounts.length === 0} className="h-12 rounded-[14px] text-[15px]">
              {isPending ? "Lendo o PDF…" : "Ler e revisar"}
            </Button>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-(--text-muted) lg:hidden">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--primary)" />
              O arquivo é lido aqui no aparelho e não sai dele. Só os lançamentos que você aprovar são salvos.
            </p>
          </form>

          <aside className="flex flex-col gap-4 rounded-[20px] bg-(--bg-surface) p-6 shadow-(--shadow-card) max-lg:hidden">
            <h2 className="text-card-title">Como funciona</h2>
            {[
              ["Escolha a conta", "Conta corrente recebe extrato; cartão recebe fatura."],
              ["Mande o PDF do banco", "O mesmo que você baixa no app ou no site do banco."],
              [
                "Revise antes de entrar",
                "O Velun sugere categoria, junta o que já foi lançado e marca pagamento de fatura. Você confirma.",
              ],
            ].map(([title, text], i) => (
              <div key={title} className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--primary-light) text-[13px] font-extrabold text-[#4257CB]">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-semibold text-(--text-primary)">{title}</div>
                  <div className="text-[13px] leading-relaxed text-(--text-muted)">{text}</div>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5 rounded-[14px] bg-[#F5F6FF] p-3.5 text-[13px] leading-relaxed text-(--text-secondary)">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#4257CB]" />
              <span>
                O arquivo é lido no seu navegador e <b>não sai da sua máquina</b>. Só os lançamentos que você aprovar
                são salvos.
              </span>
            </div>
          </aside>
        </div>

        {history.length > 0 ? (
          <section className="rounded-[20px] bg-(--bg-surface) p-4 shadow-(--shadow-card) md:p-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
              <h2 className="text-card-title">Importações recentes</h2>
              <span className="text-[13px] text-(--text-muted) max-md:hidden">
                Desfazer apaga os lançamentos que a importação criou, inclusive alterações feitas neles depois.
              </span>
            </div>
            <div className="mt-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex min-h-16 items-center gap-3 border-b border-(--border-soft) py-2 last:border-0 md:gap-3.5"
                >
                  <AccountAvatar institution={entry.accountInstitution} type={entry.accountType} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-(--text-primary)">{entry.fileName}</div>
                    <div className="truncate text-xs text-(--text-muted)">
                      {entry.accountName}
                      <span className="max-md:hidden">
                        {" "}· {entry.accountType === "credit_card" ? "fatura" : "extrato"} de {shortDate(entry.periodStart)} a{" "}
                        {shortDate(entry.periodEnd)}
                      </span>
                      <span className="md:hidden">
                        {" "}· {entry.transactionCount === 1 ? "1 lançamento" : `${entry.transactionCount} lançamentos`}
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-[#F4F5F8] px-2.5 text-xs font-semibold text-(--text-secondary) max-md:hidden">
                    {entry.transactionCount === 1 ? "1 lançamento" : `${entry.transactionCount} lançamentos`}
                  </span>

                  {confirmingUndo === entry.id ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirmingUndo(null)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          setConfirmingUndo(null);
                          run(() => undoImport(entry.id));
                        }}
                      >
                        Apagar {entry.transactionCount}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={isPending}
                      onClick={() => setConfirmingUndo(entry.id)}
                    >
                      <Undo2 className="mr-1.5 h-4 w-4" />
                      Desfazer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
            {isPending
              ? "Confirmando..."
              : `Confirmar ${included.length} lançamentos`}
          </Button>
        </div>
      </div>

      {/* A conferência contra o próprio extrato é o que separa importação
          automática confiável de aposta. Fica em cima, antes da grade. */}
      <Card>
        <CardContent className="flex items-start gap-3">
          {openImport.balanceMatches === null ? (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-(--primary)" />
          ) : openImport.balanceMatches ? (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--income)" }}
            />
          ) : (
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--expense)" }}
            />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-card-title">
              {openImport.balanceMatches === null
                ? "Esse extrato não traz saldo pra conferir"
                : openImport.balanceMatches
                  ? "O saldo bate com o extrato"
                  : "O saldo não bate com o extrato"}
            </span>
            <span className="text-sm text-(--text-muted)">
              {openImport.balanceMatches === null
                ? `${rows.length} lançamentos lidos. O documento não informa saldo inicial e final do período, então a conferência fica pra depois: compare o saldo da conta no Velun com o do app do banco.`
                : openImport.balanceMatches
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

      {merges > 0 ? (
        <p className="text-sm text-(--text-muted)">
          {merges === 1
            ? "1 lançamento do extrato vai substituir um lançamento seu, em vez de somar."
            : `${merges} lançamentos do extrato vão substituir lançamentos seus, em vez de somar.`}{" "}
          Confira linha por linha abaixo.
        </p>
      ) : null}

      {errorBlock}
      {notice ? (
        <p
          className="rounded-xl bg-(--primary-soft) px-3 py-2 text-sm text-(--primary-hover)"
          role="status"
        >
          {notice}
        </p>
      ) : null}

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
                  <td className="px-2 py-2 text-(--text-muted)">
                    {shortDate(row.date)}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <NameCell
                          // Nome novo vindo do servidor recria a célula
                          // com o rascunho certo.
                          key={row.description}
                          row={row}
                          disabled={isPending}
                          onRename={(name) =>
                            run(() => renameStagedRow(row.id, name))
                          }
                        />
                        {row.isDuplicate ? (
                          <Badge variant="secondary">Já existe</Badge>
                        ) : null}
                      </div>

                      {/* O cruzamento com a previsão é a pergunta mais
                          importante da revisão: errar aqui conta o mesmo
                          dinheiro duas vezes no mês. Fica embaixo da
                          descrição, não numa coluna, porque precisa de
                          frase. */}
                      {row.cardPayment ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <CreditCard
                            className="h-3.5 w-3.5 shrink-0"
                            style={{
                              color: row.cardPayment.accepted
                                ? "var(--primary)"
                                : "var(--text-muted)",
                            }}
                          />
                          <span className="text-(--text-muted)">
                            {row.cardPayment.accepted ? (
                              <>
                                Paga a fatura do{" "}
                                <span className="text-(--text-primary)">
                                  {row.cardPayment.cardName}
                                </span>{" "}
                                · entra como transferência, não como gasto
                              </>
                            ) : (
                              <>
                                Pode ser pagamento da fatura do{" "}
                                <span className="text-(--text-primary)">
                                  {row.cardPayment.cardName}
                                </span>
                              </>
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={isPending}
                            onClick={() =>
                              run(() =>
                                setStagedCardPayment(
                                  row.id,
                                  !row.cardPayment!.accepted,
                                ),
                              )
                            }
                          >
                            {row.cardPayment.accepted
                              ? "Não é pagamento"
                              : "É pagamento da fatura"}
                          </Button>
                        </div>
                      ) : null}
                      {row.match ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {row.match.accepted ? (
                            <>
                              <Link2
                                className="h-3.5 w-3.5 shrink-0"
                                style={{ color: "var(--income)" }}
                              />
                              <span className="text-(--text-muted)">
                                {row.match.kind === "forecast"
                                  ? "Quita"
                                  : "Substitui seu lançamento"}{" "}
                                <span className="text-(--text-primary)">
                                  {row.match.description}
                                </span>{" "}
                                de {shortDate(row.match.date)}
                              </span>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={isPending}
                                onClick={() =>
                                  run(() => setStagedMerge(row.id, false))
                                }
                              >
                                Separar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Link2Off className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
                              <span className="text-(--text-muted)">
                                {row.match.kind === "forecast" ? (
                                  <>Entra separado de {row.match.description}</>
                                ) : (
                                  <>
                                    Parece ser o mesmo que seu lançamento{" "}
                                    <span className="text-(--text-primary)">
                                      {row.match.description}
                                    </span>{" "}
                                    de {shortDate(row.match.date)}
                                  </>
                                )}
                              </span>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={isPending}
                                onClick={() =>
                                  run(() => setStagedMerge(row.id, true))
                                }
                              >
                                Juntar
                              </Button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.cardPayment?.accepted ? (
                      <span className="text-xs text-(--text-muted)">
                        Transferência
                      </span>
                    ) : (
                      <CategoryCell
                        row={row}
                        categories={categories}
                        disabled={isPending}
                        onChange={(categoryId) =>
                          run(
                            () => setStagedCategory(row.id, categoryId),
                            (result) => {
                              const n = result.ok ? (result.alsoUpdated ?? 0) : 0;
                              if (n === 0 || !categoryId) return;
                              const cat = categories.find((c) => c.id === categoryId)?.name;
                              setToast(
                                `Mais ${n} ${n === 1 ? "lançamento" : "lançamentos"} de ${row.description} ${n === 1 ? "foi" : "foram"} pra ${cat ?? "essa categoria"}. Estão marcados com a estrelinha pra você conferir.`,
                              );
                            },
                          )
                        }
                      />
                    )}
                  </td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{
                      color:
                        row.direction === "in"
                          ? "var(--income)"
                          : "var(--expense)",
                    }}
                  >
                    {row.direction === "in" ? "+" : "-"}
                    <Money cents={row.amountCents} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-sm text-(--text-muted)">
        Marcados somam <Money cents={includedTotal} currency={currency} /> no
        período.
      </p>

      {/* Lançamento confirmado à mão que divide valor com linhas do
          extrato mas não deu pra casar com uma só. Sem botão: qualquer
          junção seria palpite, e apagar lançamento confirmado é decisão
          de quem o lançou. */}
      {doubles.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title">
              Lançamentos seus que podem estar em dobro
            </h2>
            <p className="text-sm text-(--text-muted)">
              Você já tinha lançado estes, e o extrato tem lançamentos do mesmo
              valor. Pode ser o mesmo dinheiro com outro nome — ou não. Confira
              em Transações depois de confirmar.
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-0 p-0">
              {doubles.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-12 shrink-0 text-xs text-(--text-muted)">
                        {shortDate(d.date)}
                      </span>
                      <span className="truncate text-sm">{d.description}</span>
                    </div>
                    <span className="pl-15 text-xs text-(--text-muted)">
                      {d.statementDates.length === 1
                        ? `No extrato: ${shortDate(d.statementDates[0])}`
                        : `No extrato, ${d.statementDates.length} vezes: ${d.statementDates.map(shortDate).join(", ")}`}
                    </span>
                  </div>
                  <span
                    className="shrink-0 text-sm tabular-nums"
                    style={{
                      color:
                        d.direction === "in"
                          ? "var(--income)"
                          : "var(--expense)",
                    }}
                  >
                    {d.direction === "in" ? "+" : "-"}
                    <Money cents={d.amountCents} currency={currency} />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Previsão que o extrato não confirmou. O cruzamento automático só
          junta valor exato com data colada, de propósito — pagamento que
          saiu em duas transferências, ou com valor diferente do previsto,
          cai aqui pra quem revisa decidir. Deixar passar é o que faz o mês
          contar o mesmo dinheiro duas vezes. */}
      {forecasts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title">
              Previsões que o extrato não confirmou
            </h2>
            <p className="text-sm text-(--text-muted)">
              Estavam previstas nessa conta no período, e nenhum lançamento do
              extrato bate com elas. Se o pagamento saiu de outra forma — valor
              diferente, ou dividido em duas transferências — apague a previsão,
              senão o mês conta o mesmo dinheiro duas vezes.
            </p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-0 p-0">
              {forecasts.map((forecast) => (
                <div
                  key={forecast.id}
                  className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-12 shrink-0 text-xs text-(--text-muted)">
                      {shortDate(forecast.date)}
                    </span>
                    <span className="truncate text-sm">
                      {forecast.description}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className="text-sm tabular-nums"
                      style={{
                        color:
                          forecast.direction === "in"
                            ? "var(--income)"
                            : "var(--expense)",
                      }}
                    >
                      {forecast.direction === "in" ? "+" : "-"}
                      <Money cents={forecast.amountCents} currency={currency} />
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => dismissForecast(forecast.id))}
                    >
                      Apagar previsão
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-start gap-2.5 rounded-2xl bg-(--text-primary) px-4 py-3 text-sm text-white shadow-lg md:bottom-8"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#AEB9FF]" />
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
