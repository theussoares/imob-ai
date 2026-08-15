<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import { PROPERTY_TYPE_LABELS } from "~~/shared/models/property";

const route = useRoute();
const router = useRouter();
const tenant = useTenant();
const requestFetch = useRequestFetch();
const { whatsappLink, telLink } = useContact();
const code = computed(() => String(route.params.code));

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
const active = ref(p.images[0]?.url || "");
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
// Usa sempre o código canônico do banco: a busca por código é case-insensitive,
// então /imovel/nc-0231 e /imovel/NC-0231 servem a mesma página — sem isso cada
// variação se auto-canonicaliza e vira conteúdo duplicado.
const canonical = `${url.origin}/imovel/${p.code}`;

// Localidade sem "null": neighborhood e city são opcionais no modelo.
const locality = [p.neighborhood, p.city].filter(Boolean).join(", ");

const priceLabel = computed(() => formatBRL(p.price) + (isRent ? "/mês" : ""));

useSeoMeta({
  title: `${p.title} · ${PROPERTY_TYPE_LABELS[p.type]}`,
  description:
    p.description ||
    `${PROPERTY_TYPE_LABELS[p.type]} ${isRent ? "para alugar" : "à venda"}${locality ? " em " + locality : ""}. ${priceLabel.value}.`,
  ogTitle: `${p.title} — ${priceLabel.value}`,
  ogDescription: p.description || undefined,
  ogImage: p.images[0]?.url,
  ogType: "website",
  twitterCard: "summary_large_image",
});

const schemaType = (
  {
    casa: "House",
    apartamento: "Apartment",
    sobrado: "House",
    terreno: "Place",
  } as const
)[p.type];

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
          <div class="gallery">
            <img
              v-if="active"
              :src="active"
              :alt="p.title"
              class="gallery-main"
              fetchpriority="high"
              decoding="async"
            />
          </div>
          <div v-if="p.images.length > 1" class="thumbs">
            <button
              v-for="img in p.images"
              :key="img.id"
              class="thumb"
              :class="{ on: active === img.url }"
              @click="active = img.url"
            >
              <!-- thumb tem 84x60: usa a derivada pequena quando existe -->
              <img :src="img.urlSm || img.url" :alt="img.alt || p.title" loading="lazy" />
            </button>
          </div>

          <div class="block">
            <div class="m-badges">
              <span class="badge" :class="{ rent: isRent }">{{
                isRent ? "Para alugar" : "À venda"
              }}</span>
              <span class="badge high">{{ p.code }}</span>
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

            <div class="m-specs">
              <template v-if="p.type === 'terreno'">
                <div class="m-spec">
                  <AppIcon name="area" /><b>{{ p.area }}</b
                  ><small>m² de área</small>
                </div>
              </template>
              <template v-else>
                <div class="m-spec">
                  <AppIcon name="bed" /><b>{{ p.bedrooms }}</b
                  ><small>quartos</small>
                </div>
                <div class="m-spec">
                  <AppIcon name="bath" /><b>{{ p.bathrooms }}</b
                  ><small>banheiros</small>
                </div>
                <div class="m-spec">
                  <AppIcon name="car" /><b>{{ p.parking }}</b
                  ><small>vagas</small>
                </div>
                <div class="m-spec">
                  <AppIcon name="area" /><b>{{ p.area }}</b
                  ><small>m²</small>
                </div>
              </template>
            </div>

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
          <div class="admin-card side-card">
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
            <LeadForm :property-code="p.code" />
          </div>
        </aside>
      </div>
    </div>
  </main>
</template>

<style scoped>
.detail {
  padding: 22px 0 60px;
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
.gallery {
  aspect-ratio: 16/10;
  border-radius: 16px;
  overflow: hidden;
  background: #cdd6cf;
  box-shadow: var(--shadow);
}
.gallery-main {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumbs {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.thumb {
  width: 84px;
  height: 60px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  padding: 0;
  background: none;
}
.thumb.on {
  border-color: var(--brand);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
