<script setup lang="ts">
const tenant = useTenant();
const { whatsappLink } = useContact();
</script>

<template>
  <header class="bar">
    <div class="bar-in">
      <NuxtLink class="brand" to="/">
        <span class="mark" aria-hidden="true">
          <img
            v-if="tenant?.logoUrl"
            :src="tenant.logoUrl"
            :alt="tenant?.name || 'Logo'"
          />
          <AppIcon v-else name="home" />
        </span>
        <span>
          <b class="hidden md:flex">{{ tenant?.name || "Imóveis" }}</b>
          <small v-if="tenant?.tagline">{{ tenant.tagline }}</small>
        </span>
      </NuxtLink>
      <div class="bar-cta">
        <!--
          Só aparece quando a imobiliária liga a Área do Cliente. Sem esta
          condição o link iria para o site de toda imobiliária, levando o
          visitante a um login onde ninguém tem conta.
        -->
        <NuxtLink
          v-if="tenant?.portalEnabled"
          class="portal-btn"
          to="/area-cliente"
        >
          <AppIcon name="home" />
          <span class="label-desk">Área do Cliente</span>
        </NuxtLink>
        <a
          v-if="tenant?.whatsapp"
          class="wa-btn"
          :href="whatsappLink()"
          target="_blank"
          rel="noopener"
          aria-label="Falar no WhatsApp"
        >
          <AppIcon name="wa" />
          <span class="label-desk">Falar no WhatsApp</span>
        </a>
      </div>
    </div>
  </header>
</template>
