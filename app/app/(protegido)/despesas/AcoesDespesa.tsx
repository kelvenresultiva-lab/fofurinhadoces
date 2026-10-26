'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { FORMAS_PAGAMENTO } from '../contratos/opcoes'
import { cancelarDespesa, pagarDespesa } from './actions'
import type { EstadoAcaoDespesa } from './opcoes'

const campo = 'rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600'
const rotulo = 'text-sm font-medium text-zinc-700'
const botaoLinha = 'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors'
const dialogoClasses = 'm-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-black/[.06] bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-black/40'

// Ações de uma despesa PENDENTE: editar, marcar como paga e cancelar. As Server Actions só alteram
// despesa ainda pendente; o banco (trigger) também recusa mudar despesa paga ou cancelada.
export default function AcoesDespesa({
  id,
  descricao,
  valor,
  hoje,
  instancia,
  emLinha = false,
}: {
  id: string
  descricao: string
  valor: string
  hoje: string
  instancia: string
  // Na tabela os botões ficam lado a lado; no card podem quebrar linha.
  emLinha?: boolean
}) {
  const uid = `${instancia}-${id}`
  const pagar = useRef<HTMLDialogElement>(null)
  const cancelar = useRef<HTMLDialogElement>(null)
  const [estadoPagar, acaoPagar, pagando] = useActionState<EstadoAcaoDespesa, FormData>(pagarDespesa.bind(null, id), null)
  const [estadoCancelar, acaoCancelar, cancelando] = useActionState<EstadoAcaoDespesa, FormData>(cancelarDespesa.bind(null, id), null)

  // Sucesso: a action revalida /despesas (cards e lista atualizam) e o modal fecha.
  useEffect(() => {
    if (estadoPagar?.ok) pagar.current?.close()
  }, [estadoPagar])
  useEffect(() => {
    if (estadoCancelar?.ok) cancelar.current?.close()
  }, [estadoCancelar])

  return (
    <div className={`flex items-center gap-2 ${emLinha ? 'justify-end' : 'flex-wrap'}`}>
      <Link href={`/despesas/${id}`} className={`${botaoLinha} border border-black/[.08] bg-white text-zinc-700 hover:bg-black/[.04]`}>
        Editar
      </Link>
      <button type="button" onClick={() => pagar.current?.showModal()} className={`${botaoLinha} bg-indigo-600 text-white hover:bg-indigo-700`}>
        Marcar como paga
      </button>
      <button type="button" onClick={() => cancelar.current?.showModal()} className={`${botaoLinha} border border-red-200 bg-white text-red-700 hover:bg-red-50`}>
        Cancelar
      </button>

      <dialog
        ref={pagar}
        aria-labelledby={`titulo-pagar-${uid}`}
        onCancel={(e) => {
          if (pagando) e.preventDefault()
        }}
        className={dialogoClasses}
      >
        <form action={acaoPagar} className="flex flex-col gap-4 p-6">
          <div>
            <h2 id={`titulo-pagar-${uid}`} className="text-lg font-semibold">
              Marcar como paga
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {descricao} · R$ {valor}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`data-${uid}`} className={rotulo}>
              Data do pagamento
            </label>
            <input id={`data-${uid}`} name="data_pagamento" type="date" required max={hoje} defaultValue={hoje} disabled={pagando} className={campo} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`forma-${uid}`} className={rotulo}>
              Forma de pagamento
            </label>
            <select id={`forma-${uid}`} name="forma_pagamento" required defaultValue="" disabled={pagando} className={campo}>
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
          <div aria-live="polite">
            {estadoPagar?.erro && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {estadoPagar.erro}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => pagar.current?.close()}
              disabled={pagando}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pagando}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pagando ? 'Salvando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={cancelar}
        aria-labelledby={`titulo-cancelar-${uid}`}
        onCancel={(e) => {
          if (cancelando) e.preventDefault()
        }}
        className={dialogoClasses}
      >
        <form action={acaoCancelar} className="flex flex-col gap-4 p-6">
          <div>
            <h2 id={`titulo-cancelar-${uid}`} className="text-lg font-semibold text-red-800">
              Cancelar despesa
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {descricao} · R$ {valor}
            </p>
          </div>
          <p className="text-sm text-zinc-700">
            A despesa fica no histórico como cancelada, sai dos totais e não poderá ser paga nem reaberta.
          </p>
          <div aria-live="polite">
            {estadoCancelar?.erro && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {estadoCancelar.erro}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => cancelar.current?.close()}
              disabled={cancelando}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={cancelando}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelando ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
