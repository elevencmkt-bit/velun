// Esqueleto que aparece no instante do clique, enquanto o servidor monta
// a página.
//
// Sem ele, a navegação fica congelada até a resposta chegar: clicar no
// menu não mudava nada na tela por meio segundo a um segundo (e alguns
// segundos quando o servidor estava "dormindo"), e parecia que o clique
// não tinha pegado. Com ele, a resposta visual é imediata — e como é
// uma parte fixa, o Next a busca de antemão junto com os links do menu.
//
// Vale pra todas as páginas do app que não têm um esqueleto próprio
// (Fluxo de caixa tem o seu, mais fiel ao conteúdo). Forma neutra de
// propósito: título, uma faixa de indicadores e um bloco — o desenho
// fino fica pra fase de design.

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-(--bg-subtle) ${className}`} />;
}

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-2">
        <Pulse className="h-8 w-56" />
        <Pulse className="h-4 w-[420px] max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[104px] items-center gap-4 rounded-[20px] p-5"
            style={{ background: "#FFFFFF", boxShadow: "var(--shadow-card)" }}
          >
            <Pulse className="h-11 w-11 shrink-0 rounded-[14px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Pulse className="h-3 w-24" />
              <Pulse className="h-6 w-32" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] p-6" style={{ background: "#FFFFFF", boxShadow: "var(--shadow-card)" }}>
        <Pulse className="mb-5 h-5 w-48" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Pulse className="h-4 w-14" />
              <Pulse className="h-4 flex-1" />
              <Pulse className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
