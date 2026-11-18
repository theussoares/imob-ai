<script setup lang="ts">
import { brl } from '../../domain/acoes-processo'
import type { Cobranca } from '../../domain/types'

defineProps<{ cobrancas: Cobranca[]; podeEditar: boolean; demo?: boolean }>()
const emit = defineEmits<{
  gerar: [competencia: string]
  pagar: [cobrancaId: string, comprovante: string]
  repassar: [cobrancaId: string, comprovante: string]
}>()

const competencia = ref(new Date().toISOString().slice(0, 7))

// O demo não sobe binário: o comprovante é o nome do arquivo escolhido.
function comprovante(e: Event, acao: 'pagar' | 'repassar', id: string) {
  const input = e.target as HTMLInputElement
  const nome = input.files?.[0]?.name ?? ''
  input.value = ''
  if (!nome) return
  if (acao === 'pagar') emit('pagar', id, nome)
  else emit('repassar', id, nome)
}

const botao =
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 font-bold hover:bg-[var(--brand-ghost)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]'
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
      <li v-for="c in cobrancas" :key="c.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] px-3 py-2" :data-testid="`cobranca-${c.competencia}`">
        <div class="min-w-0 flex-1">
          <strong class="block">{{ c.competencia }} · {{ brl(c.valor) }}</strong>
          <small class="text-[var(--ink-soft)]">Vence em {{ c.vencimento }}</small>
        </div>
        <span class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" :class="c.pago ? 'bg-[#d1fae5] text-[#064e3b]' : 'bg-[#fef3c7] text-[#78350f]'">
          {{ c.pago ? 'Paga' : 'Em aberto' }}
        </span>
        <span v-if="c.repasse" class="rounded-full px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold" :class="c.repasse.feito ? 'bg-[#d1fae5] text-[#064e3b]' : 'bg-[#fef3c7] text-[#78350f]'">
          Repasse {{ brl(c.repasse.valor) }} · {{ c.repasse.feito ? 'feito' : 'pendente' }}
        </span>
        <label v-if="podeEditar && !c.pago" :class="botao" data-testid="pagar">
          Registrar pagamento<span class="sr-only"> de {{ c.competencia }}</span>
          <input type="file" class="sr-only" @change="comprovante($event, 'pagar', c.id)" />
        </label>
        <label v-if="podeEditar && c.pago && c.repasse && !c.repasse.feito" :class="botao" data-testid="repassar">
          Registrar repasse<span class="sr-only"> de {{ c.competencia }}</span>
          <input type="file" class="sr-only" @change="comprovante($event, 'repassar', c.id)" />
        </label>
        <button v-if="podeEditar && demo && !c.pago" type="button" :class="botao" data-testid="pagar-exemplo" @click="emit('pagar', c.id, `comprovante-${c.competencia}.pdf`)">
          Anexar comprovante de exemplo
        </button>
        <button v-if="podeEditar && demo && c.pago && c.repasse && !c.repasse.feito" type="button" :class="botao" data-testid="repassar-exemplo" @click="emit('repassar', c.id, `repasse-${c.competencia}.pdf`)">
          Anexar comprovante do repasse (exemplo)
        </button>
      </li>
    </ul>
  </section>
</template>
