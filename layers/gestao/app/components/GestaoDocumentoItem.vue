<script setup lang="ts">
import type { Documento } from '../../domain/types'
import { extensao, formatarTamanho, ROTULO_CATEGORIA, ROTULO_ESTADO, tipoArquivo } from '../../domain/documentos'
import { ACEITA_ARQUIVO } from '../../domain/documentos'

const props = defineProps<{
  doc: Documento
  /** Rótulo «V-… · imóvel» do processo. */
  processo: string
  podeSubstituir: boolean
  podeConferir: boolean
  podeApagar: boolean
  /** Na lixeira o item mostra quem apagou e «Restaurar» no lugar das ações. */
  lixeira?: boolean
}>()

const emit = defineEmits<{
  ver: []
  baixar: []
  substituir: [arquivo: File]
  versoes: []
  conferir: []
  apagar: []
  restaurar: []
}>()

const seletor = ref<HTMLInputElement | null>(null)

function arquivoEscolhido(e: Event) {
  const input = e.target as HTMLInputElement
  const arquivo = input.files?.[0]
  // Limpa o valor: escolher o MESMO arquivo de novo não dispararia `change`.
  input.value = ''
  if (arquivo) emit('substituir', arquivo)
}

// Ícone por tipo; o texto da extensão vai junto porque ícone sozinho não diz
// se é PDF ou JPG a quem não enxerga a cor.
const ICONE: Record<ReturnType<typeof tipoArquivo>, string> = {
  pdf: 'bg-[#fee2e2] text-[#7f1d1d]',
  imagem: 'bg-[#dbeafe] text-[#1e3a8a]',
  outro: 'bg-[#e7e9e6] text-[#2b2f33]',
}

// Estado com texto E cor: cor sozinha não distingue (daltonismo).
const TOM_ESTADO: Record<Documento['estado'], string> = {
  pendente: 'bg-[#fef3c7] text-[#78350f]',
  enviado: 'bg-[#dbeafe] text-[#1e3a8a]',
  conferido: 'bg-[#d1fae5] text-[#064e3b]',
}

const ext = computed(() => extensao(props.doc.nome).toUpperCase() || 'ARQ')

// Mobile: grade 2×N com alvo ≥ 44px (W5); a partir de sm vira uma linha.
const acao =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] font-bold text-[var(--ink)] hover:bg-[var(--brand-ghost)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
</script>

<template>
  <li
    class="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 md:flex-row md:items-center md:justify-between"
    data-testid="documento-item"
    :data-doc-id="doc.id"
  >
    <div class="flex min-w-0 items-start gap-3">
      <span
        class="[display:grid] size-11 flex-none place-items-center rounded-[10px] text-[length:var(--fs-caption)] font-bold"
        :class="ICONE[tipoArquivo(doc.nome)]"
        aria-hidden="true"
      >
        {{ ext }}
      </span>
      <div class="min-w-0">
        <p class="break-words font-bold">{{ doc.nome }}</p>
        <p class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">
          {{ processo }} · {{ ROTULO_CATEGORIA[doc.categoria] }}
        </p>
        <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-label)] text-[var(--ink-soft)]">
          <span
            class="inline-flex min-h-6 items-center rounded-full px-2.5 text-[length:var(--fs-caption)] font-bold"
            :class="TOM_ESTADO[doc.estado]"
            data-testid="estado-documento"
          >
            {{ ROTULO_ESTADO[doc.estado] }}
          </span>
          <span>{{ formatarTamanho(doc.tamanho) }}</span>
          <span>· {{ doc.versoes === 1 ? '1 versão' : `${doc.versoes} versões` }}</span>
          <span>· enviado por {{ doc.enviadoPor }}</span>
        </p>
        <p v-if="lixeira && doc.apagado" class="mt-1 text-[length:var(--fs-label)] font-semibold text-[#7f1d1d]">
          Apagado por {{ doc.apagado.quem }} em {{ doc.apagado.quando }}
        </p>
      </div>
    </div>

    <div v-if="lixeira" class="[display:grid] grid-cols-2 gap-2 md:flex md:flex-none">
      <button type="button" :class="acao" data-testid="restaurar" @click="emit('restaurar')">Restaurar</button>
    </div>
    <div v-else class="[display:grid] grid-cols-2 gap-2 md:flex md:flex-none md:flex-wrap md:justify-end">
      <button type="button" :class="acao" :aria-label="`Ver ${doc.nome}`" @click="emit('ver')">Ver</button>
      <button type="button" :class="acao" :aria-label="`Baixar ${doc.nome}`" @click="emit('baixar')">Baixar</button>
      <template v-if="podeSubstituir">
        <button type="button" :class="acao" :aria-label="`Substituir ${doc.nome}`" @click="seletor?.click()">
          Substituir
        </button>
        <!-- Escondido de verdade (hidden): o botão acima é o alvo acessível. -->
        <input
          ref="seletor"
          type="file"
          hidden
          :accept="ACEITA_ARQUIVO"
          tabindex="-1"
          :aria-label="`Arquivo novo para ${doc.nome}`"
          @change="arquivoEscolhido"
        />
      </template>
      <button type="button" :class="acao" :aria-label="`Versões de ${doc.nome}`" @click="emit('versoes')">
        Versões
      </button>
      <button
        v-if="podeConferir && doc.estado === 'enviado'"
        type="button"
        :class="acao"
        :aria-label="`Conferir ${doc.nome}`"
        @click="emit('conferir')"
      >
        Conferir
      </button>
      <button
        v-if="podeApagar"
        type="button"
        :class="[acao, 'border-[#fca5a5] text-[#7f1d1d] hover:bg-[#fee2e2]']"
        :aria-label="`Apagar ${doc.nome}`"
        data-testid="apagar"
        @click="emit('apagar')"
      >
        Apagar
      </button>
    </div>
  </li>
</template>
