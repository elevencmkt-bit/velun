// Páginas feitas pra imprimir / salvar em PDF: sem menu lateral nem
// barra do topo. O login continua valendo (getCurrentMember na página
// manda pra /login quem não entrou).
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  // Sempre claro, mesmo com o tema escuro ligado: é papel.
  return <div data-force-light className="min-h-dvh bg-[#EEF0F4] print:bg-white">{children}</div>;
}
