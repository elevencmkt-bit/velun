import Image from "next/image";

// Moldura das telas de entrada (login e convite): de um lado a marca —
// azul Velun, o V do símbolo, a frase da marca, um pedacinho do app e,
// ao fundo, um casal —; do outro, o formulário. No celular a
// marca vira uma faixa curta no topo.

function Motif({ className }: { className?: string }) {
  return (
    <img
      src="/velun-mark.png"
      alt=""
      aria-hidden
      className={`object-contain ${className ?? ""}`}
    />
  );
}

/** Um pedacinho do app, só de enfeite: o saldo e um cartão. */
function Preview() {
  return (
    <div aria-hidden className="relative mt-12 h-[230px] w-full max-w-[380px]">
      <div className="absolute top-0 left-0 w-[260px] rounded-[20px] bg-white p-5 shadow-[0_24px_60px_rgba(20,28,90,0.28)]">
        <div className="text-[12px] font-medium text-[#667085]">
          Sobrou em setembro
        </div>
        <div className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[#1A8A6D]">
          $419.93
        </div>
        <div className="mt-3 flex h-12 items-end gap-2">
          {[38, 22, 30, 44, 26, 48].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-md"
              style={{ height: h, background: i === 5 ? "#27C499" : "#E6FBF5" }}
            />
          ))}
        </div>
      </div>
      <div className="absolute top-[110px] left-[120px] h-[150px] w-[250px] rotate-[-4deg] overflow-hidden rounded-[18px] bg-[#151821] p-4 text-white shadow-[0_24px_60px_rgba(10,12,30,0.35)]">
        <img
          src="/velun-mark.png"
          alt=""
          aria-hidden
          className="object-contain absolute -top-8 -right-12 h-[200px] w-[220px] opacity-30"
        />
        <div className="relative text-[13px] font-semibold">
          Cartão do casal
        </div>
        <div className="relative mt-3 h-6 w-9 rounded-md bg-[#D4B46A]" />
        <div className="relative mt-5 text-[11px] opacity-70">
          Fatura aberta
        </div>
        <div className="relative text-[18px] font-bold">$1,284.30</div>
      </div>
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      <aside className="relative overflow-hidden bg-(--primary) text-white lg:flex lg:w-[46%] lg:max-w-[720px] lg:flex-col lg:justify-between lg:p-14">
        <Motif className="pointer-events-none absolute -top-24 -right-28 h-[420px] w-[420px] opacity-[0.14] lg:-top-32 lg:-right-40 lg:h-[680px] lg:w-[680px]" />

        {/* O casal: grande, atrás de tudo, misturado ao azul. */}
        <Image
          src="/velun-couple.webp"
          alt=""
          aria-hidden
          width={556}
          height={900}
          priority
          className="pointer-events-none absolute -right-10 bottom-0 hidden h-[88%] w-auto opacity-[0.32] mix-blend-luminosity lg:block"
        />

        <div className="relative flex items-center gap-3 px-6 pt-8 lg:p-0">
          <Image
            src="/velun-icon.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-[13px] shadow-[0_6px_16px_rgba(20,28,90,0.30)]"
          />
          <span className="text-[22px] font-extrabold tracking-[-0.03em]">
            velun
          </span>
        </div>

        <div className="relative px-6 pt-6 pb-10 lg:p-0">
          <h2 className="max-w-[460px] text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] lg:text-[46px]">
            Clareza para dois.
            <br />
            <span className="text-white/75">Privacidade para cada um.</span>
          </h2>
          <p className="mt-4 hidden max-w-[400px] text-[15px] leading-relaxed text-white/80 lg:block">
            As contas do casal à vista dos dois. As suas, você decide o que o
            outro vê.
          </p>
          <div className="hidden lg:block">
            <Preview />
          </div>
        </div>

        <p className="relative hidden text-[12px] text-white/60 lg:block">
          Seus extratos são lidos no seu navegador e nunca saem da sua máquina.
        </p>
      </aside>

      <main className="-mt-5 flex flex-1 items-start justify-center rounded-t-[24px] bg-white px-6 pt-10 pb-12 lg:mt-0 lg:items-center lg:rounded-none lg:px-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  children,
  htmlFor,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-semibold text-(--text-primary)"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export const authInputClass =
  "h-12 w-full rounded-[14px] border border-transparent bg-[#F4F5F8] px-4 text-[15px] text-(--text-primary) outline-none transition-colors placeholder:text-(--text-light) focus:border-(--primary) focus:bg-white focus:shadow-[0_0_0_4px_rgba(83,109,254,0.12)] read-only:text-(--text-muted)";
