<script setup lang="ts">
import { ACEITA_ARQUIVO, CATEGORIAS } from '../../domain/documentos'
import type { CategoriaDocumento } from '../../domain/types'

defineProps<{
  /** Processos entre os quais escolher (já filtrados por visibilidade). */
  processos: { id: string; rotulo: string }[]
  /** Erro devolvido por `enviarDocumento`, mostrado como veio. */
  erro: string
}>()

const emit = defineEmits<{
  enviar: [dados: { arquivo: File | null; categoria: CategoriaDocumento; processoId: string }]
}>()

const dialogo = ref<HTMLDialogElement | null>(null)
const arquivo = ref<File | null>(null)
const categoria = ref<CategoriaDocumento>('pessoas')
const processoId = ref('')
const entrada = ref<HTMLInputElement | null>(null)

const CATEGORIAS_ESCOLHA = CATEGORIAS.filter((c) => c.chave !== 'todas') as { chave: CategoriaDocumento; rotulo: string }[]

/**
 * `<dialog>` nativo com `showModal()`: foco preso, Esc e backdrop vêm do
 * navegador. Modal feito à mão sem focus trap seria pior que não ter modal.
 * `inicial` pré-seleciona o processo quando a tela veio de `?processo=`.
 */
function abrir(inicial = '') {
  arquivo.value = null
  categoria.value = 'pessoas'
  processoId.value = inicial
  dialogo.value?.showModal()
}

function fechar() {
  dialogo.value?.close()
}

function escolheu(e: Event) {
  arquivo.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

defineExpose({ abrir, fechar })

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
const rotulo = 'mb-1 block text-[length:var(--fs-label)] font-bold'
</script>

<template>
  <dialog
    ref="dialogo"
    class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-[var(--ink)] backdrop:bg-black/50"
    aria-labelledby="enviar-doc-titulo"
    data-testid="modal-enviar"
  >
    <form class="flex flex-col gap-4" @submit.prevent="emit('enviar', { arquivo, categoria, processoId })">
      <h2 id="enviar-doc-titulo" class="text-[length:var(--fs-title-sm)] font-extrabold">Enviar documento</h2>

      <div>
        <label for="enviar-doc-arquivo" :class="rotulo">Arquivo</label>
        <input
          id="enviar-doc-arquivo"
          ref="entrada"
          type="file"
          :accept="ACEITA_ARQUIVO"
          :class="[campo, 'py-2']"
          aria-describedby="enviar-doc-ajuda"
          @change="escolheu"
        />
        <p id="enviar-doc-ajuda" class="mt-1 text-[length:var(--fs-caption)] text-[var(--ink-soft)]">
          PDF, JPG, PNG ou WEBP, até 20 MB.
        </p>
      </div>

      <div>
        <label for="enviar-doc-categoria" :class="rotulo">Categoria</label>
        <select id="enviar-doc-categoria" v-model="categoria" :class="campo">
          <option v-for="c in CATEGORIAS_ESCOLHA" :key="c.chave" :value="c.chave">{{ c.rotulo }}</option>
        </select>
      </div>

      <div>
        <label for="enviar-doc-processo" :class="rotulo">Processo</label>
        <select id="enviar-doc-processo" v-model="processoId" :class="campo">
          <option value="" disabled>Escolha o processo…</option>
          <option v-for="p in processos" :key="p.id" :value="p.id">{{ p.rotulo }}</option>
        </select>
      </div>

      <p v-if="erro" role="alert" class="rounded-lg bg-[#fee2e2] px-3 py-2 font-semibold text-[#7f1d1d]">
        {{ erro }}
      </p>

      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]"
          @click="fechar"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
        >
          Enviar
        </button>
      </div>
    </form>
  </dialog>
</template>
