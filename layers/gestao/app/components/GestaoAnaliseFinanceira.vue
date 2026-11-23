<script setup lang="ts">
import { MOTIVO_MAX } from '../../domain/analise-financeira'
import type { AnaliseFinanceira } from '../../domain/types'

const props = defineProps<{
  analise: AnaliseFinanceira
  /** Quem edita o financeiro (corretor do processo, ou quem tem `valores`): pode enviar. */
  podeEnviar: boolean
  /** `valores`: aprova ou devolve o que foi enviado. */
  podeAnalisar: boolean
  ocupado: boolean
}>()
const emit = defineEmits<{ enviar: []; aprovar: []; devolver: [motivo: string] }>()

const devolvendo = ref(false)
const motivo = ref('')
const erro = ref('')

function confirmarDevolucao() {
  if (!motivo.value.trim()) {
    erro.value = 'Diga o que precisa ser corrigido.'
    return
  }
  erro.value = ''
  emit('devolver', motivo.value.trim())
  devolvendo.value = false
  motivo.value = ''
}

const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:opacity-50'
const botaoPrincipal =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="analise-titulo" data-testid="analise-financeira">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="analise-titulo" class="m-0 text-[length:var(--fs-body)] font-bold">Análise do financeiro</h2>
      <GestaoAnaliseSelo :status="props.analise.status" />
    </div>

    <p v-if="analise.status === 'rascunho'" class="m-0 text-[var(--ink-soft)]">
      Preencha o valor e a comissão e envie para análise. O que você preenche só vale depois de aprovado pelo jurídico/financeiro.
    </p>
    <p v-else-if="analise.status === 'em-analise'" class="m-0 text-[var(--ink-soft)]">
      Enviado por {{ analise.enviadoPor }} em {{ analise.enviadoEm }}. Enquanto estiver em análise, o financeiro fica só para consulta.
    </p>
    <p v-else-if="analise.status === 'aprovado'" class="m-0 text-[var(--ink-soft)]">Aprovado por {{ analise.decididoPor }} em {{ analise.decididoEm }}.</p>
    <p v-else class="m-0 rounded-[10px] bg-[#fee2e2] px-3 py-2 font-semibold text-[#7f1d1d]" role="note" data-testid="analise-motivo">
      Devolvido por {{ analise.decididoPor }} em {{ analise.decididoEm }}: {{ analise.motivo }}
    </p>

    <div class="flex flex-wrap gap-2">
      <button v-if="props.podeEnviar && analise.status !== 'em-analise' && analise.status !== 'aprovado'" type="button" :class="botaoPrincipal" :disabled="ocupado" data-testid="analise-enviar" @click="emit('enviar')">
        {{ analise.status === 'devolvido' ? 'Corrigido: enviar de novo' : 'Enviar para análise' }}
      </button>
      <template v-if="props.podeAnalisar && analise.status === 'em-analise' && !devolvendo">
        <button type="button" :class="botaoPrincipal" :disabled="ocupado" data-testid="analise-aprovar" @click="emit('aprovar')">Aprovar</button>
        <button type="button" :class="botao" :disabled="ocupado" data-testid="analise-devolver" @click="devolvendo = true">Devolver…</button>
      </template>
    </div>

    <form v-if="devolvendo" class="flex flex-col gap-2" novalidate @submit.prevent="confirmarDevolucao">
      <label class="flex flex-col gap-1 font-semibold">
        O que precisa ser corrigido?
        <textarea v-model="motivo" :maxlength="MOTIVO_MAX" rows="3" class="rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] p-3 font-normal" :aria-invalid="!!erro" data-testid="analise-motivo-campo" />
      </label>
      <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)]">{{ erro }}</p>
      <div class="flex gap-2">
        <button type="submit" :class="botaoPrincipal" :disabled="ocupado" data-testid="analise-devolver-confirmar">Devolver ao corretor</button>
        <button type="button" :class="botao" @click="devolvendo = false">Cancelar</button>
      </div>
    </form>
  </section>
</template>
