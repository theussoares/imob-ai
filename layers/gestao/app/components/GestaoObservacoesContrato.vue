<script setup lang="ts">
import { LIMITE_ANOTACOES } from '../../domain/acoes-ciclo'
import type { Processo } from '../../domain/types'

const props = defineProps<{
  processo: Processo
  /** false em processo encerrado: o texto fica só para leitura. */
  editavel: boolean
  /** Motivo de não editar, mostrado no lugar do botão. Vazio = não explica. */
  motivo?: string
}>()
const emit = defineEmits<{ salvar: [texto: string] }>()

const salvo = computed(() => props.processo.anotacoes ?? '')
const texto = ref(salvo.value)
// Ressincroniza quando OUTRA gravação muda o processo (outra aba, recarga). Enquanto a pessoa digita
// o processo não muda, então o rascunho não é atropelado.
watch(salvo, (v) => (texto.value = v))

const mudou = computed(() => texto.value.trim() !== salvo.value)
const restante = computed(() => LIMITE_ANOTACOES - texto.value.length)
</script>

<template>
  <section class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="obs-contrato-titulo" data-testid="painel-observacoes">
    <h2 id="obs-contrato-titulo" class="m-0 mb-1 text-[length:var(--fs-title-sm)] font-bold">Observações do contrato</h2>
    <p class="m-0 mb-3 text-[var(--ink-soft)]">
      Anote o que foi combinado entre as partes, como datas e formas de pagamento. Aparece também na lista de contratos.
    </p>

    <form v-if="editavel" class="flex flex-col gap-2" novalidate @submit.prevent="emit('salvar', texto)">
      <label class="flex flex-col gap-1 text-[length:var(--fs-label)] font-bold">
        Observações
        <textarea
          v-model="texto"
          rows="8"
          :maxlength="LIMITE_ANOTACOES"
          placeholder="Ex.: Foi acordado que será pago metade no dia 10/12 e o restante na assinatura da escritura."
          aria-describedby="obs-contrato-restante"
          class="w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 text-[length:var(--fs-body)] font-normal text-[var(--ink)]"
          data-testid="obs-contrato"
        />
      </label>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="submit"
          :disabled="!mudou"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="obs-contrato-salvar"
        >
          Salvar observações
        </button>
        <span id="obs-contrato-restante" class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]" aria-live="polite">
          {{ restante }} caracteres restantes
        </span>
      </div>
    </form>

    <template v-else>
      <p v-if="salvo" class="m-0 whitespace-pre-wrap break-words" data-testid="obs-contrato-leitura">{{ salvo }}</p>
      <p v-else class="m-0 text-[var(--ink-soft)]" data-testid="obs-contrato-vazia">Nenhuma observação registrada.</p>
      <p v-if="motivo" class="m-0 mt-3 text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ motivo }}</p>
    </template>
  </section>
</template>
