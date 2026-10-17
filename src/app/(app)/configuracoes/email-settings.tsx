"use client";

import { useState, useTransition } from "react";
import { BarChart3, Bell, CalendarDays, Lock } from "lucide-react";
import { sendTestEmail, setEmailPreference, type EmailSettings } from "@/lib/actions/email-preferences";
import type { EmailKind } from "@/lib/email/context";

const ROWS: {
  kind: EmailKind;
  title: string;
  text: string;
  icon: typeof Bell;
  bg: string;
  fg: string;
}[] = [
  {
    kind: "weekly",
    title: "Resumo da semana",
    text: "Toda segunda, às 8h: o que vence e o que entra nos próximos 7 dias, conta por conta, as atrasadas e o saldo previsto pro domingo.",
    icon: CalendarDays,
    bg: "var(--primary-light)",
    fg: "var(--primary)",
  },
  {
    kind: "monthly",
    title: "Fechamento do mês",
    text: "Dia 1, às 8h: quanto entrou e saiu em cada conta, onde foi o dinheiro, como foram as metas e o que já está previsto pro mês novo.",
    icon: BarChart3,
    bg: "var(--income-soft)",
    fg: "var(--income-dark)",
  },
  {
    kind: "alerts",
    title: "Avisos de vencimento",
    text: "Às 8h, só nos dias em que alguma conta vence no dia seguinte ou ficou atrasada. No máximo um por dia, separado por conta.",
    icon: Bell,
    bg: "var(--warning-soft)",
    fg: "var(--warning-dark)",
  },
];

export function EmailSettingsPanel({ initial, timezoneLabel }: { initial: EmailSettings; timezoneLabel: string }) {
  const [state, setState] = useState({ weekly: initial.weekly, monthly: initial.monthly, alerts: initial.alerts });
  const [message, setMessage] = useState<{ kind: EmailKind; ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(kind: EmailKind) {
    const next = !state[kind];
    setState((s) => ({ ...s, [kind]: next }));
    setBusy(`switch:${kind}`);
    startTransition(async () => {
      const res = await setEmailPreference(kind, next);
      if (!res.ok) {
        setState((s) => ({ ...s, [kind]: !next }));
        setMessage({ kind, ok: false, text: res.error ?? "Não deu pra salvar." });
      }
      setBusy(null);
    });
  }

  function test(kind: EmailKind) {
    setBusy(`test:${kind}`);
    setMessage(null);
    startTransition(async () => {
      const res = await sendTestEmail(kind);
      setMessage({ kind, ok: res.ok, text: res.message });
      setBusy(null);
    });
  }

  return (
    <div className="flex flex-col">
      <div>
        <h2 className="text-card-title">E-mails</h2>
        <p className="mt-1 text-sm text-(--text-muted)">
          {initial.email ? (
            <>
              Chegam em <b className="font-semibold text-(--text-secondary)">{initial.email}</b>, no fuso da casa (
              {timezoneLabel}). Cada pessoa da casa escolhe os seus.
            </>
          ) : (
            <>Cada pessoa da casa escolhe os seus.</>
          )}
        </p>
        {!initial.ready ? (
          <p className="mt-3 rounded-[12px] bg-(--warning-soft) px-3.5 py-2.5 text-[13px] text-(--warning-dark)">
            O envio ainda não foi ligado no servidor. Suas escolhas ficam salvas e valem assim que ligar.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col">
        {ROWS.map((row) => {
          const on = state[row.kind];
          const testButton = (className: string) => (
            <button
              type="button"
              onClick={() => test(row.kind)}
              disabled={busy !== null || !initial.ready}
              className={`h-9 rounded-[10px] bg-(--primary-light) px-3 text-[13px] font-semibold whitespace-nowrap text-(--primary) transition-opacity hover:opacity-85 disabled:opacity-50 ${className}`}
            >
              {busy === `test:${row.kind}` ? "Mandando…" : "Mandar um de teste"}
            </button>
          );
          return (
            <div key={row.kind} className="border-t border-(--border-primary) py-4">
              <div className="flex items-start gap-3.5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{ background: row.bg, color: row.fg }}
                >
                  <row.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-(--text-primary)">{row.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-(--text-muted)">{row.text}</div>
                  {testButton("mt-2.5 sm:hidden")}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {testButton("max-sm:hidden")}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={row.title}
                    onClick={() => toggle(row.kind)}
                    disabled={busy === `switch:${row.kind}`}
                    className={`flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors ${
                      on ? "justify-end bg-(--primary)" : "justify-start bg-(--border-strong)"
                    }`}
                  >
                    <span className="h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,.25)]" />
                  </button>
                </div>
              </div>
              {message?.kind === row.kind ? (
                <p
                  role="status"
                  className={`mt-3 ml-[54px] rounded-[10px] px-3 py-2 text-[13px] ${
                    message.ok
                      ? "bg-(--income-soft) text-(--income-dark)"
                      : "bg-(--expense-soft) text-(--expense-dark)"
                  }`}
                >
                  {message.text}
                </p>
              ) : null}
            </div>
          );
        })}

        <div className="flex items-center gap-3.5 border-t border-(--border-primary) pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-(--bg-subtle) text-(--text-secondary)">
            <Lock className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-(--text-primary)">Acesso e convites</div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-(--text-muted)">
              Trocar a senha e convite pra casa. Esses sempre chegam.
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-(--text-muted)">Sempre ligado</span>
        </div>
      </div>
    </div>
  );
}
