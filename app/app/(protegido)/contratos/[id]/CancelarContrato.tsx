'use client'

import { useActionState, useRef, useState } from 'react'
import { cancelarContrato } from '../actions'
import { MOTIVO_CANCELAMENTO_MAX, type EstadoCancelamento } from '../cancelamento'

export default function CancelarContrato({ contratoId }: { contratoId: string }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [estado, acao, pendente] = useActionState<EstadoCancelamento, FormData>(
    cancelarContrato.bind(null, contratoId),
    null
  )
  const [motivo, setMotivo] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  // Depois de uma ação o React reinicia o formulário (a caixa volta a desmarcada no DOM). Se a
  // resposta foi um erro, o estado acompanha: o usuário confirma de novo antes de reenviar.
  const [estadoVisto, setEstadoVisto] = useState(estado)
  if (estado !== estadoVisto) {
    setEstadoVisto(estado)
    if (estado?.erro) setConfirmado(false)
  }

  const podeConfirmar = motivo.trim().length > 0 && confirmado && !pendente

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/30"
      >
        Cancelar contrato
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-cancelar-contrato"
        onCancel={(e) => {
          if (pendente) e.preventDefault()
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-black/[.06] bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-black/40 dark:border-white/[.1] dark:bg-zinc-950 dark:text-zinc-50"
      >
        <form action={acao} className="flex flex-col gap-4 p-6">
          <div>
            <h2 id="titulo-cancelar-contrato" className="text-lg font-semibold text-red-800 dark:text-red-300">
              Cancelar contrato
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Leia antes de confirmar:</p>
          </div>

          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>As cobranças futuras deixarão de aparecer no Dashboard e no Financeiro.</li>
            <li>Os valores já recebidos serão preservados no histórico.</li>
            <li>Nenhum estorno será realizado.</li>
            <li>O contrato não poderá receber novos pagamentos.</li>
            <li>Não há como reativar o contrato depois de cancelado.</li>
          </ul>

          <div className="flex flex-col gap-1">
            <label htmlFor="motivo-cancelamento" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Motivo do cancelamento
            </label>
            <textarea
              id="motivo-cancelamento"
              name="motivo"
              required
              rows={3}
              maxLength={MOTIVO_CANCELAMENTO_MAX}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={pendente}
              placeholder="Ex.: cliente desistiu do evento"
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-red-600 disabled:opacity-60 dark:border-white/[.145]"
            />
            <span className="self-end text-xs text-zinc-500">
              {motivo.length}/{MOTIVO_CANCELAMENTO_MAX}
            </span>
          </div>

          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="confirmacao"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              disabled={pendente}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            Entendo os efeitos e quero cancelar este contrato.
          </label>

          <div aria-live="polite">
            {estado?.erro && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {estado.erro}
              </p>
            )}
            {pendente && <p className="text-sm text-zinc-600 dark:text-zinc-400">Cancelando o contrato…</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              disabled={pendente}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={!podeConfirmar}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendente ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
