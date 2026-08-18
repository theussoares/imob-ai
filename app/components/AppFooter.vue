<script setup lang="ts">
const tenant = useTenant();
const { whatsappLink } = useContact();
const year = new Date().getFullYear();

const config = useRuntimeConfig();
const builtByName = config.public.builtByName;
const builtByLink = computed(() => {
  const wa = (config.public.builtByWhatsapp || "").replace(/\D/g, "");
  const msg = `Olá, ${builtByName}! Vi um site que você desenvolveu e gostaria de um orçamento.`;
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : "#";
});
</script>

<template>
  <footer class="site-footer">
    <div class="foot-in">
      <div>
        <div class="foot-brand">
          <!-- <span class="mark" :class="{ 'has-logo': tenant?.logoUrl }">
            <img
              v-if="tenant?.logoUrl"
              :src="tenant.logoUrl"
              :alt="tenant?.name || 'Logo'"
            />
            <AppIcon v-else name="home" />
          </span> -->
          {{ tenant?.name || "Imóveis" }}
        </div>
        <p>
          Atendimento personalizado para compra, venda e locação de imóveis
          <template v-if="tenant?.city"
            >em {{ tenant.city
            }}<span v-if="tenant?.state">/{{ tenant.state }}</span> e
            região</template
          >.
        </p>
      </div>

      <div class="foot-contacts">
        <a
          v-if="tenant?.whatsapp"
          :href="whatsappLink()"
          target="_blank"
          rel="noopener"
        >
          <AppIcon name="wa" /> WhatsApp · atendimento
        </a>
        <a v-if="tenant?.email" :href="`mailto:${tenant.email}`">
          <AppIcon name="mail" /> {{ tenant.email }}
        </a>
        <a v-if="tenant?.city" href="#">
          <AppIcon name="pin" /> {{ tenant.city
          }}<span v-if="tenant?.state"> · {{ tenant.state }}</span>
        </a>
      </div>

      <div class="foot-note" style="grid-column: 1 / -1">
        <span>
          © {{ year }} {{ tenant?.name || "Imóveis" }}
          <template v-if="tenant?.creci"> — CRECI {{ tenant.creci }}</template>
        </span>
        <span v-if="builtByName" class="dev-credit">
          Desenvolvido por
          <a :href="builtByLink" target="_blank" rel="noopener">{{
            builtByName
          }}</a>
        </span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* .foot-brand .mark não tinha overflow nem regra de img (só existia o ícone),
   então a logo estouraria a caixa arredondada. Fundo branco porque o footer é
   escuro: logo com traço escuro e fundo transparente sumiria. */
.foot-brand .mark.has-logo {
  overflow: hidden;
  background: transparent;
}
.foot-brand .mark.has-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.dev-credit a {
  color: #eaf3f0;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  padding-bottom: 1px;
}
.dev-credit a:hover {
  border-bottom-color: #eaf3f0;
}
</style>
