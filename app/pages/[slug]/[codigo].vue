<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import { PROPERTY_TYPE_LABELS } from "~~/shared/models/property";
import { PROPERTY_TYPE_REGISTRY } from "~~/shared/models/property";
import { propertyPath, propertySlug } from "~~/shared/utils/property-url";
import { propertyTitle } from "~~/shared/utils/property-title";
import { formatPropertyCode } from "~~/shared/utils/property-specs";

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

/** Passado à barra fixa, que se recolhe enquanto este cartão estiver à vista. */
const contactCard = ref<HTMLElement | null>(null);

useSeoMeta({
  title: propertyTitle(p),
  description:
    p.description ||
    `${PROPERTY_TYPE_LABELS[p.type]} ${isRent ? "para alugar" : "à venda"}${locality ? " em " + locality : ""}. ${priceLabel.value}.`,
  ogTitle: `${propertyTitle(p)} — ${priceLabel.value}`,
  ogDescription: p.description || undefined,
  ogImage: p.images[0]?.url,
  ogType: "website",
  twitterCard: "summary_large_image",
});

const schemaType = PROPERTY_TYPE_REGISTRY[p.type].schema;

const jsonLd = computed(() => [
  {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    sku: p.code,
    category: PROPERTY_TYPE_LABELS[p.type],
    description: p.description || undefined,
    image: p.images.map((i) => i.url),
    brand: { "@type": "Brand", name: tenant.value?.name },
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      url: canonical,
      businessFunction:
        p.purpose === "aluguel"
          ? "http://purl.org/goodrelations/v1#LeaseOut"
          : "http://purl.org/goodrelations/v1#Sell",
    },
    additionalType: `https://schema.org/${schemaType}`,
  },
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
      { "@type": "ListItem", position: 2, name: p.title, item: canonical },
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
  <main class="detail">
    <div class="container">
      <a href="/" class="back" @click.prevent="goBack">← Voltar aos imóveis</a>

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

            <div v-if="p.description" class="m-desc">
              <h3>Sobre o imóvel</h3>
              {{ p.description }}
            </div>
            <div v-if="p.features.length" class="m-desc">
              <h3>Diferenciais</h3>
              <div class="m-feats">
                <span v-for="f in p.features" :key="f" class="m-feat">{{
                  f
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <aside class="side">
          <div ref="contactCard" class="admin-card side-card">
            <a
              class="btn-wa side-wa"
              :href="whatsappLink(p)"
              target="_blank"
              rel="noopener"
            >
              <AppIcon name="wa" /> Tenho interesse
            </a>
            <a v-if="tenant?.phone" class="btn-detail" :href="telLink()">
              <AppIcon name="phone" /> Ligar para o corretor
            </a>
            <hr class="side-sep" />
            <LeadForm :property-code="p.code" source="property_page" />
          </div>
        </aside>
      </div>
    </div>

    <!-- A barra recolhe quando este cartão entra em cena: dois botões de
         WhatsApp idênticos empilhados fazem duvidar se são a mesma coisa. -->
    <PropertyStickyCta :property="p" :contact-card="contactCard" />
  </main>
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
.back {
  display: inline-block;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 16px;
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
  font-family: "Space Grotesk", sans-serif;
  font-size: 34px;
  margin: 10px 0 2px;
}
.block .price span {
  font-size: 15px;
  color: var(--ink-soft);
  font-family: "Inter", sans-serif;
}
.block .ttl {
  font-size: 21px;
  margin: 4px 0;
}
.block .loc {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  font-size: 15px;
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
  font-family: "Space Grotesk", sans-serif;
  font-size: 26px;
  font-weight: 600;
}
.side-price span {
  font-size: 14px;
  color: var(--ink-soft);
  font-family: "Inter", sans-serif;
}
.side-wa {
  font-size: 16px;
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
