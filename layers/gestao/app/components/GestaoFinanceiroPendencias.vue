<script setup lang="ts">
import { brl } from '../../domain/acoes-processo'
import { ROTULO_SITUACAO, type LinhaAluguel, type PendenciasFinanceiras } from '../../domain/financeiro'
import type { ContextoRecebimento, DadosRecebimentoForm } from '../../domain/cobranca'

const props = defineProps<{
  pendencias: PendenciasFinanceiras
  podeEditar: boolean
  /** Registra e devolve a frase de erro (ou `null`): o modal fica aberto com o erro até dar certo. */
  registrar: (acao: 'pagar' | 'repassar', locacaoId: string, cobrancaId: string, d: DadosRecebimentoForm, arquivo: File | null) => Promise<string | null>
}>()

const mes = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`
const dia = (iso: string) => iso.split('-').reverse().join('/')

const modal = ref<{ abrir: (c: ContextoRecebimento) => void } | null>(null)
const alvo = ref<{ acao: 'pagar' | 'repassar'; l: LinhaAluguel } | null>(null)
const confirmar = (d: DadosRecebimentoForm, arquivo: File | null) => props.registrar(alvo.value!.acao, alvo.value!.l.locacaoId, alvo.value!.l.cobrancaId, d, arquivo)

function abrir(acao: 'pagar' | 'repassar', l: LinhaAluguel) {
  alvo.value = { acao, l }
  const titulo = `${l.imovel} · ${mes(l.competencia)}, vence em ${dia(l.vencimento)}.`
  if (acao === 'repassar') {
    modal.value?.abrir({ modo: 'repasse', titulo, sugerido: l.repasseSaldo, resumo: [{ rotulo: 'A repassar', valor: l.repasse }, { rotulo: 'Falta repassar', valor: l.repasseSaldo }] })
    return
  }
  const resumo = [{ rotulo: 'Aluguel', valor: l.valor }]
  if (l.diasAtraso) resumo.push({ rotulo: `Multa (${l.diasAtraso} dias de atraso)`, valor: l.multa }, { rotulo: 'Juros', valor: l.juros })
  if (l.recebido) resumo.push({ rotulo: 'Já pago', valor: l.recebido })
  resumo.push({ rotulo: 'Falta pagar', valor: l.saldo })
  modal.value?.abrir({ modo: 'pagamento', titulo, sugerido: l.saldo, resumo })
}

// No celular as pendências viram uma faixa de resumo; a lista abre sob demanda e não empurra as abas para fora da primeira tela.
const aberto = ref(false)
const botao =
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <section class="[display:grid] gap-4" aria-labelledby="fin-pendencias" data-testid="fin-pendencias">
    <div>
      <h2 id="fin-pendencias" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Pendências</h2>
      <p class="mt-1 hidden text-[var(--ink-soft)] md:block">O que ainda precisa de ação, de todos os meses. Registre aqui sem abrir o contrato.</p>
      <p class="mt-1 text-[var(--ink-soft)] md:hidden" data-testid="fin-pend-resumo">
        {{ pendencias.receber.length }} a receber · {{ pendencias.repassar.length }} repasses a fazer
        <button type="button" class="ml-2 min-h-11 cursor-pointer border-0 bg-transparent font-bold text-[var(--brand)] underline" :aria-expanded="aberto" data-testid="fin-pend-alternar" @click="aberto = !aberto">{{ aberto ? 'Ocultar' : 'Ver' }}</button>
      </p>
    </div>

    <div :class="aberto ? 'flex flex-col gap-4' : 'hidden md:flex md:flex-col md:gap-4'">

    <div v-for="grupo in [
      { chave: 'receber', titulo: 'Aluguéis a receber', vazio: 'Nenhum aluguel em aberto.', itens: pendencias.receber },
      { chave: 'repassar', titulo: 'Repasses a fazer', vazio: 'Nenhum repasse pendente.', itens: pendencias.repassar },
    ]" :key="grupo.chave" class="[display:grid] gap-2">
      <h3 class="m-0 text-[length:var(--fs-body)] font-bold">{{ grupo.titulo }} ({{ grupo.itens.length }})</h3>
      <p v-if="!grupo.itens.length" class="m-0 text-[var(--ink-soft)]">{{ grupo.vazio }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-2 p-0" :data-testid="`fin-pend-${grupo.chave}`">
        <li v-for="l in grupo.itens" :key="l.cobrancaId" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-[var(--paper)] px-3 py-2" :class="l.diasAtraso > 0 ? 'border-[#b91c1c]' : 'border-[var(--line)]'" :data-testid="`fin-pend-${grupo.chave}-item`">
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/gestao/locacao/${l.locacaoId}`" class="font-bold text-[var(--brand)]">{{ l.imovel }}</NuxtLink>
            <small class="block text-[var(--ink-soft)]">{{ l.locacaoId }} · {{ mes(l.competencia) }} · <span class="whitespace-nowrap">vence em {{ dia(l.vencimento) }}</span></small>
          </div>
          <strong :title="grupo.chave === 'receber' && l.diasAtraso ? `Original ${brl(l.valor)} + multa ${brl(l.multa)} + juros ${brl(l.juros)}` : undefined">{{ brl(grupo.chave === 'receber' ? l.saldo : l.repasseSaldo) }}</strong>
          <small v-if="grupo.chave === 'receber' && l.diasAtraso" class="font-semibold text-[var(--danger)]">{{ l.diasAtraso }} dias de atraso, com multa e juros</small>
          <span v-if="grupo.chave === 'receber'" class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" 
 :class="l.situacao === 'atrasada' ? 'bg-[#fee2e2] text-[#7f1d1d]' : l.situacao === 'parcial' ? 'bg-[#dbeafe] text-[#1e3a8a]' : 'bg-[#fef3c7] text-[#78350f]'">{{ ROTULO_SITUACAO[l.situacao] }}</span>
          <template v-if="podeEditar">
            <button v-if="grupo.chave === 'receber'" type="button" :class="botao" data-testid="fin-pagar" @click="abrir('pagar', l)">
              Registrar pagamento<span class="sr-only"> de {{ l.imovel }}, {{ mes(l.competencia) }}</span>
            </button>
            <button v-else type="button" :class="botao" data-testid="fin-repassar" @click="abrir('repassar', l)">
              Registrar repasse<span class="sr-only"> de {{ l.imovel }}, {{ mes(l.competencia) }}</span>
            </button>
          </template>
        </li>
      </ul>
    </div>
    </div>
    <GestaoRecebimentoModal ref="modal" :enviar="confirmar" />
  </section>
</template>
