<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import { PROPERTY_TYPE_LABELS } from "~~/shared/models/property";
import { propertyJsonLd } from "~~/shared/utils/property-jsonld";
import { propertyPath, propertySlug } from "~~/shared/utils/property-url";
import { propertyTitle } from "~~/shared/utils/property-title";
import { formatPropertyCode } from "~~/shared/utils/property-specs";
import { propertyOgUrl } from "~~/shared/utils/og-image";
import type { PropertyCard } from "~~/shared/models/property";
import { allCategories, categoryLabel, categorySlug } from "~~/shared/utils/category";
import { neighborhoodMapsEmbedSrc, neighborhoodMapsLink } from "~~/shared/utils/address";
import { similarProperties } from "~~/shared/utils/similar-properties";

const route = useRoute();
const router = useRouter();
const tenant = useTenant();
const requestFetch = useRequestFetch();
const { whatsappLink, telLink } = useContact();
const code = computed(() => String(route.params.codigo));

// Se houver histórico (veio do catálogo), volta de verdade — o Nuxt só restaura a
// posição do scroll em navegações de "voltar" reais, não num push novo pra "/".
// Sem histórico (ex.: link compartilhado, aberto direto), cai pro catálogo normal.
function goBack() {
  if (import.meta.client && window.history.state?.back) router.back();
  else navigateTo("/");
}

// useRequestFetch (não $fetch): encaminha Host/cookies da requisição original, sem
// os quais a chamada interna no SSR não resolve o tenant e cai no fallback —
// servindo 404 ou, pior, o imóvel de outro tenant.
const { data: property, error } = await useAsyncData(
  `property:${code.value}`,
  () => requestFetch<Property>(`/api/properties/${code.value}`),
);

if (error.value || !property.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Imóvel não encontrado.",
  });
}

const p = property.value;
const isRent = p.purpose === "aluguel";

const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
// O primeiro segmento é decorativo e envelhece quando o imóvel é editado. Em vez
// de 404, manda para o canônico atual — link já divulgado continua valendo.
// A query (fbclid, gclid, ...) vai junto: é o mesmo link de anúncio, só com o
// slug desatualizado.
const slugCanonico = propertySlug(p);
if (String(route.params.slug) !== slugCanonico) {
  await navigateTo(
    { path: propertyPath(p), query: route.query },
    { redirectCode: 301, replace: true },
  );
}

const canonical = `${url.origin}${propertyPath(p)}`;

// Localidade sem "null": neighborhood e city são opcionais no modelo.
const locality = [p.neighborhood, p.city].filter(Boolean).join(", ");

const priceLabel = computed(() => formatBRL(p.price) + (isRent ? "/mês" : ""));

/**
 * Trilha visível: Início › Imóveis à venda › este imóvel.
 *
 * Existia só no JSON-LD — o Google via a hierarquia, a pessoa não. Quem chega
 * de uma busca direto no imóvel não passou pela home e só tinha "Voltar", que
 * sem histórico leva para a home, não para a lista do que ela procura.
 *
 * O degrau do meio é a página de PRETENSÃO, e não a de tipo ("Casas à venda"):
 * a de pretensão responde 200 sempre, a de tipo dá 404 abaixo do piso de
 * inventário, e saber disso aqui exigiria carregar o catálogo no SSR só para
 * decidir um link.
 */
const pretensao = allCategories().find(
  (c) => c.type === null && c.purpose === p.purpose,
)!;
const crumbMeio = {
  label: categoryLabel(pretensao),
  href: `/imoveis/${categorySlug(pretensao)}`,
};

const mapSrc = neighborhoodMapsEmbedSrc(p);
const mapLink = neighborhoodMapsLink(p);

/**
 * Semelhantes: até 4 cards, escolhidos no servidor e entregues no HTML.
 *
 * Antes eram calculados no navegador sobre `/api/properties` inteiro, com
 * `server: false`. Funcionava, mas toda visita que chegava direto (Google,
 * link de WhatsApp) disparava o download do catálogo só para mostrar quatro
 * cards no fim da página. Pôr o catálogo no SSR seria pior: ele iria no HTML
 * da página mais aberta no celular. O endpoint devolve só os cards que
 * aparecem.
 *
 * Quem navega a partir da home já tem o catálogo em `payload.data.properties`:
 * o `getCachedData` calcula dali, sem requisição nenhuma.
 *
 * Falha aqui não pode derrubar a página do imóvel: vira lista vazia, e a seção
 * some.
 */
const { data: semelhantes } = await useAsyncData(
  `semelhantes:${code.value}`,
  () =>
    requestFetch<PropertyCard[]>(`/api/properties/${code.value}/semelhantes`).catch(
      () => [] as PropertyCard[],
    ),
  {
    default: () => [] as PropertyCard[],
    getCachedData: (key, nuxtApp) => {
      const pronto = nuxtApp.payload.data[key] as PropertyCard[] | undefined;
      if (pronto) return pronto;
      const catalogo = nuxtApp.payload.data.properties as PropertyCard[] | undefined;
      return catalogo?.length ? similarProperties(p, catalogo) : undefined;
    },
  },
);

/** Passado à barra fixa, que se recolhe enquanto este cartão estiver à vista. */
const contactCard = ref<HTMLElement | null>(null);

useSeoMeta({
  title: propertyTitle(p),
  description:
    p.description ||
    `${PROPERTY_TYPE_LABELS[p.type]} ${isRent ? "para alugar" : "à venda"}${locality ? " em " + locality : ""}. ${priceLabel.value}.`,
  ogTitle: `${propertyTitle(p)} — ${priceLabel.value}`,
  ogDescription: p.description || undefined,
  ogType: "website",
  twitterCard: "summary_large_image",
});

// A capa NÃO é anunciada direto do Storage: ela está em WebP (formato que o
// WhatsApp não renderiza em preview) e na proporção original da foto. A rota /og
// devolve a mesma capa em JPEG 1200×630 — ver shared/utils/og-image.ts.
useOgCard(() => ({
  url: propertyOgUrl(url.origin, p.code, p.images[0]?.url),
  alt: propertyTitle(p),
}));

const jsonLd = computed(() => [
  propertyJsonLd(p, { tenantName: tenant.value?.name, canonical }),
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Início",
        item: url.origin + "/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: crumbMeio.label,
        item: url.origin + crumbMeio.href,
      },
      { "@type": "ListItem", position: 3, name: p.title, item: canonical },
    ],
  },
]);

// Sobrescreve o canonical global do app.vue (que usa route.path, sensível a
// maiúsculas) pelo normalizado com o código do banco.
useHead(() => ({
  link: [{ rel: "canonical", href: canonical }],
}));

useHead(() => ({
  script: jsonLd.value.map((node) => ({
    type: "application/ld+json",
    innerHTML: JSON.stringify(node),
  })),
}));
</script>

<template>
  <div class="detail">
    <div class="container">
      <div class="top-nav">
        <a href="/" class="back" @click.prevent="goBack">← Voltar</a>
        <nav class="crumbs" aria-label="Trilha de navegação">
          <NuxtLink to="/">Início</NuxtLink>
          <span aria-hidden="true">›</span>
          <NuxtLink :to="crumbMeio.href">{{ crumbMeio.label }}</NuxtLink>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{{ formatPropertyCode(p.code) }}</span>
        </nav>
      </div>

      <div class="detail-grid">
        <div>
          <PropertyGallery :images="p.images" :title="p.title" />

          <div class="block">
            <div class="m-badges">
              <span class="badge" :class="{ rent: isRent }">{{
                isRent ? "Para alugar" : "À venda"
              }}</span>
              <span class="badge high">{{ formatPropertyCode(p.code) }}</span>
              <span
                v-if="p.highStandard"
                class="badge"
                style="background: var(--ink)"
                >Alto padrão</span
              >
            </div>
            <p class="price">
              {{ formatBRL(p.price) }}<span v-if="isRent"> /mês</span>
            </p>
            <h1 class="ttl">
              {{ PROPERTY_TYPE_LABELS[p.type] }}{{ p.neighborhood ? " em " + p.neighborhood : "" }}
            </h1>
            <p class="loc">
              <AppIcon name="pin" />{{ locality }}
              <template v-if="p.state">· {{ p.state }}</template>
            </p>

            <PropertySpecs :property="p" variant="detail" />

            <!-- h2, não h3: logo abaixo do h1, o salto fazia o leitor de tela
                 anunciar as seções como se faltasse um nível entre elas. -->
            <div v-if="p.description" class="m-desc">
              <h2>Sobre o imóvel</h2>
              <!-- pre-line: a descrição vem de um textarea, e sem isto os
                   parágrafos do corretor viravam um bloco só. -->
              <p class="m-desc-txt">{{ p.description }}</p>
            </div>
            <div v-if="p.features.length" class="m-desc">
              <h2>Diferenciais</h2>
              <div class="m-feats">
                <span v-for="f in p.features" :key="f" class="m-feat">{{
                  f
                }}</span>
              </div>
            </div>

            <div v-if="mapSrc" class="m-desc">
              <h2>Localização</h2>
              <p class="m-map-note">
                Mapa do bairro {{ p.neighborhood }}. O endereço exato é
                informado pelo corretor.
              </p>
              <div class="m-map">
                <iframe
                  :src="mapSrc"
                  loading="lazy"
                  referrerpolicy="no-referrer-when-downgrade"
                  :title="`Mapa do bairro ${p.neighborhood}`"
                />
              </div>
              <a
                v-if="mapLink"
                class="m-map-link"
                :href="mapLink"
                target="_blank"
                rel="noopener"
              >
                <AppIcon name="pin" /> Abrir no Google Maps
              </a>
            </div>
          </div>
        </div>

        <aside class="side">
          <div ref="contactCard" class="admin-card side-card">
            <a
              class="btn-wa side-wa"
              :href="whatsappLink(p)"
              :data-imovel="p.code"
              data-wa-origem="imovel"
              target="_blank"
              rel="noopener"
            >
              <AppIcon name="wa" /> Tenho interesse
            </a>
            <a v-if="tenant?.phone" class="btn-detail" :href="telLink()">
              <AppIcon name="phone" /> Ligar para o corretor
            </a>
            <hr class="side-sep" />
            <LeadForm
              :property-code="p.code"
              source="property_page"
              :heading-level="2"
              secondary
            />
            <p v-if="tenant?.creci" class="side-creci">CRECI {{ tenant.creci }}</p>
          </div>
        </aside>
      </div>

      <section
        v-if="semelhantes.length"
        class="similares"
        aria-labelledby="similares-titulo"
      >
        <h2 id="similares-titulo">Imóveis parecidos</h2>
        <div class="grid">
          <PropertyCard
            v-for="(s, i) in semelhantes"
            :key="s.id"
            :property="s"
            :index="i + 10"
          />
        </div>
      </section>
    </div>

    <!-- A barra recolhe quando este cartão entra em cena: dois botões de
         WhatsApp idênticos empilhados fazem duvidar se são a mesma coisa. -->
    <PropertyStickyCta :property="p" :contact-card="contactCard" />
  </div>
</template>

<style scoped>
.detail {
  padding: 22px 0 60px;
}
/* Espaço para a barra de contato fixa não cobrir o fim do conteúdo. Só até
   900px, que é onde ela existe. */
@media (max-width: 899px) {
  .detail {
    padding-bottom: calc(88px + env(safe-area-inset-bottom));
  }
}
.top-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-bottom: 16px;
}
.back {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--fs-ui);
}
.crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.crumbs a {
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.crumbs a:hover {
  text-decoration: underline;
}
.m-desc-txt {
  white-space: pre-line;
  margin: 0;
}
.m-map-note {
  margin: 0 0 10px;
  font-size: var(--fs-ui);
  color: var(--ink-soft);
}
.m-map {
  aspect-ratio: 16 / 9;
  border-radius: var(--r-md);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--line);
}
.m-map iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
.m-map-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: var(--brand);
  font-weight: 600;
  font-size: var(--fs-ui);
  text-decoration: none;
}
.m-map-link:hover {
  text-decoration: underline;
}
.m-map-link :deep(svg) {
  width: 16px;
  height: 16px;
}
.side-creci {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  text-align: center;
}
.similares {
  margin-top: 48px;
}
.similares h2 {
  font-size: var(--fs-title);
  margin-bottom: 18px;
}
.back:hover {
  color: var(--brand);
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}
/**
 * A trava que impede a tira de miniaturas de estourar a tela.
 *
 * Item de grid nasce com `min-width: auto`, que quer dizer "não encolha abaixo
 * do seu conteúdo". A tira de miniaturas é um flex `nowrap` com rolagem
 * própria: como conteúdo, ela mede a soma de TODAS as miniaturas. Sem esta
 * regra esse total virava a largura mínima da coluna, o `1fr` resolvia para
 * 836px numa tela de 375px, e a página inteira rolava na horizontal —
 * cabeçalho cortado, foto passando da borda.
 *
 * O `overflow-x: auto` da própria tira não resolve: ele zera a largura mínima
 * DELA, não a do item de grid que a contém.
 */
.detail-grid > * {
  min-width: 0;
}
.block {
  margin-top: 22px;
}
.block .price {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  margin: 10px 0 2px;
}
.block .price span {
  font-size: var(--fs-body);
  color: var(--ink-soft);
  font-family: var(--font-body);
}
.block .ttl {
  font-size: var(--fs-title);
  margin: 4px 0;
}
.block .loc {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  font-size: var(--fs-body);
}
.block .loc :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: var(--ink-soft);
}
.side-card {
  position: sticky;
  top: 84px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.side-price {
  font-family: var(--font-display);
  font-size: var(--fs-title-lg);
  font-weight: 600;
}
.side-price span {
  font-size: var(--fs-ui);
  color: var(--ink-soft);
  font-family: var(--font-body);
}
.side-wa {
  font-size: var(--fs-body);
  padding: 14px;
}
.side-sep {
  border: none;
  border-top: 1px solid var(--line);
  margin: 6px 0;
}
@media (min-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr 360px;
    align-items: start;
  }
}
</style>
