<script setup lang="ts">
import type { PortalDocument } from '~~/shared/models/portal'

/**
 * Um documento publicado, com o botão de baixar.
 *
 * O download fica com a página (que conhece o endpoint e trata o erro); aqui só
 * se avisa o clique. O ícone muda por tipo de arquivo porque, numa lista de
 * "Boleto 03/2026, Boleto 04/2026…", ele é o que o olho usa para achar o PDF
 * certo antes de ler o título.
 */
const props = defineProps<{ doc: PortalDocument; baixando?: boolean }>()
defineEmits<{ baixar: [] }>()

const detalhe = computed(() => {
  const partes: string[] = []
  const comp = competenciaCurta(props.doc.competence)
  if (comp) partes.push(`Referência ${comp}`)
  if (props.doc.dueOn) partes.push(`vence ${dataBR(props.doc.dueOn)}`)
  if (props.doc.amount !== null) partes.push(dinheiroBR(props.doc.amount))
  if (props.doc.sizeBytes) partes.push(tamanho(props.doc.sizeBytes))
  return partes.join(' · ')
})

function tamanho(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const ehImagem = computed(() => (props.doc.mime || '').startsWith('image/'))
</script>

<template>
  <li class="dc">
    <span class="dc-ic" :class="{ img: ehImagem }" aria-hidden="true">{{ ehImagem ? 'IMG' : 'PDF' }}</span>
    <div class="dc-info">
      <b>{{ doc.title }}</b>
      <small v-if="detalhe">{{ detalhe }}</small>
    </div>
    <button type="button" class="dc-btn" :disabled="baixando" :aria-label="`Baixar ${doc.title}`" @click="$emit('baixar')">
      <AppIcon name="download" />
      <span>{{ baixando ? 'Abrindo…' : 'Baixar' }}</span>
    </button>
  </li>
</template>

<style scoped>
.dc {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.dc:last-child {
  border-bottom: 0;
}
.dc-ic {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 46px;
  border-radius: 6px 12px 6px 6px;
  background: var(--ink);
  color: var(--ipe);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.dc-ic.img {
  background: var(--ipe-soft);
  color: #6b4e00;
}
.dc-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.dc-info b {
  font-size: 15px;
  overflow-wrap: anywhere;
}
.dc-info small {
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.dc-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}
.dc-btn:hover:not(:disabled) {
  background: var(--ink-2);
}
.dc-btn:focus-visible {
  outline: 2px solid var(--ipe);
  outline-offset: 2px;
}
.dc-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
@media (max-width: 420px) {
  .dc {
    padding: 12px;
    gap: 12px;
  }
  .dc-btn span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .dc-btn {
    width: 44px;
    height: 44px;
    padding: 0;
    justify-content: center;
  }
}
</style>
