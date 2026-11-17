<script setup lang="ts">
import { ACEITA_ARQUIVO, formatarTamanho, ROTULO_ESTADO } from '../../domain/documentos'
import { documentoDoRequisito, type Requisito } from '../../domain/requisitos'
import type { Documento } from '../../domain/types'
import type { ArquivoGestao } from '../services/GestaoRepository'

/**
 * Lista de itens de documento de uma etapa: cada linha mostra o estado, o arquivo
 * enviado e as ações («Enviar arquivo», «Trocar arquivo», «Conferir»).
 *
 * É burra de propósito: não conhece store nem permissão. Quem decide se pode
 * enviar ou conferir é a tela do processo, que também valida o arquivo — assim a
 * mesma regra (`enviarDocumento`/`validarArquivo`) vale aqui e na tela de documentos.
 */
const props = defineProps<{
  requisitos: Requisito[]
  /** documentos ativos do processo (sem lixeira) */
  documentos: Documento[]
  processoId: string
  podeEnviar: boolean
  podeConferir: boolean
  /** só na demonstração: botão que anexa um arquivo de exemplo sem abrir o seletor */
  demo?: boolean
}>()

const emit = defineEmits<{
  enviar: [requisito: Requisito, arquivo: ArquivoGestao]
  trocar: [doc: Documento, arquivo: ArquivoGestao]
  conferir: [doc: Documento]
}>()

const linhas = computed(() =>
  props.requisitos.map((r) => ({ r, doc: documentoDoRequisito(props.documentos, props.processoId, r.chave) })),
)

function escolheu(e: Event, r: Requisito, doc: Documento | undefined) {
  const input = e.target as HTMLInputElement
  const arq = input.files?.[0]
  // Limpa o valor: escolher o MESMO arquivo de novo não dispararia `change`.
  input.value = ''
  if (!arq) return
  // `file` vai junto: em `http` é ele que sobe para o Storage; em `mock` só nome e tamanho contam.
  const dados: ArquivoGestao = { name: arq.name, size: arq.size, file: arq }
  if (doc) emit('trocar', doc, dados)
  else emit('enviar', r, dados)
}

// Arquivo de exemplo (demonstração): 1,2 MB fictício, sem abrir o seletor do sistema.
function exemplo(r: Requisito, doc: Documento | undefined) {
  const dados = { name: `${r.nome}.pdf`, size: 1_200_000 }
  if (doc) emit('trocar', doc, dados)
  else emit('enviar', r, dados)
}

// Estado com texto E cor: cor sozinha não distingue (daltonismo).
const TOM = {
  pendente: 'bg-[#fef3c7] text-[#78350f]',
  enviado: 'bg-[#dbeafe] text-[#1e3a8a]',
  conferido: 'bg-[#d1fae5] text-[#064e3b]',
} as const

const botao =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] font-bold text-[var(--ink)] hover:bg-[var(--brand-ghost)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]'
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-2 p-0" data-testid="requisitos">
    <li
      v-for="{ r, doc } in linhas"
      :key="r.chave"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
      :data-testid="`requisito-${r.chave}`"
    >
      <span
        class="inline-flex min-h-7 items-center rounded-full px-2.5 text-[length:var(--fs-caption)] font-bold"
        :class="TOM[doc?.estado ?? 'pendente']"
        data-testid="requisito-estado"
      >
        {{ doc ? ROTULO_ESTADO[doc.estado] : 'Pendente' }}
      </span>

      <div class="min-w-0 flex-1">
        <strong class="block">{{ r.nome }}</strong>
        <small class="text-[var(--ink-soft)]" data-testid="requisito-arquivo">
          <template v-if="doc">{{ doc.nome }} · {{ formatarTamanho(doc.tamanho) }}<template v-if="doc.versoes > 1"> · versão {{ doc.versoes }}</template></template>
          <template v-else>Sem arquivo</template>
        </small>
      </div>

      <div class="flex flex-wrap gap-2">
        <label v-if="podeEnviar" :class="botao" :data-testid="doc ? 'requisito-trocar' : 'requisito-enviar'">
          {{ doc ? 'Trocar arquivo' : 'Enviar arquivo' }}
          <span class="sr-only"> de {{ r.nome }}</span>
          <input type="file" class="sr-only" :accept="ACEITA_ARQUIVO" @change="escolheu($event, r, doc)" />
        </label>
        <button
          v-if="podeEnviar && demo"
          type="button"
          :class="botao"
          data-testid="requisito-exemplo"
          @click="exemplo(r, doc)"
        >
          Anexar exemplo<span class="sr-only"> em {{ r.nome }}</span>
        </button>
        <button
          v-if="podeConferir && doc?.estado === 'enviado'"
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-3 text-[length:var(--fs-ui)] font-bold text-white hover:opacity-90"
          data-testid="requisito-conferir"
          @click="emit('conferir', doc)"
        >
          Conferir<span class="sr-only"> {{ r.nome }}</span>
        </button>
      </div>
    </li>
  </ul>
</template>
