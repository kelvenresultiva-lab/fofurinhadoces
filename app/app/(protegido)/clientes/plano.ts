import { saldoParcela, somaMoeda } from '../financeiro/calculos'
import { formatarBRL } from '../dashboard/widgets'
import { formatarDataBR } from '../eventos/datas'

// Resumo do combinado de pagamento de um contrato, para a área de Clientes. Tudo vem das parcelas
// gravadas pela RPC converter_orcamento_em_contrato: a parcela com descrição "Entrada" é a entrada;
// as demais são o restante. Parcela cancelada individualmente fica de fora do combinado.

type Numerico = number | string

export type ParcelaPlano = { numero: number; descricao: string | null; valor: Numerico; valor_pago: Numerico; vencimento: string; status: string }

export type ContratoPlano = {
  id: string
  status: string
  valor_final: Numerico
  numeroOrcamento: number | null
  evento: { tipo: string; data: string | null } | null
  parcelas: ParcelaPlano[]
}

export type PlanoPagamento = {
  id: string
  numero: number | null
  cancelado: boolean
  valor: number
  recebido: number
  saldo: number
  entrada: { valor: number; vencimento: string; paga: boolean } | null
  restante: { valor: number; qtd: number; parcelaIgual: number | null; primeiro: string; ultimo: string; noMesDoEvento: boolean } | null
  // Como o restante (sem a entrada) será pago: "3x de R$ 2.000,00 (de 05/10/2026 a 05/12/2026)".
  restanteTexto: string
  // Frase pronta: "Entrada R$ 2.000,00 + restante em 3x de R$ 2.000,00".
  resumo: string
}

const nomeDoEvento = (tipo: string | undefined) => (tipo === 'casamento' ? 'do casamento' : 'do evento')

export function planoPagamento(c: ContratoPlano): PlanoPagamento {
  const validas = c.parcelas.filter((p) => p.status !== 'cancelado').sort((a, b) => a.numero - b.numero)
  const entradaParcela = validas.find((p) => p.descricao === 'Entrada') ?? null
  const resto = validas.filter((p) => p !== entradaParcela).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const cancelado = c.status === 'cancelado'

  const entrada = entradaParcela
    ? { valor: Number(entradaParcela.valor), vencimento: entradaParcela.vencimento, paga: saldoParcela(entradaParcela) <= 0 }
    : null

  let restante: PlanoPagamento['restante'] = null
  if (resto.length > 0) {
    const valores = resto.map((p) => Number(p.valor))
    const igual = valores.every((v) => v === valores[0]) ? valores[0] : null
    const mesEvento = c.evento?.data?.slice(0, 7)
    restante = {
      valor: somaMoeda(valores),
      qtd: resto.length,
      parcelaIgual: igual,
      primeiro: resto[0].vencimento,
      ultimo: resto[resto.length - 1].vencimento,
      // Restante pago de uma vez no mês do evento (ex.: tudo no mês do casamento).
      noMesDoEvento: resto.length === 1 && !!mesEvento && resto[0].vencimento.slice(0, 7) === mesEvento,
    }
  }

  const recebido = somaMoeda(c.parcelas.map((p) => p.valor_pago))
  const saldo = cancelado ? 0 : somaMoeda(validas.map((p) => Math.max(0, saldoParcela(p))))

  let restanteTexto = '—'
  if (restante) {
    if (restante.noMesDoEvento) {
      restanteTexto = `${formatarBRL(restante.valor)} de uma vez, no mês ${nomeDoEvento(c.evento?.tipo)} (${formatarDataBR(restante.primeiro)})`
    } else if (restante.qtd === 1) {
      restanteTexto = `${formatarBRL(restante.valor)} em 1x (${formatarDataBR(restante.primeiro)})`
    } else {
      const parcelas = restante.parcelaIgual !== null ? `${restante.qtd}x de ${formatarBRL(restante.parcelaIgual)}` : `${formatarBRL(restante.valor)} em ${restante.qtd}x`
      restanteTexto = `${parcelas} (de ${formatarDataBR(restante.primeiro)} a ${formatarDataBR(restante.ultimo)})`
    }
  }

  const partes: string[] = []
  if (entrada) partes.push(`Entrada ${formatarBRL(entrada.valor)}`)
  if (restante) partes.push(`${entrada ? 'restante' : 'pagamento'} ${restanteTexto}`)
  const resumo = partes.length > 0 ? partes.join(' + ') : 'Sem parcelas'

  return {
    id: c.id,
    numero: c.numeroOrcamento,
    cancelado,
    valor: Number(c.valor_final),
    recebido,
    saldo,
    entrada,
    restante,
    restanteTexto,
    resumo,
  }
}

// Linha crua lida do Supabase (contrato com evento, parcelas e orçamento de origem embutidos).
export type ContratoLido = {
  id: string
  status: string
  valor_final: Numerico
  evento: { cliente_id: string; tipo: string; data: string | null } | { cliente_id: string; tipo: string; data: string | null }[] | null
  parcelas: ParcelaPlano[] | null
  orcamentos: { numero: number }[] | { numero: number } | null
}

export const SELECT_CONTRATO_PLANO =
  'id, status, valor_final, evento:eventos(cliente_id, tipo, data), parcelas(numero, descricao, valor, valor_pago, vencimento, status), orcamentos(numero)'

export function paraContratoPlano(l: ContratoLido): ContratoPlano & { clienteId: string | null } {
  const evento = Array.isArray(l.evento) ? l.evento[0] ?? null : l.evento
  const orcamento = Array.isArray(l.orcamentos) ? l.orcamentos[0] ?? null : l.orcamentos
  return {
    id: l.id,
    status: l.status,
    valor_final: l.valor_final,
    numeroOrcamento: orcamento?.numero ?? null,
    evento: evento ? { tipo: evento.tipo, data: evento.data } : null,
    parcelas: l.parcelas ?? [],
    clienteId: evento?.cliente_id ?? null,
  }
}
