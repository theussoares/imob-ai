<script setup lang="ts">
import type { FotoImovel } from '../../domain/imoveis'

const props = defineProps<{ fotos: FotoImovel[]; max: number; erro: string; ocupado: boolean }>()
const emit = defineEmits<{
  adicionar: [arquivos: File[]]
  capa: [id: string]
  mover: [id: string, direcao: 'cima' | 'baixo']
  remover: [id: string]
}>()

function escolher(e: Event) {
  const input = e.target as HTMLInputElement
  const arquivos = [...(input.files ?? [])]
  input.value = ''
  if (arquivos.length) emit('adicionar', arquivos)
}

const botao =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-label)] font-semibold hover:bg-[var(--paper-2)] disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <section class="[display:grid] gap-3" aria-labelledby="imovel-fotos-titulo">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="imovel-fotos-titulo" class="m-0 text-[length:var(--fs-body)] font-bold">Fotos ({{ props.fotos.length }}/{{ props.max }})</h2>
      <label :class="botao" class="inline-flex items-center" :aria-disabled="props.ocupado || props.fotos.length >= props.max">
        {{ props.ocupado ? 'Enviando…' : 'Adicionar fotos' }}
        <input
          type="file"
          accept="image/*"
          multiple
          class="sr-only"
          :disabled="props.ocupado || props.fotos.length >= props.max"
          data-testid="imovel-foto-input"
          @change="escolher"
        />
      </label>
    </div>
    <p v-if="props.erro" role="alert" class="m-0 font-semibold text-[var(--danger)]" data-testid="imovel-foto-erro">{{ props.erro }}</p>
    <p v-if="!props.fotos.length" class="m-0 text-[var(--ink-soft)]">Sem fotos. A primeira que você enviar vira a capa do anúncio.</p>
    <ul v-else class="m-0 list-none [display:grid] gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="(f, i) in props.fotos" :key="f.id" class="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)]" data-testid="imovel-foto">
        <img :src="f.urlSm ?? f.url" :alt="f.alt ?? `Foto ${i + 1} do imóvel`" class="aspect-[4/3] w-full object-cover" />
        <div class="flex flex-wrap items-center gap-2 p-2">
          <span v-if="f.isCover" class="rounded-full bg-[#d1fae5] px-2.5 py-1 text-[length:var(--fs-caption)] font-bold text-[#064e3b]" data-testid="imovel-foto-capa">Capa</span>
          <button v-else type="button" :class="botao" @click="emit('capa', f.id)">Tornar capa</button>
          <button type="button" :class="botao" :disabled="i === 0" aria-label="Mover para antes" @click="emit('mover', f.id, 'cima')">←</button>
          <button type="button" :class="botao" :disabled="i === props.fotos.length - 1" aria-label="Mover para depois" @click="emit('mover', f.id, 'baixo')">→</button>
          <button type="button" :class="botao" data-testid="imovel-foto-remover" @click="emit('remover', f.id)">Remover</button>
        </div>
      </li>
    </ul>
  </section>
</template>
