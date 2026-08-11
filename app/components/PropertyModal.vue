<script setup lang="ts">
import type { Property } from '~~/shared/models/property'
import { PROPERTY_TYPE_LABELS } from '~~/shared/models/property'

const props = defineProps<{ property: Property | null }>()
const emit = defineEmits<{ close: [] }>()

const { whatsappLink, telLink } = useContact()
const tenant = useTenant()

const idx = ref(0)
const isRent = computed(() => props.property?.purpose === 'aluguel')
const current = computed(
  () => props.property?.images[idx.value]?.url || props.property?.images[0]?.url || '',
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.property,
  (p) => {
    idx.value = 0
    if (import.meta.client) document.body.style.overflow = p ? 'hidden' : ''
  },
)

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (import.meta.client) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="property" class="modal-bg" @click.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="property.title">
        <div class="m-hero">
          <img v-if="current" :src="current" :alt="property.title" />
          <button class="m-close" aria-label="Fechar" @click="emit('close')">
            <AppIcon name="close" />
          </button>
          <div v-if="property.images.length > 1" class="m-thumbs">
            <button
              v-for="(img, i) in property.images"
              :key="img.id"
              :class="{ on: i === idx }"
              :aria-label="`Foto ${i + 1}`"
              @click="idx = i"
            />
          </div>
        </div>

        <div class="m-body">
          <div class="m-badges">
            <span class="badge" :class="{ rent: isRent }">{{ isRent ? 'Para alugar' : 'À venda' }}</span>
            <span class="badge high">{{ property.code }}</span>
            <span v-if="property.highStandard" class="badge" style="background: var(--ink)">Alto padrão</span>
          </div>

          <div class="m-price">
            {{ formatBRL(property.price) }}<span v-if="isRent"> /mês</span>
          </div>
          <div class="m-ttl">{{ PROPERTY_TYPE_LABELS[property.type] }} em {{ property.neighborhood }}</div>
          <div class="m-loc">
            <AppIcon name="pin" />{{ property.neighborhood }}<template v-if="property.city">, {{ property.city }}</template>
            <template v-if="property.state"> · {{ property.state }}</template>
          </div>

          <div class="m-specs">
            <template v-if="property.type === 'terreno'">
              <div class="m-spec"><AppIcon name="area" /><b>{{ property.area }}</b><small>m² de área</small></div>
            </template>
            <template v-else>
              <div class="m-spec"><AppIcon name="bed" /><b>{{ property.bedrooms }}</b><small>quartos</small></div>
              <div class="m-spec"><AppIcon name="bath" /><b>{{ property.bathrooms }}</b><small>banheiros</small></div>
              <div class="m-spec"><AppIcon name="car" /><b>{{ property.parking }}</b><small>vagas</small></div>
              <div class="m-spec"><AppIcon name="area" /><b>{{ property.area }}</b><small>m²</small></div>
            </template>
          </div>

          <div v-if="property.description" class="m-desc">
            <h4>Sobre o imóvel</h4>{{ property.description }}
          </div>
          <div v-if="property.features.length" class="m-desc" style="margin-bottom: 22px">
            <h4>Diferenciais</h4>
            <div class="m-feats">
              <span v-for="f in property.features" :key="f" class="m-feat">{{ f }}</span>
            </div>
          </div>

          <div class="m-cta">
            <a class="wa" :href="whatsappLink(property)" target="_blank" rel="noopener">
              <AppIcon name="wa" /> Tenho interesse
            </a>
            <a v-if="tenant?.phone" class="tel" :href="telLink()">
              <AppIcon name="phone" /> Ligar
            </a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
