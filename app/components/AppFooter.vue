<script setup lang="ts">
import {
  resolveFooterPages,
  STATIC_FOOTER_PAGES,
} from "~~/shared/utils/footer-pages";
import {
  formatTenantAddress,
  googleMapsEmbedSrc,
  googleMapsLink,
  hasStructuredAddress,
} from "~~/shared/utils/address";
const tenant = useTenant();
const { whatsappLink } = useContact();

const address = computed(() =>
  tenant.value && hasStructuredAddress(tenant.value)
    ? formatTenantAddress(tenant.value)
    : "",
);
const mapSrc = computed(() =>
  tenant.value && hasStructuredAddress(tenant.value)
    ? googleMapsEmbedSrc(tenant.value)
    : null,
);
const mapLink = computed(() => (tenant.value ? googleMapsLink(tenant.value) : null));

/**
 * O mapa só entra quando a pessoa pede.
 *
 * O iframe do Google Maps traz o JavaScript do Maps inteiro (main.js,
 * common.js, embed): no PageSpeed de 24/09 isso subiu o TBT do desktop para
 * ~500 ms, com tarefas longas de até 129 ms. Ninguém notou antes porque até o
 * hotfix #50 a CSP bloqueava o iframe — o custo apareceu junto com o mapa.
 * `loading="lazy"` não bastava: o Chrome carrega iframe a 1.250–2.500 px da
 * tela, e isso já alcança o rodapé da home.
 *
 * O bloco no lugar tem a mesma altura do mapa, para a página não pular quando
 * ele entra. "Abrir no Google Maps" é um link comum: funciona sem JavaScript e
 * no celular abre o app, que é o que a maioria quer de qualquer jeito.
 */
const mapaAberto = ref(false);

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

/**
 * Páginas do próprio site. Vêm do registro do código, com o rótulo e a
 * visibilidade que o cliente escolheu — ele não digita caminho, então não há
 * link interno quebrado no rodapé de todas as páginas.
 */
const pages = computed(() =>
  // `aboutEnabled` aqui já é o valor EFETIVO (recurso × interruptor): o payload
  // público colapsa os dois, então o rodapé continua lendo um campo só.
  resolveFooterPages(STATIC_FOOTER_PAGES, tenant.value?.footerPages ?? {}, {
    about: tenant.value?.aboutEnabled === true,
  }),
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
             link por leitor de tela. Endereço/cidade é informação, não navegação. -->
        <span v-if="address" class="foot-place">
          <AppIcon name="pin" /> {{ address }}
        </span>
        <span v-else-if="tenant?.city" class="foot-place">
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

      <!-- Iframe sem chave de API (ver shared/utils/address.ts): só entra quando
           há endereço, então não pesa o rodapé de quem não configurou nada. -->
      <div v-if="mapSrc" class="foot-map" style="grid-column: 1 / -1">
        <iframe
          v-if="mapaAberto"
          :src="mapSrc"
          referrerpolicy="no-referrer-when-downgrade"
          title="Mapa com a localização"
        />
        <div v-else class="foot-map-capa">
          <AppIcon name="pin" class="foot-map-pino" />
          <span v-if="address" class="foot-map-end">{{ address }}</span>
          <div class="foot-map-acoes">
            <button type="button" class="foot-map-btn" @click="mapaAberto = true">
              Ver mapa aqui
            </button>
            <a
              v-if="mapLink"
              :href="mapLink"
              target="_blank"
              rel="noopener"
              class="foot-map-link"
            >
              Abrir no Google Maps ↗
            </a>
          </div>
        </div>
      </div>

      <nav
        v-if="pages.length || links.length || tenant?.portalEnabled"
        class="foot-links"
        aria-label="Links do rodapé"
      >
        <!-- Quem já é cliente procura a entrada aqui embaixo, não no menu. -->
        <NuxtLink v-if="tenant?.portalEnabled" to="/area-cliente">
          Área do Cliente
        </NuxtLink>
        <NuxtLink v-for="p in pages" :key="p.path" :to="p.path">{{
          p.label
        }}</NuxtLink>
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
.foot-map {
  border-radius: 12px;
  overflow: hidden;
  margin-top: 4px;
}
.foot-map iframe {
  width: 100%;
  height: 200px;
  border: 0;
  display: block;
}
/* Mesma altura do iframe: trocar um pelo outro não empurra o rodapé. */
.foot-map-capa {
  height: 200px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}
.foot-map-pino {
  width: 26px;
  height: 26px;
  color: #fff;
}
.foot-map-end {
  color: #cfe3dd;
  font-size: 14px;
  max-width: 48ch;
}
.foot-map-acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px 16px;
}
.foot-map-btn {
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 10px;
  background: transparent;
  color: #fff;
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  padding: 9px 16px;
}
.foot-map-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.foot-map-link {
  color: #cfe3dd;
  font-size: 14px;
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
