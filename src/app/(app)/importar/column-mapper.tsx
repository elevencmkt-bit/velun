"use client";

import { useMemo } from "react";
import type { CurrencyCode } from "@/lib/money";
import { Money } from "@/components/money";
import { applyMapping, type ColumnMapping, type Table } from "@/lib/import/table";

// Conferir as colunas de um CSV/planilha antes de ler. Aparece na primeira
// vez que a conta recebe esse formato (depois fica lembrado) ou quando a
// pessoa pede pra conferir.

const select =
  "h-10 w-full rounded-[12px] border border-(--border-primary) bg-(--bg-surface) px-3 text-[14px] font-medium text-(--text-primary) focus:border-(--primary) focus:outline-none";
const label = "mb-1.5 block text-xs font-semibold text-(--text-muted)";

function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 rounded-[12px] bg-(--bg-track) p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex h-8 flex-1 items-center justify-center rounded-[9px] px-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
            value === o.value
              ? "bg-(--bg-surface) text-(--text-primary) shadow-[0_1px_3px_rgba(16,24,40,.1)]"
              : "text-(--text-muted) hover:text-(--text-secondary)"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function br(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function useTablePreview(table: Table, mapping: ColumnMapping) {
  return useMemo(() => {
    const st = applyMapping(table, mapping);
    const ins = st.transactions.filter((t) => t.direction === "in").reduce((n, t) => n + t.amountCents, 0);
    const outs = st.transactions.filter((t) => t.direction === "out").reduce((n, t) => n + t.amountCents, 0);
    return { statement: st, ins, outs };
  }, [table, mapping]);
}

/** "48 lançamentos, de 01/08/2026 a 31/08/2026" */
export function previewSummary(st: ReturnType<typeof applyMapping>) {
  const n = st.transactions.length;
  if (n === 0) return "Nenhuma linha virou lançamento";
  return `${n} ${n === 1 ? "lançamento" : "lançamentos"}, de ${br(st.periodStart)} a ${br(st.periodEnd)}`;
}

export function ColumnMapper({
  table,
  labels,
  mapping,
  onChange,
  remembered,
  currency,
}: {
  table: Table;
  labels: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  /** As colunas vieram lembradas (a pessoa abriu pra conferir). */
  remembered: boolean;
  currency: CurrencyCode;
}) {
  const { statement, ins, outs } = useTablePreview(table, mapping);
  const split = mapping.amount === null;
  const set = (patch: Partial<ColumnMapping>) => onChange({ ...mapping, ...patch });

  const columnSelect = (value: number | null, onPick: (i: number) => void, aria: string) => (
    <select className={select} value={value ?? ""} onChange={(e) => onPick(Number(e.target.value))} aria-label={aria}>
      {labels.map((l, i) => (
        <option key={i} value={i}>
          {l}
        </option>
      ))}
    </select>
  );

  // Coluna livre pra usar ao trocar de "uma coluna" pra "débito e crédito".
  const other = (avoid: (number | null)[]) => {
    for (let i = 0; i < labels.length; i++) if (!avoid.includes(i)) return i;
    return 0;
  };

  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-(--border-primary) bg-(--bg-subtle) p-4 md:p-5">
      <div>
        <div className="text-[15px] font-bold text-(--text-primary)">Confira as colunas</div>
        <div className="mt-0.5 text-[13px] text-(--text-muted)">
          {remembered
            ? "Estas são as colunas lembradas desta conta. Mudou algo, ajuste aqui."
            : "Primeira vez com esse arquivo nesta conta. O Velun adivinhou pelo cabeçalho; confira e ele lembra pra próxima."}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <span className={label}>Data</span>
          {columnSelect(mapping.date, (i) => set({ date: i }), "Coluna da data")}
        </div>
        <div>
          <span className={label}>Descrição</span>
          {columnSelect(mapping.description, (i) => set({ description: i }), "Coluna da descrição")}
        </div>

        <div className="sm:col-span-2">
          <span className={label}>Valor</span>
          <Segmented
            ariaLabel="Como vem o valor"
            value={split ? "split" : "single"}
            options={[
              { value: "single", label: "Numa coluna só" },
              { value: "split", label: "Débito e crédito" },
            ]}
            onChange={(v) => {
              if (v === "single") set({ amount: mapping.debit ?? other([mapping.date, mapping.description]), debit: null, credit: null });
              else {
                const debit = mapping.amount ?? other([mapping.date, mapping.description]);
                set({ amount: null, debit, credit: other([mapping.date, mapping.description, debit]) });
              }
            }}
          />
        </div>

        {split ? (
          <>
            <div>
              <span className={label}>Débito (sai)</span>
              {columnSelect(mapping.debit, (i) => set({ debit: i }), "Coluna do débito")}
            </div>
            <div>
              <span className={label}>Crédito (entra)</span>
              {columnSelect(mapping.credit, (i) => set({ credit: i }), "Coluna do crédito")}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className={label}>Coluna do valor</span>
              {columnSelect(mapping.amount, (i) => set({ amount: i }), "Coluna do valor")}
            </div>
            <div>
              <span className={label}>Saída (gasto) vem como</span>
              <Segmented
                ariaLabel="Saída vem como"
                value={mapping.outIsNegative}
                options={[
                  { value: true, label: "Negativo (−)" },
                  { value: false, label: "Positivo" },
                ]}
                onChange={(v) => set({ outIsNegative: v })}
              />
            </div>
          </>
        )}

        <div>
          <span className={label}>Formato da data</span>
          <select
            className={select}
            value={mapping.dateFormat}
            onChange={(e) => set({ dateFormat: e.target.value as ColumnMapping["dateFormat"] })}
            aria-label="Formato da data"
          >
            <option value="dmy">dia/mês/ano (31/08/2026)</option>
            <option value="mdy">mês/dia/ano (08/31/2026)</option>
            <option value="ymd">ano-mês-dia (2026-08-31)</option>
          </select>
        </div>
        <div>
          <span className={label}>Centavos</span>
          <select
            className={select}
            value={mapping.decimal}
            onChange={(e) => set({ decimal: e.target.value as ColumnMapping["decimal"] })}
            aria-label="Separador dos centavos"
          >
            <option value=",">vírgula (1.234,56)</option>
            <option value=".">ponto (1,234.56)</option>
          </select>
        </div>
      </div>

      <div className="rounded-[14px] bg-(--bg-surface) p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-(--text-primary)">{previewSummary(statement)}</span>
          {statement.transactions.length > 0 ? (
            <span className="text-xs font-semibold tabular-nums">
              <span style={{ color: "var(--income-dark)" }}>
                +<Money cents={ins} currency={currency} />
              </span>
              <span className="text-(--text-light)"> · </span>
              <span style={{ color: "var(--expense-dark)" }}>
                −<Money cents={outs} currency={currency} />
              </span>
            </span>
          ) : null}
        </div>
        {statement.skipped > 0 ? (
          <div className="mt-0.5 text-xs text-(--text-muted)">
            {statement.skipped === 1
              ? "1 linha sem data ou valor fica de fora (saldo, total ou linha em branco)."
              : `${statement.skipped} linhas sem data ou valor ficam de fora (saldos, totais ou linhas em branco).`}
          </div>
        ) : null}
        {statement.transactions.length === 0 ? (
          <div className="mt-1 text-xs text-(--expense-dark)">Confira a coluna da data, o formato e a coluna do valor.</div>
        ) : (
          <div className="mt-2.5 flex flex-col">
            {statement.transactions.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-(--border-soft) py-2 text-[13px]">
                <span className="w-[74px] shrink-0 text-(--text-muted) tabular-nums">{br(t.date)}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-(--text-primary)">{t.description}</span>
                <span
                  className="shrink-0 font-bold tabular-nums"
                  style={{ color: t.direction === "out" ? "var(--expense-dark)" : "var(--income-dark)" }}
                >
                  {t.direction === "out" ? "−" : "+"}
                  <Money cents={t.amountCents} currency={currency} />
                </span>
              </div>
            ))}
            {statement.transactions.length > 5 ? (
              <div className="border-t border-(--border-soft) pt-2 text-xs text-(--text-muted)">
                e mais {statement.transactions.length - 5}. Você revisa tudo no próximo passo.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
