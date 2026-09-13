function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-(--bg-subtle) ${className}`} />;
}

export default function FluxoDeCaixaLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Pulse className="h-8 w-56" />
        <Pulse className="h-4 w-[420px] max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[116px] items-center gap-4 rounded-2xl border p-5"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <Pulse className="h-12 w-12 shrink-0 rounded-[14px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Pulse className="h-3 w-24" />
              <Pulse className="h-6 w-32" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border-primary)" }}>
        <Pulse className="mb-4 h-5 w-64" />
        <Pulse className="h-[330px] w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[230px] rounded-2xl border p-5"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <Pulse className="mb-4 h-8 w-40" />
            <Pulse className="mb-2 h-4 w-full" />
            <Pulse className="mb-2 h-4 w-full" />
            <Pulse className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
