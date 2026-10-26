export default function CarregandoContratos() {
  const bloco = 'animate-pulse rounded-2xl bg-zinc-200/70'
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando contratos">
      <div className="flex flex-col gap-2">
        <div className={`${bloco} h-8 w-40`} />
        <div className={`${bloco} h-4 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${bloco} h-28`} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className={`${bloco} h-10 w-full max-w-md`} />
        <div className={`${bloco} h-9 w-full max-w-xl`} />
      </div>
      <div className={`${bloco} h-72`} />
    </div>
  )
}
