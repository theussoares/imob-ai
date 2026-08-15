<script setup lang="ts">
import type { PropertyCard } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = withDefaults(defineProps<{ property: PropertyCard; index?: number }>(), { index: 99 })

const { whatsappLink } = useContact()

const coverImage = computed(() => props.property.cover)
const cover = computed(() => coverImage.value?.url || '')
// srcset só quando existe a derivada de 640px; imagem externa/antiga usa a original.
const coverSrcset = computed(() =>
  coverImage.value?.urlSm ? `${coverImage.value.urlSm} 640w, ${coverImage.value.url} 1600w` : undefined,
)
const isRent = computed(() => props.property.purpose === 'aluguel')
// Cards acima da dobra não podem ser lazy: em tenant sem hero image, a capa do
// primeiro card É o elemento de LCP, e lazy adia o download pro pós-layout.
const isAboveFold = computed(() => props.index < 3)
</script>

<template>
  <article class="prop">
    <div class="ph">
      <img
        v-if="cover"
        :src="cover"
        :srcset="coverSrcset"
        sizes="(min-width: 1040px) 360px, (min-width: 820px) 50vw, 100vw"
        :alt="`${PROPERTY_TYPE_LABELS[property.type]} em ${property.neighborhood}`"
        :loading="isAboveFold ? 'eager' : 'lazy'"
        :fetchpriority="index === 0 ? 'high' : 'auto'"
        decoding="async"
      />
      <div class="badges">
        <span class="badge" :class="{ rent: isRent }">{{ isRent ? 'Aluguel' : 'Venda' }}</span>
        <span v-if="property.highStandard" class="badge high">Alto padrão</span>
      </div>
      <span class="code">{{ property.code }}</span>
    </div>

    <div class="body">
      <div class="price">
        {{ formatBRL(property.price) }}<span v-if="isRent"> /mês</span>
      </div>
      <NuxtLink class="ttl" :to="`/imovel/${property.code}`">
        {{ PROPERTY_TYPE_LABELS[property.type] }} ·
        {{ property.bedrooms ? property.bedrooms + ' quartos' : property.area + ' m²' }}
      </NuxtLink>
      <div class="loc">
        <AppIcon name="pin" />{{ property.neighborhood }}<template v-if="property.city">, {{ property.city }}</template>
      </div>

      <div class="specs">
        <template v-if="property.type === 'terreno'">
          <div class="spec"><AppIcon name="area" />{{ property.area }} m²</div>
        </template>
        <template v-else>
          <div class="spec"><AppIcon name="bed" />{{ property.bedrooms }}</div>
          <div v-if="property.suites" class="spec"><AppIcon name="suite" />{{ property.suites }}</div>
          <div class="spec"><AppIcon name="bath" />{{ property.bathrooms }}</div>
          <div class="spec"><AppIcon name="car" />{{ property.parking }}</div>
          <div class="spec"><AppIcon name="area" />{{ property.area }} m²</div>
        </template>
      </div>

      <div class="actions">
        <NuxtLink class="btn-detail" :to="`/imovel/${property.code}`">Ver detalhes</NuxtLink>
        <a class="btn-wa" :href="whatsappLink(property)" target="_blank" rel="noopener">
          <AppIcon name="wa" /> WhatsApp
        </a>
      </div>
    </div>
  </article>
</template>
