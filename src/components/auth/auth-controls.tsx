"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { authInputClass } from "./auth-shell";

/** Campo de senha com o olho pra mostrar o que foi digitado. */
export function PasswordInput({
  id,
  name,
  autoComplete,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={autoComplete === "new-password" ? 6 : undefined}
        autoComplete={autoComplete}
        className={`${authInputClass} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Esconder senha" : "Mostrar senha"}
        className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-(--text-muted) hover:text-(--text-primary)"
      >
        {visible ? (
          <EyeOff className="h-[18px] w-[18px]" />
        ) : (
          <Eye className="h-[18px] w-[18px]" />
        )}
      </button>
    </div>
  );
}

/** Botão de enviar que mostra que está trabalhando. */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] bg-(--primary) text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(83,109,254,0.30)] transition-colors hover:bg-(--primary-hover) disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
