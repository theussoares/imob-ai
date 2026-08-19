<script setup lang="ts">
const tenant = useTenant();
const { whatsappLink } = useContact();

/**
 * Texto do rodapé. Vazio cai na frase gerada com a cidade — quem nunca abrir a
 * configuração continua com algo que fala da própria região, em vez de um campo
 * em branco. Mas o padrão é IGUAL entre clientes, então vale personalizar: dois
 * sites com a mesma frase são genéricos para quem lê e duplicados para o Google.
 */
const footerText = computed(() => {
  const proprio = tenant.value?.footerText?.trim();
  if (proprio) return proprio;
  const cidade = tenant.value?.city;
  const uf = tenant.value?.state ? `/${tenant.value.state}` : "";
  return cidade
    ? `Atendimento personalizado para compra, venda e locação de imóveis em ${cidade}${uf} e região.`
    : "Atendimento personalizado para compra, venda e locação de imóveis.";
});

/**
 * Perfis oficiais da imobiliária. Até agora só alimentavam o `sameAs` do
 * JSON-LD — o cliente preenchia o Instagram no painel e nenhum visitante
 * conseguia clicar. Diferente dos links extras: estes dizem QUEM a imobiliária
 * é, os outros dizem para onde ir.
 */
const profiles = computed(() =>
  [
    { icon: "instagram", label: "Instagram", href: tenant.value?.instagram },
    { icon: "world", label: "Site", href: tenant.value?.website },
  ].filter((p): p is { icon: string; label: string; href: string } => !!p.href),
);

const links = computed(() => tenant.value?.footerLinks ?? []);
/** Link interno usa NuxtLink (navegação sem recarregar); externo abre em aba. */
const isInternal = (href: string) => href.startsWith("/");
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
          {{ tenant?.name || "Imóveis" }}
        </div>
        <p>{{ footerText }}</p>
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
        <!-- Era âncora vazia: link que não leva a lugar nenhum, anunciado como
             link por leitor de tela. Cidade é informação, não navegação. -->
        <span v-if="tenant?.city" class="foot-place">
          <AppIcon name="pin" /> {{ tenant.city
          }}<span v-if="tenant?.state"> · {{ tenant.state }}</span>
        </span>

        <a
          v-for="p in profiles"
          :key="p.href"
          :href="p.href"
          target="_blank"
          rel="noopener"
        >
          <AppIcon :name="p.icon" /> {{ p.label }}
        </a>
      </div>

      <nav v-if="links.length" class="foot-links" aria-label="Links do rodapé">
        <template v-for="l in links" :key="l.href + l.label">
          <NuxtLink v-if="isInternal(l.href)" :to="l.href">{{
            l.label
          }}</NuxtLink>
          <a v-else :href="l.href" target="_blank" rel="noopener">{{
            l.label
          }}</a>
        </template>
      </nav>

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
/* Mesmo alinhamento dos links de contato, sem parecer clicável. */
.foot-place {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.foot-links {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.foot-links a {
  color: #cfe3dd;
  text-decoration: none;
  font-size: 14px;
}
.foot-links a:hover {
  color: #fff;
  text-decoration: underline;
}

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
