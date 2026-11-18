<script setup lang="ts">
import { brl } from '../../domain/acoes-processo'
import { devidoDaCobranca, ENCARGOS_PADRAO, ROTULO_SITUACAO_COBRANCA, type ContextoRecebimento, type DadosRecebimentoForm, type EncargosConfig, type SituacaoCobranca } from '../../domain/cobranca'
import { hojeISO } from '../../domain/avisos-locacao'
import { agoraBrasilData } from '../../domain/periodo'
import type { Cobranca } from '../../domain/types'

const props = defineProps<{
  cobrancas: Cobranca[]
  podeEditar: boolean
  /** multa e juros em vigor (configurações) */
  encargos?: EncargosConfig
  /** Registra e devolve a frase de erro (ou `null`): o modal fica aberto com o erro até dar certo. */
  registrar: (acao: 'pagar' | 'repassar', cobrancaId: string, d: DadosRecebimentoForm) => Promise<string | null>
}>()
const emit = defineEmits<{ gerar: [competencia: string] }>()

const competencia = ref(hojeISO(agoraBrasilData()).slice(0, 7))
// O dia no fuso do painel, a mesma base do Financeiro: é isso que faz as duas telas concordarem.
const hoje = computed(() => hojeISO(agoraBrasilData()))
const cfg = computed(() => props.encargos ?? ENCARGOS_PADRAO)
const dev = (c: Cobranca) => devidoDaCobranca(c, hoje.value, cfg.value)

const dia = (iso: string) => iso.split('-').reverse().join('/')
const TOM: Record<SituacaoCobranca, string> = {
  paga: 'bg-[#d1fae5] text-[#064e3b]',
  parcial: 'bg-[#dbeafe] text-[#1e3a8a]',
  atrasada: 'bg-[#fee2e2] text-[#7f1d1d]',
  aberta: 'bg-[#fef3c7] text-[#78350f]',
}
// Parcial já vencida segue sinalizada como atraso no texto (a etiqueta é «Parcial»).
const emAtraso = (c: Cobranca) => !c.pago && dev(c).vencida

const modal = ref<{ abrir: (c: ContextoRecebimento) => void } | null>(null)
const alvo = ref<{ acao: 'pagar' | 'repassar'; id: string } | null>(null)
const confirmar = (d: DadosRecebimentoForm) => props.registrar(alvo.value!.acao, alvo.value!.id, d)

function abrirPagamento(c: Cobranca) {
  const d = dev(c)
  alvo.value = { acao: 'pagar', id: c.id }
  const resumo = [{ rotulo: 'Aluguel', valor: c.valor }]
  if (d.encargos.dias) resumo.push({ rotulo: `Multa (${d.encargos.dias} dias de atraso)`, valor: d.encargos.multa }, { rotulo: 'Juros', valor: d.encargos.juros })
  if (d.pago) resumo.push({ rotulo: 'Já pago', valor: d.pago })
  resumo.push({ rotulo: 'Falta pagar', valor: d.saldo })
  modal.value?.abrir({ modo: 'pagamento', titulo: `Cobrança de ${c.competencia}, vence em ${dia(c.vencimento)}.`, sugerido: d.saldo, resumo })
}
function abrirRepasse(c: Cobranca) {
  if (!c.repasse) return
  const falta = Math.round((c.repasse.valor - (c.repasse.repassado ?? 0)) * 100) / 100
  alvo.value = { acao: 'repassar', id: c.id }
  modal.value?.abrir({ modo: 'repasse', titulo: `Repasse ao locador de ${c.competencia} (aluguel menos a taxa).`, sugerido: falta, resumo: [{ rotulo: 'A repassar', valor: c.repasse.valor }, { rotulo: 'Falta repassar', valor: falta }] })
}

const botao =
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <section class="[display:grid] gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="cobrancas-titulo">
    <h2 id="cobrancas-titulo" class="m-0 text-[length:var(--fs-body)] font-bold">Cobranças e repasses</h2>
    <form v-if="podeEditar" class="flex flex-wrap items-end gap-2" @submit.prevent="emit('gerar', competencia)">
      <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
        Competência
        <input v-model="competencia" type="month" class="min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3" data-testid="cobranca-competencia" />
      </label>
      <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90" data-testid="gerar-cobranca">Gerar cobrança</button>
    </form>
    <p v-if="!cobrancas.length" class="m-0 text-[var(--ink-soft)]">Nenhuma cobrança gerada.</p>
    <ul v-else class="m-0 flex list-none flex-col gap-2 p-0" data-testid="cobrancas">
      <li v-for="c in cobrancas" :key="c.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-2" :class="emAtraso(c) ? 'border-[#b91c1c]' : 'border-[var(--line)]'" :data-testid="`cobranca-${c.competencia}`" :data-situacao="dev(c).situacao">
        <div class="min-w-0 flex-1">
          <strong class="block">{{ c.competencia }} · {{ brl(c.valor) }}</strong>
          <small class="whitespace-nowrap text-[var(--ink-soft)]">Vence em {{ dia(c.vencimento) }}</small>
          <small v-if="dev(c).encargos.dias && !c.pago" class="block font-semibold text-[var(--danger)]" data-testid="encargos">
            {{ dev(c).encargos.dias }} {{ dev(c).encargos.dias === 1 ? 'dia' : 'dias' }} de atraso · original {{ brl(c.valor) }} + multa {{ brl(dev(c).encargos.multa) }} + juros {{ brl(dev(c).encargos.juros) }} = <strong>{{ brl(dev(c).encargos.atualizado) }}</strong>
          </small>
          <small v-if="dev(c).pago && !c.pago" class="block text-[var(--ink-soft)]" data-testid="parcial">Pago {{ brl(dev(c).pago) }} · falta {{ brl(dev(c).saldo) }}</small>
          <small v-if="c.pagamentos?.length" class="block text-[var(--ink-soft)]">
            Recebido: <span v-for="(p, i) in c.pagamentos" :key="p.id">{{ i ? '; ' : '' }}{{ brl(p.valor) }} em {{ dia(p.data) }} ({{ p.forma }})</span>
          </small>
        </div>
        <span class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" :class="TOM[dev(c).situacao]" data-testid="situacao-cobranca">
          {{ ROTULO_SITUACAO_COBRANCA[dev(c).situacao] }}
        </span>
        <span v-if="c.repasse" class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" :class="c.repasse.feito ? 'bg-[#d1fae5] text-[#064e3b]' : 'bg-[#fef3c7] text-[#78350f]'">
          Repasse {{ brl(c.repasse.valor) }} · {{ c.repasse.feito ? 'feito' : c.repasse.repassado ? `parcial (${brl(c.repasse.repassado)})` : 'pendente' }}
        </span>
        <button v-if="podeEditar && !c.pago" type="button" :class="botao" data-testid="pagar" @click="abrirPagamento(c)">
          Registrar pagamento<span class="sr-only"> de {{ c.competencia }}</span>
        </button>
        <button v-if="podeEditar && c.pago && c.repasse && !c.repasse.feito" type="button" :class="botao" data-testid="repassar" @click="abrirRepasse(c)">
          Registrar repasse<span class="sr-only"> de {{ c.competencia }}</span>
        </button>
      </li>
    </ul>
    <GestaoRecebimentoModal ref="modal" :enviar="confirmar" />
  </section>
</template>
