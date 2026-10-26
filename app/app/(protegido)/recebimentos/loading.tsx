export default function CarregandoRecebimentos() {
  const bloco = 'animate-pulse rounded-2xl bg-zinc-200/70'
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando recebimentos">
      <div className="flex flex-col gap-2">
        <div className={`${bloco} h-8 w-48`} />
        <div className={`${bloco} h-4 w-80 max-w-full`} />
      </div>
      <div className={`${bloco} h-9 w-full max-w-2xl`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${bloco} h-28`} />
        ))}
      </div>
      <div className={`${bloco} h-10 w-full max-w-xl`} />
      <div className={`${bloco} h-72`} />
    </div>
  )
}
