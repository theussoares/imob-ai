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
      <div class="bar-cta cta-group">
        <!-- Só aparece para quem contratou: link que leva a um login que recusa
             a pessoa é pior que link nenhum — ela liga para a imobiliária
             dizendo que "o site não deixa entrar". Ver `portalEnabled`. -->
        <NuxtLink
          v-if="tenant?.portalEnabled"
          class="cliente-btn"
          to="/area-cliente"
        >
          Área do Cliente
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

<style scoped>
.cta-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
/*
 * Texto, não ícone: é o único item do header que uma pessoa procura pelo NOME
 * ("onde entro para ver meu boleto?"). Um ícone de bonequinho ao lado do
 * WhatsApp seria mais um símbolo para decifrar.
 *
 * Continua legível no celular porque o nome da imobiliária some abaixo de
 * `md` (`b.hidden md:flex`) — o espaço que ele deixa é justamente este.
 */
.cliente-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 11px;
  border: 1px solid var(--line);
  color: var(--brand);
  font-weight: 600;
  font-size: 13.5px;
  text-decoration: none;
  white-space: nowrap;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.cliente-btn:hover {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.cliente-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
@media (min-width: 560px) {
  .cliente-btn {
    font-size: 14px;
    padding: 11px 15px;
  }
}
</style>
