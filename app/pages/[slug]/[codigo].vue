<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import { PROPERTY_TYPE_LABELS } from "~~/shared/models/property";
import { propertyPath, propertySlug } from "~~/shared/utils/property-url";
import { propertyTitle } from "~~/shared/utils/property-title";

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

// Galeria controlada por índice (não por URL): é o que permite navegar
// anterior/próxima no lightbox e destacar a miniatura certa.
const activeIndex = ref(0);
const active = computed(() => p.images[activeIndex.value]?.url || "");
const hasMany = p.images.length > 1;

function go(delta: number) {
  const n = p.images.length;
  if (n < 2) return;
  activeIndex.value = (activeIndex.value + delta + n) % n; // circular
}

// Lightbox (tela cheia)
const lightboxOpen = ref(false);
const closeBtn = ref<HTMLButtonElement | null>(null);

async function openLightbox() {
  if (!active.value) return;
  lightboxOpen.value = true;
  await nextTick();
  closeBtn.value?.focus(); // acessibilidade: foco vai pro overlay
}
function closeLightbox() {
  lightboxOpen.value = false;
}

// Teclado só enquanto o lightbox está aberto.
onKeyStroke("Escape", () => lightboxOpen.value && closeLightbox());
onKeyStroke("ArrowRight", () => lightboxOpen.value && go(1));
onKeyStroke("ArrowLeft", () => lightboxOpen.value && go(-1));

// Arrastar/deslizar no mobile troca a imagem.
const lbImage = ref<HTMLElement | null>(null);
useSwipe(lbImage, {
  onSwipeEnd(_e, direction) {
    if (direction === "left") go(1);
    else if (direction === "right") go(-1);
  },
});

// Trava o scroll do fundo enquanto o overlay está aberto.
watch(lightboxOpen, (open) => {
  if (import.meta.client) {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }
});
onBeforeUnmount(() => {
  if (import.meta.client) document.documentElement.style.overflow = "";
});
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
          <button
            v-if="active"
            type="button"
            class="gallery"
            aria-label="Ampliar imagem em tela cheia"
            @click="openLightbox"
          >
            <img
              :src="active"
              :alt="p.title"
              class="gallery-main"
              fetchpriority="high"
              decoding="async"
            />
            <span class="gallery-zoom"><AppIcon name="expand" /></span>
          </button>
          <div v-if="hasMany" class="thumbs">
            <button
              v-for="(img, i) in p.images"
              :key="img.id"
              class="thumb"
              :class="{ on: activeIndex === i }"
              @click="activeIndex = i"
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
                <div v-if="p.suites" class="m-spec">
                  <AppIcon name="suite" /><b>{{ p.suites }}</b
                  ><small>{{ p.suites > 1 ? 'suítes' : 'suíte' }}</small>
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
            <LeadForm :property-code="p.code" source="property_page" />
          </div>
        </aside>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="lb">
        <div
          v-if="lightboxOpen"
          class="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de imagens"
          @click.self="closeLightbox"
        >
          <button ref="closeBtn" type="button" class="lb-close" aria-label="Fechar" @click="closeLightbox">
            <AppIcon name="close" />
          </button>

          <button
            v-if="hasMany"
            type="button"
            class="lb-nav lb-prev"
            aria-label="Imagem anterior"
            @click="go(-1)"
          >
            <AppIcon name="chevron-left" />
          </button>

          <img ref="lbImage" :src="active" :alt="p.title" class="lb-img" draggable="false" />

          <button
            v-if="hasMany"
            type="button"
            class="lb-nav lb-next"
            aria-label="Próxima imagem"
            @click="go(1)"
          >
            <AppIcon name="chevron-right" />
          </button>

          <div v-if="hasMany" class="lb-count">{{ activeIndex + 1 }} / {{ p.images.length }}</div>
        </div>
      </Transition>
    </Teleport>
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
  display: block;
  width: 100%;
  position: relative;
  aspect-ratio: 16/10;
  border-radius: 16px;
  overflow: hidden;
  background: #cdd6cf;
  box-shadow: var(--shadow);
  padding: 0;
  border: none;
  cursor: zoom-in;
}
.gallery-main {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.gallery:hover .gallery-main {
  transform: scale(1.03);
}
.gallery-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.gallery:hover .gallery-zoom,
.gallery:focus-visible .gallery-zoom {
  opacity: 1;
}
.gallery-zoom :deep(svg) {
  width: 20px;
  height: 20px;
}
/* Em telas de toque não há hover: mostra a dica de ampliar sempre. */
@media (hover: none) {
  .gallery-zoom {
    opacity: 1;
  }
}

/* ---- Lightbox / tela cheia ---- */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(8, 12, 10, 0.92);
  backdrop-filter: blur(2px);
}
.lb-img {
  max-width: min(1200px, 100%);
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: pan-y;
}
.lb-close,
.lb-nav {
  position: absolute;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
}
.lb-close:hover,
.lb-nav:hover {
  background: rgba(255, 255, 255, 0.25);
}
.lb-close:focus-visible,
.lb-nav:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.lb-close {
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
}
.lb-close :deep(svg) {
  width: 24px;
  height: 24px;
}
.lb-nav {
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
}
.lb-nav :deep(svg) {
  width: 30px;
  height: 30px;
}
.lb-prev {
  left: 16px;
}
.lb-next {
  right: 16px;
}
.lb-count {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
/* Fade/scale de entrada e saída do overlay. */
.lb-enter-active,
.lb-leave-active {
  transition: opacity 0.2s ease;
}
.lb-enter-from,
.lb-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .gallery-main,
  .gallery:hover .gallery-main,
  .lb-enter-active,
  .lb-leave-active {
    transition: none;
  }
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
