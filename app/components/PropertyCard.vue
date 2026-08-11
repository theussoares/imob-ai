<script setup lang="ts">
import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = defineProps<{ property: Property }>()
const emit = defineEmits<{ open: [Property] }>()

const { has, toggle } = useFavorites()
const { whatsappLink } = useContact()

const cover = computed(() => props.property.images[0]?.url || '')
const isRent = computed(() => props.property.purpose === 'aluguel')
</script>

<template>
  <article class="prop">
    <div class="ph">
      <img
        v-if="cover"
        :src="cover"
        :alt="`${PROPERTY_TYPE_LABELS[property.type]} em ${property.neighborhood}`"
        loading="lazy"
        decoding="async"
      />
      <div class="badges">
        <span class="badge" :class="{ rent: isRent }">{{ isRent ? 'Aluguel' : 'Venda' }}</span>
        <span v-if="property.highStandard" class="badge high">Alto padrão</span>
      </div>
      <button
        class="fav"
        :class="{ on: has(property.code) }"
        :aria-label="has(property.code) ? 'Remover dos favoritos' : 'Favoritar'"
        @click="toggle(property.code)"
      >
        <AppIcon name="heart" />
      </button>
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
          <div class="spec"><AppIcon name="bath" />{{ property.bathrooms }}</div>
          <div class="spec"><AppIcon name="car" />{{ property.parking }}</div>
          <div class="spec"><AppIcon name="area" />{{ property.area }} m²</div>
        </template>
      </div>

      <div class="actions">
        <button class="btn-detail" @click="emit('open', property)">Ver detalhes</button>
        <a class="btn-wa" :href="whatsappLink(property)" target="_blank" rel="noopener">
          <AppIcon name="wa" /> WhatsApp
        </a>
      </div>
    </div>
  </article>
</template>
