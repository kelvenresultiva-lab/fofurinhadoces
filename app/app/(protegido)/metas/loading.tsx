export default function CarregandoMetas() {
  const bloco = 'animate-pulse rounded-2xl bg-zinc-200/70'
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando metas">
      <div className="flex flex-col gap-2">
        <div className={`${bloco} h-8 w-32`} />
        <div className={`${bloco} h-4 w-96 max-w-full`} />
      </div>
      <div className={`${bloco} h-10 w-full max-w-lg`} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={`${bloco} h-72`} />
        <div className={`${bloco} h-72`} />
      </div>
      <div className={`${bloco} h-60`} />
    </div>
  )
}
