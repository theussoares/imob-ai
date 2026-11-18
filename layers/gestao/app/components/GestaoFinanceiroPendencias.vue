<script setup lang="ts">
import { brl } from '../../domain/acoes-processo'
import { ROTULO_SITUACAO, type LinhaAluguel, type PendenciasFinanceiras } from '../../domain/financeiro'

defineProps<{ pendencias: PendenciasFinanceiras; podeEditar: boolean; demo?: boolean }>()
const emit = defineEmits<{
  pagar: [locacaoId: string, cobrancaId: string, comprovante: string]
  repassar: [locacaoId: string, cobrancaId: string, comprovante: string]
}>()

const mes = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`
const dia = (iso: string) => iso.split('-').reverse().join('/')

// O demo não sobe binário: o comprovante é o nome do arquivo escolhido.
function escolher(e: Event, acao: 'pagar' | 'repassar', l: LinhaAluguel) {
  const input = e.target as HTMLInputElement
  const nome = input.files?.[0]?.name ?? ''
  input.value = ''
  if (!nome) return
  if (acao === 'pagar') emit('pagar', l.locacaoId, l.cobrancaId, nome)
  else emit('repassar', l.locacaoId, l.cobrancaId, nome)
}

// No celular as pendências viram uma faixa de resumo; a lista abre sob demanda e não empurra as abas para fora da primeira tela.
const aberto = ref(false)
const botao =
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]'
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
        <li v-for="l in grupo.itens" :key="l.cobrancaId" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-[var(--paper)] px-3 py-2" :class="l.situacao === 'atrasada' ? 'border-[#b91c1c]' : 'border-[var(--line)]'" :data-testid="`fin-pend-${grupo.chave}-item`">
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/gestao/locacao/${l.locacaoId}`" class="font-bold text-[var(--brand)]">{{ l.imovel }}</NuxtLink>
            <small class="block text-[var(--ink-soft)]">{{ l.locacaoId }} · {{ mes(l.competencia) }} · vence em {{ dia(l.vencimento) }}</small>
          </div>
          <strong>{{ brl(grupo.chave === 'receber' ? l.valor : l.repasse) }}</strong>
          <span v-if="grupo.chave === 'receber'" class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" :class="l.situacao === 'atrasada' ? 'bg-[#fee2e2] text-[#7f1d1d]' : 'bg-[#fef3c7] text-[#78350f]'">{{ ROTULO_SITUACAO[l.situacao] }}</span>
          <template v-if="podeEditar">
            <label v-if="grupo.chave === 'receber'" :class="botao" data-testid="fin-pagar">
              Registrar pagamento<span class="sr-only"> de {{ l.imovel }}, {{ mes(l.competencia) }}</span>
              <input type="file" class="sr-only" @change="escolher($event, 'pagar', l)" />
            </label>
            <label v-else :class="botao" data-testid="fin-repassar">
              Registrar repasse<span class="sr-only"> de {{ l.imovel }}, {{ mes(l.competencia) }}</span>
              <input type="file" class="sr-only" @change="escolher($event, 'repassar', l)" />
            </label>
            <button v-if="demo" type="button" :class="botao" :data-testid="grupo.chave === 'receber' ? 'fin-pagar-exemplo' : 'fin-repassar-exemplo'" @click="grupo.chave === 'receber' ? emit('pagar', l.locacaoId, l.cobrancaId, `comprovante-${l.competencia}.pdf`) : emit('repassar', l.locacaoId, l.cobrancaId, `repasse-${l.competencia}.pdf`)">
              Comprovante de exemplo
            </button>
          </template>
        </li>
      </ul>
    </div>
    </div>
  </section>
</template>
