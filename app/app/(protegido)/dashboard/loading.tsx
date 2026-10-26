export default function CarregandoDashboard() {
  const bloco = 'animate-pulse rounded-2xl bg-zinc-200/70'
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando dashboard">
      <div className="flex flex-col gap-3">
        <div className={`${bloco} h-8 w-40`} />
        <div className={`${bloco} h-9 w-full max-w-xl`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${bloco} h-28`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={`${bloco} h-64`} />
        <div className={`${bloco} h-64`} />
      </div>
      <div className={`${bloco} h-56`} />
    </div>
  )
}
