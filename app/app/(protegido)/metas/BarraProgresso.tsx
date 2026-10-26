import { formatarPercentual } from './calculos'

// Barra de progresso de UMA meta: roxa em andamento, verde quando atingida. A barra satura em 100%,
// o rótulo mostra o percentual real (pode passar de 100%).
export function BarraProgresso({ percentual, atingida, rotulo }: { percentual: number; atingida: boolean; rotulo: string }) {
  const largura = Math.min(100, Math.max(0, percentual))
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(largura)}
        className="h-3 w-full overflow-hidden rounded-full bg-zinc-100"
      >
        <div className={`h-full rounded-full ${atingida ? 'bg-green-600' : 'bg-indigo-600'}`} style={{ width: `${largura}%` }} />
      </div>
      <p className={`text-sm font-semibold ${atingida ? 'text-green-700' : 'text-indigo-700'}`}>
        {formatarPercentual(percentual)} {atingida ? '· meta atingida' : 'alcançado'}
      </p>
    </div>
  )
}
