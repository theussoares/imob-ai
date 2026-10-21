<script setup lang="ts">
import type { PublicBroker } from '~~/shared/models/broker'

/**
 * Quem captou o imóvel, no topo do cartão de contato.
 *
 * É APRESENTAÇÃO, não canal de contato: não há telefone, WhatsApp nem e-mail do
 * corretor aqui (nem no payload — ver `PublicBroker`). Os botões logo abaixo
 * falam com a imobiliária, e o texto diz isso, para ninguém achar que o botão
 * verde chama a pessoa da foto.
 *
 * Foto com largura/altura fixas (sem salto de layout) e iniciais como reserva:
 * o cadastro não exige foto. Minibio limitada a 3 linhas — um texto de 500
 * caracteres empurraria o botão de WhatsApp para fora da primeira tela do
 * cartão sticky.
 */
const props = defineProps<{ broker: PublicBroker }>()

const iniciais = computed(() =>
  props.broker.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(''),
)
</script>

<template>
  <section class="cap" aria-labelledby="cap-rotulo">
    <div class="cap-foto">
      <img
        v-if="broker.photoUrl"
        :src="supabaseRenderImage(broker.photoUrl, { width: 112, height: 112, quality: 75 })"
        :srcset="supabaseSrcset(broker.photoUrl, [56, 112], 75) || undefined"
        width="56"
        height="56"
        loading="lazy"
        decoding="async"
        :alt="`Foto de ${broker.name}`"
      />
      <span v-else class="cap-iniciais" aria-hidden="true">{{ iniciais }}</span>
    </div>
    <div class="cap-info">
      <p id="cap-rotulo" class="cap-rotulo">Captado por</p>
      <strong class="cap-nome">{{ broker.name }}</strong>
      <span v-if="broker.creci" class="cap-creci">CRECI {{ broker.creci }}</span>
    </div>
    <p v-if="broker.bio" class="cap-bio">{{ broker.bio }}</p>
  </section>
</template>

<style scoped>
.cap {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 4px 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.cap-foto {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--brand-ghost);
  border: 1.5px solid var(--line-2);
  display: grid;
  place-items: center;
}
.cap-foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cap-iniciais {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--brand);
}
.cap-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cap-rotulo {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.cap-nome {
  font-size: var(--fs-body);
  overflow-wrap: anywhere;
}
.cap-creci {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.cap-bio {
  grid-column: 1 / -1;
  margin: 6px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
