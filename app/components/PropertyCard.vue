<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'
import { temQuartos } from '~~/shared/models/property'
import { propertyPath } from '~~/shared/utils/property-url'
import { formatArea, formatPropertyCode } from '~~/shared/utils/property-specs'

const props = withDefaults(defineProps<{ property: PropertyCard; index?: number }>(), { index: 99 })

const { whatsappLink } = useContact()

/**
 * Bairro e cidade só entram quando têm conteúdo de verdade.
 *
 * `neighborhood` é `""` em produção (não null), então o `v-if` por truthiness
 * do valor cru deixava passar: a linha renderizava o alfinete sozinho, sem
 * texto nenhum, e o `alt` da foto virava "Terreno em ".
 */
const bairro = computed(() => (props.property.neighborhood || '').trim())
const cidade = computed(() => (props.property.city || '').trim())
const local = computed(() => [bairro.value, cidade.value].filter(Boolean).join(', '))

const tipoLabel = computed(() => PROPERTY_TYPE_LABELS[props.property.type])

/**
 * A medida do título segue `temQuartos`, igual ao slug da URL e ao título de
 * SEO. Antes seguia `bedrooms ?`: uma casa cadastrada com 0 quartos (existe em
 * produção, com 3 suítes) anunciava "Casa · 300 m²" no título e mostrava cama e
 * banheiro na ficha logo abaixo.
 */
const medida = computed(() => {
  const p = props.property
  if (temQuartos(p.type)) {
    if (p.bedrooms > 0) return `${p.bedrooms} ${p.bedrooms === 1 ? 'quarto' : 'quartos'}`
  }
  return p.area > 0 ? `${formatArea(p.area)} m²` : ''
})

const titulo = computed(() => [tipoLabel.value, medida.value].filter(Boolean).join(' · '))

const codigo = computed(() => formatPropertyCode(props.property.code))

const isRent = computed(() => props.property.purpose === 'aluguel')
const detailPath = computed(() => propertyPath(props.property))
</script>

<template>
  <article class="prop">
    <div class="ph">
      <PropertyCardCarousel
        :images="property.images"
        :index="index"
        :to="detailPath"
        :alt="local ? `${tipoLabel} em ${local}` : tipoLabel"
      />
      <div class="badges">
        <span class="badge" :class="{ rent: isRent }">{{ isRent ? 'Aluguel' : 'Venda' }}</span>
        <span v-if="property.highStandard" class="badge high">Alto padrão</span>
      </div>
      <span class="code">{{ codigo }}</span>
    </div>

    <div class="body">
      <div class="price">
        {{ formatBRL(property.price) }}<span v-if="isRent"> /mês</span>
      </div>
      <NuxtLink class="ttl" :to="detailPath">{{ titulo }}</NuxtLink>
      <div v-if="local" class="loc">
        <AppIcon name="pin" />{{ local }}
      </div>

      <PropertySpecs :property="property" variant="card" />

      <div class="actions">
        <!--
          Afordância visual, não link. Quem abre o detalhe é o título, cujo
          `::after` cobre o card inteiro — clicar aqui cai nele.

          Antes isto era um segundo NuxtLink para o MESMO destino do título:
          duas paradas de foco por card fazendo a mesma coisa, 30 numa página
          de 10 imóveis. `aria-hidden` porque o título já anuncia o destino;
          repetir vira ruído para quem usa leitor de tela.
        -->
        <span class="btn-detail" aria-hidden="true">Ver detalhes</span>
        <a class="btn-wa" :href="whatsappLink(property)" target="_blank" rel="noopener">
          <AppIcon name="wa" /> WhatsApp
        </a>
      </div>
    </div>
  </article>
</template>
