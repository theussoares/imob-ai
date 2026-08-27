<script setup lang="ts">
import type { Property } from '~~/shared/models/property'

/**
 * Barra de contato fixa no rodapé, no celular.
 *
 * ## O problema
 *
 * No desktop o cartão de contato é `position: sticky` numa coluna lateral —
 * preço e WhatsApp acompanham a leitura o tempo todo. No celular não existe
 * coluna lateral: o grid vira uma coluna só e aquele mesmo cartão cai DEPOIS da
 * galeria, da ficha, da descrição e dos diferenciais. Num imóvel com descrição
 * de tamanho normal, são quatro a seis telas de rolagem entre a pessoa decidir
 * que gostou e encontrar como falar com alguém.
 *
 * O momento da decisão é durante a leitura, não no fim dela.
 *
 * ## Por que ela some quando o cartão aparece
 *
 * Quando a pessoa finalmente rola até o cartão de contato, ela vê o botão de
 * WhatsApp do cartão E a barra flutuante com o mesmo botão logo abaixo. Dois
 * CTAs idênticos empilhados fazem duvidar se são a mesma coisa. O observador
 * abaixo esconde a barra exatamente aí, e ela volta quando o cartão sai de
 * vista.
 */
const props = defineProps<{
  property: Property
  /**
   * O cartão de contato da página. Recebido como referência, e não procurado no
   * documento por seletor: um componente que faz `querySelector` no DOM do pai
   * passa a depender de marcação que não é dele, e o dia em que aquela classe
   * mudar isto quebra em silêncio. Aqui a dependência é explícita e o
   * TypeScript cobra.
   */
  contactCard?: HTMLElement | null
}>()

const { whatsappLink } = useContact()

const isRent = computed(() => props.property.purpose === 'aluguel')

/**
 * Começa `false` de propósito: enquanto não se sabe se o cartão está à vista,
 * a barra APARECE. O padrão seguro é oferecer o contato, não escondê-lo — se o
 * observador não puder rodar por qualquer motivo, o pior caso é a barra ficar
 * visível o tempo todo, que é exatamente o comportamento que ela tinha antes de
 * ganhar essa sutileza.
 *
 * `useIntersectionObserver` se desfaz sozinho ao desmontar (escopo do VueUse) e
 * reobserva quando a referência deixa de ser nula, então não há nada a limpar
 * nem a esperar aqui.
 */
const cardVisible = ref(false)
useIntersectionObserver(
  () => props.contactCard ?? null,
  ([entry]) => {
    cardVisible.value = !!entry?.isIntersecting
  },
)
</script>

<template>
  <div class="sticky-cta" :class="{ hide: cardVisible }">
    <div class="sc-price">
      <span class="sc-label">{{ isRent ? 'Aluguel' : 'Valor' }}</span>
      <strong>{{ formatBRL(property.price) }}<span v-if="isRent">/mês</span></strong>
    </div>
    <a class="btn-wa sc-btn" :href="whatsappLink(property)" target="_blank" rel="noopener">
      <AppIcon name="wa" /> Tenho interesse
    </a>
  </div>
</template>

<style scoped>
.sticky-cta {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* Abaixo da galeria em tela cheia (z-index 100), acima de tudo o mais. */
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  /* Respeita a barra de gestos do iPhone: sem isto o botão fica embaixo dela e
     o toque abre o multitarefa em vez do WhatsApp. */
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  background: var(--paper);
  border-top: 1px solid var(--line-2);
  box-shadow: 0 -6px 24px rgba(20, 22, 26, 0.1);
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}
.sticky-cta.hide {
  transform: translateY(100%);
  opacity: 0;
  pointer-events: none;
}
.sc-price {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  /* min-width 0 + o nowrap do botão: preço longo encolhe aqui em vez de
     espremer o CTA. */
  min-width: 0;
}
.sc-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.sc-price strong {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 19px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}
.sc-price strong span {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-soft);
}
.sc-btn {
  margin-left: auto;
  flex: none;
  white-space: nowrap;
  padding: 12px 18px;
  font-size: 15px;
}

/* A coluna lateral vira sticky de verdade a partir daqui — a barra não tem
   mais função. Mesmo ponto de corte do .detail-grid, para não haver faixa de
   largura com os dois ou com nenhum. */
@media (min-width: 900px) {
  .sticky-cta {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sticky-cta {
    transition: none;
  }
}
</style>
