<script setup lang="ts">
const tenant = useTenant()
const { whatsappLink } = useContact()
</script>

<template>
  <header class="bar">
    <div class="bar-in">
      <NuxtLink class="brand" to="/">
        <span class="mark" aria-hidden="true">
          <img v-if="tenant?.logoUrl" :src="tenant.logoUrl" :alt="tenant?.name || 'Logo'" />
          <AppIcon v-else name="home" />
        </span>
        <span>
          <b>{{ tenant?.name || 'Imóveis' }}</b>
          <small v-if="tenant?.tagline">{{ tenant.tagline }}</small>
        </span>
      </NuxtLink>
      <div class="bar-cta">
        <a
          v-if="tenant?.whatsapp"
          class="wa-btn"
          :href="whatsappLink()"
          target="_blank"
          rel="noopener"
        >
          <AppIcon name="wa" />
          <span class="label-desk">Falar no WhatsApp</span>
        </a>
      </div>
    </div>
  </header>
</template>
