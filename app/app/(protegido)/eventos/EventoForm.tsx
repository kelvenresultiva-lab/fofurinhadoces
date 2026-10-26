import { formatarHorarioInput } from './datas'
import { TIPOS_EVENTO, STATUS_EVENTO } from './opcoes'

type EventoFormValues = {
  cliente_id?: string
  tipo?: string
  titulo?: string
  data?: string | null
  horario?: string | null
  local?: string
  cidade?: string
  numero_convidados?: number | string | null
  status?: string
  observacoes?: string
}

export function EventoForm({
  action,
  clientesDisponiveis,
  valores,
  erro,
  textoBotao,
}: {
  action: (formData: FormData) => void
  clientesDisponiveis: { id: string; nome: string }[]
  valores?: EventoFormValues
  erro?: string
  textoBotao: string
}) {
  const inputClasses =
    'rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-950 dark:border-white/[.145] dark:focus:border-zinc-50'
  const labelClasses = 'text-sm font-medium text-zinc-700 dark:text-zinc-300'

  return (
    <form action={action} className="flex flex-col gap-6">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="cliente_id" className={labelClasses}>
            Cliente
          </label>
          <select
            id="cliente_id"
            name="cliente_id"
            required
            defaultValue={valores?.cliente_id ?? ''}
            className={inputClasses}
          >
            <option value="" disabled>
              Selecione um cliente
            </option>
            {clientesDisponiveis.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tipo" className={labelClasses}>
            Tipo de evento
          </label>
          <select id="tipo" name="tipo" defaultValue={valores?.tipo ?? 'casamento'} className={inputClasses}>
            {TIPOS_EVENTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="titulo" className={labelClasses}>
            Título <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            id="titulo"
            name="titulo"
            type="text"
            defaultValue={valores?.titulo ?? ''}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="data" className={labelClasses}>
            Data
          </label>
          <input id="data" name="data" type="date" defaultValue={valores?.data ?? ''} className={inputClasses} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="horario" className={labelClasses}>
            Horário
          </label>
          <input
            id="horario"
            name="horario"
            type="time"
            defaultValue={formatarHorarioInput(valores?.horario)}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="local" className={labelClasses}>
            Local <span className="text-zinc-400">(opcional)</span>
          </label>
          <input id="local" name="local" type="text" defaultValue={valores?.local ?? ''} className={inputClasses} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cidade" className={labelClasses}>
            Cidade <span className="text-zinc-400">(opcional)</span>
          </label>
          <input id="cidade" name="cidade" type="text" defaultValue={valores?.cidade ?? ''} className={inputClasses} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="numero_convidados" className={labelClasses}>
            Número de convidados <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            id="numero_convidados"
            name="numero_convidados"
            type="number"
            min={0}
            defaultValue={valores?.numero_convidados ?? ''}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClasses}>
            Status
          </label>
          <select id="status" name="status" defaultValue={valores?.status ?? 'planejado'} className={inputClasses}>
            {STATUS_EVENTO.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="observacoes" className={labelClasses}>
          Observações
        </label>
        <textarea
          id="observacoes"
          name="observacoes"
          defaultValue={valores?.observacoes ?? ''}
          rows={3}
          className={inputClasses}
        />
      </div>

      <button
        type="submit"
        className="self-start rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        {textoBotao}
      </button>
    </form>
  )
}
