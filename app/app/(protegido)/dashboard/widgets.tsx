import Link from 'next/link'

export function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarCompacto(valor: number): string {
  if (valor >= 1000) return `${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

const TONS = {
  verde: 'text-green-700',
  vermelho: 'text-red-700',
  roxo: 'text-indigo-700',
  neutro: 'text-zinc-950',
} as const

export function CardIndicador({
  titulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  titulo: string
  valor: string
  detalhe?: string
  tom?: keyof typeof TONS
}) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${TONS[tom]}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-zinc-500">{detalhe}</p>}
    </div>
  )
}

export function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string
  acao?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-black/[.06] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-950">{titulo}</h2>
        {acao && (
          <Link href={acao.href} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            {acao.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">{children}</p>
}

export function GraficoBarras({ dados }: { dados: { label: string; valor: number; atual: boolean }[] }) {
  const maximo = Math.max(...dados.map((d) => d.valor), 0)
  if (maximo === 0) return <Vazio>Nenhum recebimento registrado nos últimos 6 meses.</Vazio>

  return (
    <div className="flex h-48 items-end gap-2 sm:gap-4">
      {dados.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={formatarBRL(d.valor)}>
          <span className="text-[11px] font-medium text-zinc-600">{d.valor > 0 ? formatarCompacto(d.valor) : ''}</span>
          <div
            className={`w-full max-w-14 rounded-t-lg ${d.atual ? 'bg-green-600' : 'bg-green-400'}`}
            style={{ height: `${Math.max((d.valor / maximo) * 100, d.valor > 0 ? 3 : 0)}%` }}
          />
          <span className="text-xs text-zinc-500">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function BarraEmpilhada({ partes }: { partes: { label: string; valor: number; cor: string; texto: string }[] }) {
  const total = partes.reduce((soma, p) => soma + p.valor, 0)
  if (total === 0) return <Vazio>Ainda não há valores recebidos nem a receber.</Vazio>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-zinc-100">
        {partes.map((p) => (
          <div key={p.label} className={p.cor} style={{ width: `${(p.valor / total) * 100}%` }} title={`${p.label}: ${formatarBRL(p.valor)}`} />
        ))}
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {partes.map((p) => (
          <div key={p.label} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${p.cor}`} />
            <div>
              <dt className="text-xs text-zinc-500">
                {p.label} ({Math.round((p.valor / total) * 100)}%)
              </dt>
              <dd className={`text-base font-semibold ${p.texto}`}>{formatarBRL(p.valor)}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}
