'use client'

import { useActionState, useEffect, useRef } from 'react'
import { registrarRecebimento } from '../../financeiro/actions'
import { FORMAS_PAGAMENTO } from '../opcoes'

const BOTOES = {
  linha: 'whitespace-nowrap rounded-lg border border-black/[.1] bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50',
  principal: 'inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700',
  cabecalho: 'inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700',
} as const

const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'
const rotulo = 'text-sm font-medium text-zinc-700'

// Modal para registrar um pagamento em UMA parcela. Toda a regra (saldo, trava, contrato cancelado,
// sincronia da parcela) continua na RPC registrar_recebimento, chamada pela Server Action existente.
export default function RegistrarPagamento({
  parcelaId,
  instancia,
  contratoId,
  titulo,
  saldo,
  variante,
  texto = 'Registrar pagamento',
  retorno,
}: {
  parcelaId: string
  instancia: string
  contratoId: string
  titulo: string
  saldo: string
  variante: keyof typeof BOTOES
  texto?: string
  // Página para onde a Server Action volta (hoje só /parcelas); sem ele, volta ao contrato.
  retorno?: string
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const uid = `${instancia}-${parcelaId}`
  // A Server Action sempre termina em redirect (sucesso ou erro na própria página). O modal fecha
  // quando o envio termina; o resultado aparece no aviso no topo da página.
  const [, acao, pendente] = useActionState(async (_: null, formData: FormData) => {
    await registrarRecebimento(parcelaId, contratoId, formData)
    return null
  }, null)

  useEffect(() => {
    if (!pendente) dialogo.current?.close()
  }, [pendente])

  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()} className={BOTOES[variante]}>
        {texto}
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={`titulo-pagamento-${uid}`}
        onCancel={(e) => {
          if (pendente) e.preventDefault()
        }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-black/[.06] bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-black/40"
      >
        <form action={acao} className="flex flex-col gap-4 p-6">
          {retorno && <input type="hidden" name="retorno" value={retorno} />}
          <div>
            <h2 id={`titulo-pagamento-${uid}`} className="text-lg font-semibold">
              Registrar pagamento
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {titulo} · saldo R$ {saldo}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`valor-${uid}`} className={rotulo}>
              Valor (R$)
            </label>
            <input id={`valor-${uid}`} name="valor" type="text" inputMode="decimal" placeholder="0,00" required disabled={pendente} className={campo} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`data-${uid}`} className={rotulo}>
              Data
            </label>
            <input id={`data-${uid}`} name="data" type="date" disabled={pendente} className={campo} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`forma-${uid}`} className={rotulo}>
              Forma de pagamento
            </label>
            <select id={`forma-${uid}`} name="forma_pagamento" required defaultValue="" disabled={pendente} className={campo}>
              <option value="" disabled>
                Selecione
              </option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`obs-${uid}`} className={rotulo}>
              Observações <span className="text-zinc-400">(opcional)</span>
            </label>
            <input id={`obs-${uid}`} name="observacoes" type="text" disabled={pendente} className={campo} />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              disabled={pendente}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pendente}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendente ? 'Registrando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
