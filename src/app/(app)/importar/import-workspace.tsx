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
  ListChecks,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Upload,
} from "lucide-react";
import {
  bulkSetStagedCategory,
  bulkSetStagedIncluded,
  confirmImport,
  discardImport,
  dismissForecast,
  getImportMapping,
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
import { decodeText, FileReadError, type FileStatement } from "@/lib/import/file-statement";
import { looksLikeOfx, parseOfx } from "@/lib/import/ofx";
import {
  applyMapping,
  columnLabels,
  guessMapping,
  mappingFits,
  readTable,
  tableSignature,
  type ColumnMapping,
  type Table,
} from "@/lib/import/table";
import { exportTip } from "@/lib/import/export-tips";
import { ColumnMapper, previewSummary } from "./column-mapper";
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
import { fitsDirection } from "@/lib/category-kind";
import { CategorySelectItems } from "@/components/category-select-items";
import { ScreenHelp } from "@/components/screen-help";

type Account = { id: string; name: string; isPersonal: boolean; type: string; institution: string | null };
type Category = { id: string; name: string; kind: string; is_transfer?: boolean; parent_id?: string | null };
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

type PickedKind = "pdf" | "image" | "ofx" | "table" | "xls" | null;

function kindOf(f: File): PickedKind {
  const n = f.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/.test(n)) return "image";
  if (/\.(ofx|qfx|qbo)$/.test(n)) return "ofx";
  if (/\.(csv|tsv|txt|xlsx)$/.test(n)) return "table";
  if (n.endsWith(".xls")) return "xls";
  return null;
}

/** Planilha lida, com as colunas escolhidas. */
type PickedTable = {
  table: Table;
  labels: string[];
  signature: string;
  mapping: ColumnMapping;
  /** Colunas vieram lembradas de uma importação anterior. */
  remembered: boolean;
  /** Painel de colunas aberto. */
  editing: boolean;
};


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
    fitsDirection(c, row.direction),
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
      <SelectTrigger className="h-8! rounded-[8px] pl-2.5 text-[13px]">
        <SelectValue placeholder="Sem categoria" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
        <CategorySelectItems categories={options} />
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
          className="h-8 rounded-[8px] px-2.5 text-[13px]"
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
  // Um PDF, ou vários prints da lista de lançamentos do app.
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const isImages = files.length > 0 && files.every((f) => kindOf(f) === "image");
  // OFX já lido, ou planilha lida (com as colunas), quando o arquivo é um deles.
  const [ofx, setOfx] = useState<FileStatement | null>(null);
  const [sheet, setSheet] = useState<PickedTable | null>(null);
  const [reading, setReading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const chosen = accounts.find((a) => a.id === accountId) ?? null;
  const isCardChosen = chosen?.type === "credit_card";

  function clearPicked() {
    setFiles([]);
    setOfx(null);
    setSheet(null);
  }

  /**
   * OFX e planilha são lidos assim que escolhidos, aqui no navegador:
   * assim a pessoa vê quantos lançamentos e de quando antes de mandar, e
   * a planilha mostra as colunas pra conferir.
   */
  async function readDataFile(f: File, kind: "ofx" | "table") {
    if (!accountId) return;
    setReading(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const isXlsx = f.name.toLowerCase().endsWith(".xlsx");
      const text = isXlsx ? "" : decodeText(bytes);
      if (kind === "ofx" || looksLikeOfx(text)) {
        setOfx(parseOfx(text));
        setFiles([f]);
        return;
      }
      const table = readTable(f.name, bytes, decodeText);
      const guess = guessMapping(table.rows, { currency, isCard: isCardChosen });
      const signature = tableSignature(table.rows, guess.headerRow);
      const saved = await getImportMapping(accountId, signature).catch(() => null);
      const useSaved = saved && mappingFits(table.rows, saved) && applyMapping(table, saved).transactions.length > 0;
      const mapping = useSaved ? saved : guess;
      setSheet({
        table,
        labels: columnLabels(table.rows, mapping.headerRow),
        signature,
        mapping,
        remembered: Boolean(useSaved),
        editing: !useSaved,
      });
      setFiles([f]);
    } catch (err) {
      clearPicked();
      setError(
        err instanceof FileReadError
          ? err.message
          : "Não consegui ler esse arquivo. Baixe de novo no banco e tente outra vez.",
      );
    } finally {
      setReading(false);
    }
  }

  function pickFiles(list: FileList | File[] | null | undefined) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setError(null);
    setNotice(null);
    setOfx(null);
    setSheet(null);
    const kinds = picked.map(kindOf);
    const pdfs = picked.filter((_, i) => kinds[i] === "pdf");
    const images = picked.filter((_, i) => kinds[i] === "image");
    if (picked.length === 1 && (kinds[0] === "ofx" || kinds[0] === "table")) {
      setFiles([]);
      void readDataFile(picked[0], kinds[0]);
      return;
    }
    if (kinds.includes("xls")) {
      setFiles([]);
      setError("Esse é o formato antigo do Excel (.xls). Abra no Excel ou no Google Planilhas e salve como .xlsx ou .csv.");
      return;
    }
    if (pdfs.length === 1 && picked.length === 1) {
      setFiles(pdfs);
      return;
    }
    if (images.length === picked.length) {
      if (isCardChosen) {
        setFiles([]);
        setError("Print funciona pra conta. Pra cartão, use o OFX/CSV do cartão ou o PDF da fatura do Nubank.");
        return;
      }
      if (images.length > 10) {
        setFiles([]);
        setError("Até 10 prints por vez.");
        return;
      }
      setFiles(images);
      return;
    }
    setFiles([]);
    setError(
      picked.length > 1
        ? "Mande um arquivo por vez (ou até 10 prints)."
        : "Esse tipo de arquivo o Velun não lê. Mande OFX/QFX, CSV, Excel (.xlsx), o extrato em PDF ou prints do app.",
    );
  }

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!accountId) return setError("Escolha de qual conta é o extrato.");
    if (!file || file.size === 0) return setError("Escolha o arquivo ou os prints.");

    if (ofx || sheet) {
      let statement: FileStatement;
      if (sheet) {
        statement = applyMapping(sheet.table, sheet.mapping);
        if (statement.transactions.length === 0) {
          setSheet({ ...sheet, editing: true });
          return setError("Nenhuma linha virou lançamento com essas colunas. Confira a data, o formato e o valor.");
        }
      } else statement = ofx as FileStatement;
      startTransition(async () => {
        try {
          const result = await importStatement({
            accountId,
            fileName: file.name,
            file: statement,
            mapping: sheet ? { signature: sheet.signature, columns: sheet.mapping } : undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNotice(result.message);
          clearPicked();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Algo deu errado ao ler o arquivo.");
        }
      });
      return;
    }

    if (isImages) {
      startTransition(async () => {
        // Os prints são lidos aqui, no navegador. Pro servidor vão só as
        // palavras reconhecidas e onde estão — a imagem não sai da máquina.
        const { recognizeScreen } = await import("@/lib/ocr-client");
        const screens = [];
        try {
          for (let i = 0; i < files.length; i++) {
            const label = files.length > 1 ? `Lendo print ${i + 1} de ${files.length}` : "Lendo o print";
            setOcrStatus(`${label}…`);
            screens.push(await recognizeScreen(files[i], (pct) => setOcrStatus(`${label}… ${pct}%`)));
          }
        } catch {
          setOcrStatus(null);
          setError("Não consegui ler esses prints. Tente de novo.");
          return;
        }
        setOcrStatus("Montando a revisão…");
        try {
          const result = await importStatement({
            accountId,
            fileName: files.length === 1 ? "1 print" : `${files.length} prints`,
            screens,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNotice(result.message);
          setFiles([]);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Algo deu errado ao ler os prints.");
        } finally {
          setOcrStatus(null);
        }
      });
      return;
    }

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
        setFiles([]);
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

  // Seleção pra editar várias linhas de uma vez. Fica num modo à parte
  // porque a caixinha da linha, fora dele, é "entra ou não".
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastPicked, setLastPicked] = useState<number | null>(null);
  const [bulkKey, setBulkKey] = useState(0);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedIds = selectedRows.map((r) => r.id);

  function pickRow(index: number, shift: boolean) {
    const id = rows[index].id;
    const next = new Set(selected);
    const turnOn = !next.has(id);
    if (shift && lastPicked !== null) {
      // Shift: marca (ou desmarca) o trecho entre a última e esta.
      const [a, b] = lastPicked < index ? [lastPicked, index] : [index, lastPicked];
      for (let i = a; i <= b; i++) {
        if (turnOn) next.add(rows[i].id);
        else next.delete(rows[i].id);
      }
    } else if (turnOn) next.add(id);
    else next.delete(id);
    setSelected(next);
    setLastPicked(index);
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setLastPicked(null);
  }

  const bulkCategories = categories.filter((c) =>
    [...new Set(selectedRows.map((r) => r.direction))].some((d) => fitsDirection(c, d)),
  );

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
            // Outra conta muda o palpite das colunas (cartão × conta) e o
            // que foi lembrado: escolhe o arquivo de novo.
            if (a.id !== accountId) clearPicked();
            setAccountId(a.id);
            setError(null);
          }}
          aria-pressed={on}
          className={`flex h-16 w-full items-center gap-3 rounded-[16px] border-[1.5px] bg-(--bg-surface) px-3.5 text-left transition-colors ${
            on
              ? "border-(--primary) bg-(--primary-soft) shadow-[0_0_0_3px_rgba(83,109,254,.12)]"
              : "border-(--border-primary) hover:border-(--primary-border)"
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
          <div className="flex items-center gap-2.5">
          <h1 className="text-page-title">Importar</h1>
          <ScreenHelp screen="importar" />
        </div>
          <p className="text-page-subtitle">
            Traga o extrato do banco, prints do app ou a fatura do cartão. Nada entra sem você revisar.
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
                2 · {isCardChosen ? "Mande a fatura ou o arquivo do cartão" : "Mande o arquivo do banco"}
                {chosen ? <span className="normal-case tracking-normal text-(--primary)"> da {chosen.name}</span> : null}
              </div>
              {/* Só abre depois de escolher a conta: com mais de uma conta,
                  é fácil mandar o extrato de uma pra outra. */}
              <label
                aria-disabled={!chosen}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (chosen) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!chosen) return setError("Escolha primeiro de qual conta é o extrato.");
                  pickFiles(e.dataTransfer.files);
                }}
                className={`flex items-center gap-3 rounded-[18px] border-2 border-dashed px-4 transition-colors max-md:h-[76px] md:h-[200px] md:flex-col md:justify-center md:gap-2.5 md:px-6 md:text-center ${
                  !chosen
                    ? "cursor-not-allowed border-(--border-primary) bg-(--bg-subtle)"
                    : dragging
                      ? "cursor-pointer border-(--primary) bg-(--primary-light)"
                      : "cursor-pointer border-(--primary-border) bg-(--primary-soft) hover:bg-(--primary-soft)"
                }`}
              >
                <input
                  type="file"
                  accept={
                    isCardChosen
                      ? ".pdf,.ofx,.qfx,.qbo,.csv,.tsv,.txt,.xlsx,.xls,application/pdf,text/csv"
                      : ".pdf,.ofx,.qfx,.qbo,.csv,.tsv,.txt,.xlsx,.xls,application/pdf,text/csv,image/*"
                  }
                  multiple={!isCardChosen}
                  className="sr-only"
                  disabled={!chosen}
                  onChange={(e) => {
                    pickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {!chosen ? (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--bg-hover) text-(--text-light) md:h-[52px] md:w-[52px] md:rounded-[16px]">
                      <Lock className="h-5 w-5 md:h-6 md:w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-(--text-muted)">Escolha a conta acima primeiro</span>
                      <span className="block text-[13px] text-(--text-light)">Assim o extrato não cai na conta errada.</span>
                    </span>
                  </>
                ) : (
                <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--primary-light) text-(--primary) md:h-[52px] md:w-[52px] md:rounded-[16px]">
                  {file ? <FileText className="h-5 w-5 md:h-6 md:w-6" /> : <Upload className="h-5 w-5 md:h-6 md:w-6" />}
                </span>
                {file ? (
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-(--text-primary)">
                      {isImages ? (files.length === 1 ? "1 print" : `${files.length} prints`) : file.name}
                    </span>
                    <span className="block text-[13px] text-(--text-muted)">
                      {ofx
                        ? `${previewSummary(ofx)} · `
                        : sheet
                          ? `${previewSummary(applyMapping(sheet.table, sheet.mapping))} · `
                          : "Pronto pra ler · "}
                      <span className="font-semibold text-(--primary)">trocar arquivo</span>
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-(--text-primary)">
                      <span className="max-md:hidden">
                        Arraste {isCardChosen ? "a fatura" : "o extrato"} da {chosen.name} aqui
                      </span>
                      <span className="md:hidden">Escolher {isCardChosen ? "a fatura" : "o extrato"}</span>
                    </span>
                    <span className="block text-[13px] text-(--text-muted)">
                      <span className="max-md:hidden">
                        ou <span className="font-semibold text-(--primary)">clique pra escolher</span> · OFX, CSV, Excel ou PDF
                        {isCardChosen ? "" : ", ou prints do app"}
                      </span>
                      <span className="md:hidden">da {chosen.name}: OFX, CSV, Excel ou PDF</span>
                    </span>
                  </span>
                )}
                </>
                )}
              </label>
              {sheet && !sheet.editing ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] bg-(--bg-subtle) px-3.5 py-2.5 text-[13px]">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-(--primary)" />
                  <span className="min-w-0 flex-1 text-(--text-secondary)">
                    Colunas lembradas desta conta:{" "}
                    <b className="font-semibold">
                      {[
                        sheet.labels[sheet.mapping.date],
                        sheet.labels[sheet.mapping.description],
                        ...(sheet.mapping.amount !== null
                          ? [sheet.labels[sheet.mapping.amount]]
                          : [sheet.labels[sheet.mapping.debit ?? 0], sheet.labels[sheet.mapping.credit ?? 0]]),
                      ].join(" · ")}
                    </b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSheet({ ...sheet, editing: true })}
                    className="font-semibold text-(--primary) hover:text-(--primary-hover)"
                  >
                    Conferir colunas
                  </button>
                </div>
              ) : null}
              {sheet && sheet.editing ? (
                <div className="mt-3">
                  <ColumnMapper
                    table={sheet.table}
                    labels={sheet.labels}
                    mapping={sheet.mapping}
                    remembered={sheet.remembered}
                    currency={currency}
                    onChange={(mapping) =>
                      setSheet({
                        ...sheet,
                        mapping,
                        labels: mapping.headerRow === sheet.mapping.headerRow ? sheet.labels : columnLabels(sheet.table.rows, mapping.headerRow),
                      })
                    }
                  />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 max-md:hidden">
                <span className="text-xs text-(--text-light)">O Velun lê:</span>
                {["OFX / QFX de qualquer banco", "CSV e Excel", "Extrato Regions (PDF)", "Extrato Nomad (PDF)", "Fatura Nubank (PDF)", "Prints do app"].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="inline-flex h-7 items-center rounded-full bg-(--bg-track) px-2.5 text-xs font-semibold text-(--text-secondary)"
                    >
                      {chip}
                    </span>
                  ),
                )}
              </div>
              {chosen && !file ? (
                <p className="mt-3 text-xs leading-relaxed text-(--text-muted) lg:hidden">
                  <b className="font-semibold text-(--text-secondary)">Onde baixar:</b>{" "}
                  {exportTip(chosen.institution, isCardChosen).text}
                </p>
              ) : null}
            </div>

            {errorBlock}
            {notice ? (
              <p className="rounded-xl bg-(--primary-soft) px-3 py-2 text-sm text-(--primary-hover)" role="status">
                {notice}
              </p>
            ) : null}

            <Button type="submit" disabled={isPending || reading || !chosen || !file} className="h-12 rounded-[14px] text-[15px]">
              {ocrStatus ??
                (reading
                  ? "Abrindo o arquivo…"
                  : isPending
                    ? isImages
                      ? "Lendo os prints…"
                      : ofx || sheet
                        ? "Montando a revisão…"
                        : "Lendo o PDF…"
                    : "Ler e revisar")}
            </Button>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-(--text-muted) lg:hidden">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--primary)" />
              O arquivo ou print é lido aqui no aparelho e não sai dele. Só os lançamentos que você aprovar são salvos.
            </p>
          </form>

          <aside className="flex flex-col gap-4 rounded-[20px] bg-(--bg-surface) p-6 shadow-(--shadow-card) max-lg:hidden">
            <h2 className="text-card-title">Como funciona</h2>
            {[
              ["Escolha a conta", "Conta corrente recebe extrato; cartão recebe fatura."],
              [
                "Mande o arquivo",
                "OFX/QFX, CSV ou Excel baixado do site do banco (o OFX é o mais certeiro). Também vale o PDF da Regions, Nomad e da fatura Nubank, ou prints do app (até 10).",
              ],
              [
                "Revise antes de entrar",
                "O Velun sugere categoria, junta o que já foi lançado e marca pagamento de fatura. Você confirma.",
              ],
            ].map(([title, text], i) => (
              <div key={title} className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--primary-light) text-[13px] font-extrabold text-(--primary-hover)">
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-semibold text-(--text-primary)">{title}</div>
                  <div className="text-[13px] leading-relaxed text-(--text-muted)">{text}</div>
                </div>
              </div>
            ))}
            {(() => {
              const tip = exportTip(chosen?.institution ?? null, isCardChosen);
              return (
                <div className="rounded-[14px] border border-(--border-primary) p-3.5">
                  <div className="text-[13px] font-bold text-(--text-primary)">
                    Onde baixar{tip.bank ? ` · ${tip.bank}` : chosen ? ` · ${chosen.name}` : ""}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-(--text-muted)">{tip.text}</div>
                </div>
              );
            })()}
            <div className="flex items-start gap-2.5 rounded-[14px] bg-(--primary-soft) p-3.5 text-[13px] leading-relaxed text-(--text-secondary)">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-(--primary-hover)" />
              <span>
                O arquivo ou print é lido no seu navegador e <b>não sai da sua máquina</b>. Só os lançamentos que você aprovar
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
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-(--bg-track) px-2.5 text-xs font-semibold text-(--text-secondary) max-md:hidden">
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
                  ? `${rows.length} lançamentos lidos, e o saldo reconstruído fecha com o do banco.`
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

      {selecting ? (
        <div
          className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-[16px] border border-(--primary-border) bg-(--bg-surface) p-2.5 pl-4 shadow-(--shadow-card)"
          role="toolbar"
          aria-label="Editar selecionados"
        >
          <span className="mr-1 text-sm font-semibold text-(--text-primary)">
            {selected.size === 0
              ? "Nenhuma selecionada"
              : selected.size === 1
                ? "1 selecionada"
                : `${selected.size} selecionadas`}
          </span>
          <div className="flex items-center gap-1 text-[13px]">
            <button
              type="button"
              className="rounded-lg px-2 py-1 font-semibold text-(--primary) hover:bg-(--primary-soft)"
              onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
            >
              Todas
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 font-semibold text-(--primary) hover:bg-(--primary-soft)"
              onClick={() =>
                setSelected(
                  new Set(
                    rows
                      .filter(
                        (r) =>
                          r.isIncluded &&
                          !r.cardPayment?.accepted &&
                          !categories.some((c) => c.id === r.categoryId && fitsDirection(c, r.direction)),
                      )
                      .map((r) => r.id),
                  ),
                )
              }
            >
              Sem categoria
            </button>
            {selected.size > 0 ? (
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-semibold text-(--text-muted) hover:bg-(--bg-hover)"
                onClick={() => setSelected(new Set())}
              >
                Limpar
              </button>
            ) : null}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              key={bulkKey}
              disabled={isPending || selected.size === 0}
              onValueChange={(value) => {
                const categoryId = value === NO_CATEGORY ? null : value;
                const name = categoryId ? categories.find((c) => c.id === categoryId)?.name : null;
                setBulkKey((k) => k + 1);
                run(
                  () => bulkSetStagedCategory(openImport.id, selectedIds, categoryId),
                  (result) => {
                    if (!result.ok) return;
                    const n = result.changed ?? 0;
                    const k = result.skipped ?? 0;
                    const what = name ? `${name} em` : "Categoria tirada de";
                    let text = `${what} ${n} ${n === 1 ? "lançamento" : "lançamentos"}.`;
                    if (k > 0) {
                      text += ` ${k} ${k === 1 ? "ficou como estava" : "ficaram como estavam"}: ${
                        name ? "a categoria não serve pro sentido (entrada × saída) ou é" : "é"
                      } pagamento de fatura.`;
                    }
                    setToast(text);
                  },
                );
              }}
            >
              <SelectTrigger className="h-9! w-[190px] rounded-[10px] text-[13px]" aria-label="Pôr categoria nos selecionados">
                <SelectValue placeholder="Pôr categoria…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                <CategorySelectItems categories={bulkCategories} />
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isPending || selected.size === 0}
              onClick={() => run(() => bulkSetStagedIncluded(openImport.id, selectedIds, true))}
            >
              Incluir
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isPending || selected.size === 0}
              onClick={() => run(() => bulkSetStagedIncluded(openImport.id, selectedIds, false))}
            >
              Não importar
            </Button>
            <Button size="sm" className="h-9" onClick={stopSelecting}>
              Pronto
            </Button>
          </div>
        </div>
      ) : (
        <div className="-mb-3 flex items-center justify-between gap-3">
          <span className="text-sm text-(--text-muted)">
            {rows.length} {rows.length === 1 ? "linha" : "linhas"} · {included.length} {included.length === 1 ? "entra" : "entram"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSelecting(true)}>
            <ListChecks className="mr-1.5 h-4 w-4" />
            Selecionar várias
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-(--text-muted)">
                <th className="w-12 px-4 py-3">
                  {selecting ? (
                    <Checkbox
                      checked={
                        selected.size === 0 ? false : selected.size === rows.length ? true : "indeterminate"
                      }
                      onCheckedChange={(checked) =>
                        setSelected(checked === true ? new Set(rows.map((r) => r.id)) : new Set())
                      }
                      aria-label="Selecionar todas"
                    />
                  ) : null}
                </th>
                <th className="w-20 px-2 py-3">Data</th>
                <th className="px-2 py-3">Descrição</th>
                <th className="w-52 px-2 py-3">Categoria</th>
                <th className="w-32 px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b last:border-0 ${
                    selecting && selected.has(row.id) ? "bg-(--primary-soft)" : ""
                  }`}
                  style={{ opacity: row.isIncluded || selecting ? 1 : 0.45 }}
                >
                  <td className="px-4 py-2">
                    {selecting ? (
                      <Checkbox
                        checked={selected.has(row.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          pickRow(index, e.shiftKey);
                        }}
                        aria-label={`Selecionar ${row.description}`}
                      />
                    ) : (
                      <Checkbox
                        checked={row.isIncluded}
                        disabled={isPending}
                        onCheckedChange={(checked) =>
                          run(() => toggleStagedRow(row.id, checked === true))
                        }
                        aria-label={`Incluir ${row.description}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-(--text-muted)">
                    {shortDate(row.date)}
                    {selecting && !row.isIncluded ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-(--text-light)">não entra</span>
                    ) : null}
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
          className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-start gap-2.5 rounded-2xl bg-(--bg-inverse) px-4 py-3 text-sm text-white shadow-lg md:bottom-8"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#AEB9FF]" />
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
