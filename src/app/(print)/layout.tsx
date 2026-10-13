// Páginas feitas pra imprimir / salvar em PDF: sem menu lateral nem
// barra do topo. O login continua valendo (getCurrentMember na página
// manda pra /login quem não entrou).
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#EEF0F4] print:bg-white">{children}</div>;
}
