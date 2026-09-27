<script setup lang="ts">
import type { PropertyCard, PropertyPurpose } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS, temQuartos } from '~~/shared/models/property'
import { propertyPath } from '~~/shared/utils/property-url'
import { formatArea } from '~~/shared/utils/property-specs'
import { cardQualifier, CARD_QUALIFIER_LABELS } from '~~/shared/utils/property-badges'

/**
 * Vitrine dos imóveis marcados como destaque, no topo da home.
 *
 * Até aqui "Destaque" era um checkbox que quase não mudava nada no site (só a
 * ordem em "Relevância"), e o acervo mostra o efeito: um cliente nunca marcou,
 * outro marcou 17 de 20. Esta seção é o lugar onde o destaque passa a existir.
 *
 * Layout diferente da grade de propósito: se fosse o mesmo card, na mesma
 * grade, logo acima da grade, a pessoa não saberia dizer onde acaba a seleção
 * e onde começa o catálogo.
 *
 * Segue o Comprar/Alugar da busca logo acima, em vez de ter abas próprias
 * (como a Daterra, concorrente em Três Lagoas, faz): seriam dois controles de
 * finalidade na mesma tela, e a aba de aluguel ficaria quase sempre vazia —
 * a OLMI tem 3 imóveis para alugar contra 59 à venda.
 */
const props = withDefaults(
  defineProps<{ properties: PropertyCard[]; purpose: PropertyPurpose; limite?: number }>(),
  { limite: 6 },
)

const titulo = computed(() => (props.purpose === 'aluguel' ? 'Destaques para alugar' : 'Destaques à venda'))

/**
 * Seção só com dois ou mais. Um card sozinho numa faixa horizontal parece
 * sobra de layout, não seleção, e o imóvel já está na grade logo abaixo.
 */
const MINIMO = 2

const itens = computed(() =>
  props.properties.filter((p) => p.featured && p.purpose === props.purpose).slice(0, props.limite),
)
const visivel = computed(() => itens.value.length >= MINIMO)

function tituloCard(p: PropertyCard) {
  const tipo = PROPERTY_TYPE_LABELS[p.type]
  if (temQuartos(p.type) && p.bedrooms > 0) return `${tipo} · ${p.bedrooms} ${p.bedrooms === 1 ? 'quarto' : 'quartos'}`
  return p.area > 0 ? `${tipo} · ${formatArea(p.area)} m²` : tipo
}

function local(p: PropertyCard) {
  return [(p.neighborhood || '').trim(), (p.city || '').trim()].filter(Boolean).join(', ')
}

// Sem "Venda"/"Aluguel": o título da faixa já diz, e repetir em todo card
// seria o selo que não informa nada.
function rotulo(p: PropertyCard) {
  const q = cardQualifier(p)
  return q ? CARD_QUALIFIER_LABELS[q] : null
}

function foto(p: PropertyCard) {
  const capa = p.images[0]
  return capa ? capa.urlSm || capa.url : null
}
</script>

<template>
  <section v-if="visivel" class="destaques" aria-labelledby="destaques-titulo">
    <h2 id="destaques-titulo" class="destaques-t">{{ titulo }}</h2>
    <ScrollCarousel :label="titulo">
      <!--
        Uma foto só, sem o carrossel de fotos do card da grade: carrossel dentro
        de carrossel faz o mesmo arraste significar duas coisas (trocar de foto
        ou trocar de imóvel), e no celular sempre acerta a errada.
      -->
      <NuxtLink
        v-for="p in itens"
        :key="p.id"
        class="dq"
        :to="propertyPath(p)"
      >
        <div class="dq-ph">
          <img
            v-if="foto(p)"
            :src="foto(p)!"
            :alt="local(p) ? `${PROPERTY_TYPE_LABELS[p.type]} em ${local(p)}` : PROPERTY_TYPE_LABELS[p.type]"
            loading="lazy"
            decoding="async"
            width="640"
            height="800"
          />
          <AppIcon v-else name="home" />
        </div>
        <div class="dq-body">
          <span v-if="rotulo(p)" class="dq-tag">{{ rotulo(p) }}</span>
          <span class="dq-price">
            {{ formatBRL(p.price) }}<small v-if="p.purpose === 'aluguel'"> /mês</small>
          </span>
          <span class="dq-ttl">{{ tituloCard(p) }}</span>
          <span v-if="local(p)" class="dq-loc"><AppIcon name="pin" />{{ local(p) }}</span>
        </div>
      </NuxtLink>
    </ScrollCarousel>
  </section>
</template>

<style scoped>
.destaques {
  max-width: 1140px;
  margin: 0 auto;
  padding: 36px 18px 0;
}
.destaques-t {
  font-size: var(--fs-title);
  color: var(--ink);
  font-weight: 600;
  margin-bottom: 14px;
}

/* 82% da largura no celular: o pedaço do próximo card à direita é o que diz
   "tem mais para o lado" sem precisar de legenda. */
.dq {
  position: relative;
  display: block;
  width: min(82vw, 340px);
  border-radius: var(--card-radius);
  overflow: hidden;
  color: #fff;
  text-decoration: none;
  background: var(--ink);
  box-shadow: var(--card-shadow);
  isolation: isolate;
}
@media (min-width: 820px) {
  /* Três por tela dentro dos 1140px da página, com o quarto espiando. */
  .dq {
    width: 336px;
  }
}
.dq:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 3px;
}

/* 4:5, mais alta que a foto da grade (16:11): a diferença de formato é o
   primeiro sinal de que esta faixa não é a lista. */
.dq-ph {
  aspect-ratio: 4 / 5;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #dfe3de, #c9d3ce);
}
.dq-ph img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
}
.dq-ph :deep(svg) {
  width: 40px;
  height: 40px;
  color: var(--ink-soft);
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .dq:hover .dq-ph img {
    transform: scale(1.04);
  }
}

/* Texto sobre a foto só com véu: foto clara (fachada branca, céu) sem ele
   deixa o preço branco ilegível. O véu cobre só a metade de baixo, onde o
   texto está, e a foto continua limpa em cima. */
.dq-body {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 64px 18px 18px;
  background: linear-gradient(to top, rgba(12, 14, 16, 0.86) 0%, rgba(12, 14, 16, 0.6) 55%, transparent 100%);
}
.dq-tag {
  font-size: var(--fs-caption);
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.92;
}
.dq-price {
  font-family: var(--font-display);
  font-size: var(--fs-title-lg);
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.dq-price small {
  font-size: var(--fs-ui);
  font-weight: 500;
}
.dq-ttl {
  font-size: var(--fs-body);
  font-weight: 600;
}
.dq-loc {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-ui);
  opacity: 0.9;
}
.dq-loc :deep(svg) {
  width: 15px;
  height: 15px;
  flex: none;
}

/* Temas: o card já herda raio e sombra pelos tokens; aqui só o que o token não
   alcança. */
:global([data-tema="alto_padrao"] .dq-tag) {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 11px;
}
:global([data-tema="alto_padrao"] .dq-price) {
  font-weight: 500;
}
:global([data-tema="alto_padrao"] .dq:hover .dq-ph img) {
  transform: none;
}
:global([data-tema="moderno"] .dq-price) {
  font-weight: 800;
  letter-spacing: -0.03em;
}
</style>
