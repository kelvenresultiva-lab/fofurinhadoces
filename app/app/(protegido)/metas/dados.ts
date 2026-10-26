import { createClient } from '@/lib/supabase/server'
import { lerTudo } from '../contratos/(lista)/leitura'
import type { ContratoMeta, RecebimentoMeta } from './calculos'

export type MetaGravada = { mes_referencia: string; meta_contratos: string | number; meta_entradas: string | number }
export type ParcelaMeta = { contrato_id: string; vencimento: string; valor: string | number; valor_pago: string | number; status: string }

// Leitura usada pela página /metas e pelo resumo do Dashboard. A RLS restringe tudo à empresa do
// usuário; lerTudo pagina de 1000 em 1000 e lança erro em qualquer falha (nunca devolve parcial).
export async function carregarDadosMetas() {
  const supabase = await createClient()
  const [metas, contratos, recebimentos, parcelas] = await Promise.all([
    lerTudo<MetaGravada>((a, b) => supabase.from('metas').select('mes_referencia, meta_contratos, meta_entradas').order('mes_referencia').range(a, b)),
    lerTudo<ContratoMeta>((a, b) => supabase.from('contratos').select('id, status, valor_final, created_at').order('id').range(a, b)),
    lerTudo<RecebimentoMeta & { id: string }>((a, b) => supabase.from('recebimentos').select('id, valor, data').order('id').range(a, b)),
    lerTudo<ParcelaMeta & { id: string }>((a, b) =>
      supabase.from('parcelas').select('id, contrato_id, vencimento, valor, valor_pago, status').order('id').range(a, b)
    ),
  ])
  const metaPorMes = new Map(metas.map((m) => [m.mes_referencia.slice(0, 7), m]))
  return { metaPorMes, contratos, recebimentos, parcelas }
}
