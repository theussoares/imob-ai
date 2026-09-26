<script setup lang="ts">
import { ABOUT_BLOCK_TYPE_LABELS, ABOUT_BLOCK_TYPE_PURPOSE, ABOUT_BLOCK_TYPES_OFERECIDOS } from "~~/shared/models/about-page";
import type { AboutBlockType } from "~~/shared/models/about-page";

/**
 * Paleta de blocos do "Quem somos": miniatura + para que serve, no lugar do
 * `<select>` com dez nomes em texto. Reconhecer é mais barato que lembrar — a
 * pessoa não sabia como "Texto + imagem lado a lado" ficava até adicionar,
 * salvar e abrir o site.
 *
 * As miniaturas são esquemas, não prints: ficam leves, seguem a cor do painel
 * (`currentColor`) e não envelhecem quando o tema do site muda.
 */
defineProps<{ titulo: string }>();
const emit = defineEmits<{ pick: [type: AboutBlockType]; cancel: [] }>();

const tituloId = useId();
</script>

<template>
  <div class="pal" role="group" :aria-labelledby="tituloId">
    <div class="pal-head">
      <span :id="tituloId" class="pal-title">{{ titulo }}</span>
      <button type="button" class="admin-btn ghost sm" @click="emit('cancel')">Cancelar</button>
    </div>
    <div class="pal-grid">
      <button v-for="t in ABOUT_BLOCK_TYPES_OFERECIDOS" :key="t" type="button" class="pal-item" @click="emit('pick', t)">
        <svg class="pal-thumb" viewBox="0 0 64 40" aria-hidden="true">
          <template v-if="t === 'heading'">
            <rect x="6" y="14" width="40" height="7" rx="2" />
            <rect x="6" y="25" width="22" height="3" rx="1.5" class="soft" />
          </template>
          <template v-else-if="t === 'text'">
            <rect v-for="n in 4" :key="n" x="6" :y="6 + n * 6" :width="n === 4 ? 32 : 52" height="3" rx="1.5" class="soft" />
          </template>
          <template v-else-if="t === 'image'">
            <rect x="6" y="5" width="52" height="30" rx="3" class="soft" />
            <path d="M12 31l12-12 9 9 6-5 13 8z" />
          </template>
          <template v-else-if="t === 'stats'">
            <template v-for="n in 3" :key="n">
              <rect :x="4 + (n - 1) * 20" y="11" width="16" height="9" rx="2" />
              <rect :x="4 + (n - 1) * 20" y="24" width="16" height="3" rx="1.5" class="soft" />
            </template>
          </template>
          <template v-else-if="t === 'values'">
            <template v-for="n in 4" :key="n">
              <circle :cx="n % 2 ? 8 : 38" :cy="n <= 2 ? 12 : 27" r="3" />
              <rect :x="n % 2 ? 14 : 44" :y="n <= 2 ? 10 : 25" width="14" height="4" rx="2" class="soft" />
            </template>
          </template>
          <template v-else-if="t === 'banner'">
            <rect x="4" y="4" width="56" height="32" rx="3" />
            <rect x="10" y="20" width="30" height="4" rx="2" class="on-dark" />
            <rect x="10" y="27" width="14" height="5" rx="2" class="on-dark soft-dark" />
          </template>
          <template v-else-if="t === 'split'">
            <rect x="6" y="6" width="24" height="28" rx="3" class="soft" />
            <rect x="35" y="9" width="20" height="4" rx="2" />
            <rect v-for="n in 3" :key="n" x="35" :y="13 + n * 6" width="23" height="3" rx="1.5" class="soft" />
          </template>
          <template v-else-if="t === 'gallery'">
            <rect v-for="n in 3" :key="n" :x="4 + (n - 1) * 20" y="10" width="16" height="20" rx="2" class="soft" />
          </template>
          <template v-else-if="t === 'testimonials'">
            <template v-for="n in 2" :key="n">
              <text :x="4 + (n - 1) * 30" y="18" class="quote">“</text>
              <rect :x="6 + (n - 1) * 30" y="18" width="24" height="3" rx="1.5" class="soft" />
              <rect :x="6 + (n - 1) * 30" y="24" width="18" height="3" rx="1.5" class="soft" />
              <rect :x="6 + (n - 1) * 30" y="31" width="10" height="3" rx="1.5" />
            </template>
          </template>
          <template v-else-if="t === 'logos'">
            <rect v-for="n in 4" :key="n" :x="4 + (n - 1) * 15" y="15" width="11" height="10" rx="2" class="soft" />
          </template>
          <template v-else-if="t === 'team'">
            <template v-for="n in 3" :key="n">
              <circle :cx="14 + (n - 1) * 18" cy="16" r="6" class="soft" />
              <rect :x="8 + (n - 1) * 18" y="26" width="12" height="3" rx="1.5" />
            </template>
          </template>
        </svg>
        <span class="pal-text">
          <b>{{ ABOUT_BLOCK_TYPE_LABELS[t] }}</b>
          <small>{{ ABOUT_BLOCK_TYPE_PURPOSE[t] }}</small>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pal {
  border: 1.5px dashed var(--line-2);
  border-radius: var(--r-md);
  padding: 12px;
  background: var(--surface);
}
.pal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.pal-title {
  font-size: var(--fs-label);
  font-weight: 700;
}
.pal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.pal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 8px 10px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
}
.pal-item:hover,
.pal-item:focus-visible {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.pal-thumb {
  flex: none;
  width: 64px;
  height: 40px;
  color: var(--brand);
  fill: currentColor;
}
.pal-thumb .soft {
  opacity: 0.3;
}
.pal-thumb .on-dark {
  fill: var(--paper);
}
.pal-thumb .soft-dark {
  opacity: 0.7;
}
.pal-thumb .quote {
  font-size: 22px;
  font-family: var(--font-display);
}
.pal-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pal-text b {
  font-size: var(--fs-label);
}
.pal-text small {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  line-height: 1.35;
}
</style>
