// Esqueleto genérico mostrado na hora do clique, enquanto a página busca os dados. Páginas com
// loading.tsx próprio (Dashboard, Contratos, Parcelas...) usam o delas.
export default function Carregando() {
  const bloco = 'animate-pulse rounded-2xl bg-zinc-200/70'
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-2">
        <div className={`${bloco} h-8 w-48`} />
        <div className={`${bloco} h-4 w-80 max-w-full`} />
      </div>
      <div className={`${bloco} h-10 w-full max-w-xl`} />
      <div className={`${bloco} h-72`} />
    </div>
  )
}
