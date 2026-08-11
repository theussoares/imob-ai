<script setup lang="ts">
const tenant = useTenant()
const { whatsappLink } = useContact()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="foot-in">
      <div>
        <div class="foot-brand">
          <span class="mark"><AppIcon name="home" /></span>
          {{ tenant?.name || 'Imóveis' }}
        </div>
        <p>
          Atendimento personalizado para compra, venda e locação de imóveis
          <template v-if="tenant?.city">em {{ tenant.city }}<span v-if="tenant?.state">/{{ tenant.state }}</span> e região</template>.
        </p>
      </div>

      <div class="foot-contacts">
        <a v-if="tenant?.whatsapp" :href="whatsappLink()" target="_blank" rel="noopener">
          <AppIcon name="wa" /> WhatsApp · atendimento
        </a>
        <a v-if="tenant?.email" :href="`mailto:${tenant.email}`">
          <AppIcon name="mail" /> {{ tenant.email }}
        </a>
        <a v-if="tenant?.city" href="#">
          <AppIcon name="pin" /> {{ tenant.city }}<span v-if="tenant?.state"> · {{ tenant.state }}</span>
        </a>
      </div>

      <div class="foot-note" style="grid-column: 1 / -1">
        <span>
          © {{ year }} {{ tenant?.name || 'Imóveis' }}
          <template v-if="tenant?.creci"> — CRECI {{ tenant.creci }}</template>
        </span>
        <span>Feito para você encontrar o imóvel certo.</span>
      </div>
    </div>
  </footer>
</template>
