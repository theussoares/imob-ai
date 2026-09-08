<script setup lang="ts">
import type { AboutBlock, AboutStatBlock } from "~~/shared/models/about-page";
import type { PublicBroker } from "~~/shared/models/broker";

const tenant = useTenant();
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
const { whatsappLink } = useContact();
const requestFetch = useRequestFetch();

const titulo = computed(() => `Quem somos${tenant.value?.name ? " · " + tenant.value.name : ""}`);
const canonical = `${url.origin}/quem-somos`;

const blocks = computed<AboutBlock[]>(() => tenant.value?.aboutContent?.blocks ?? []);

/**
 * Agrupa "stat" consecutivos numa fileira (é o layout comum de "20 anos de
 * mercado · 500 imóveis vendidos"); os demais tipos renderizam um a um, na
 * ordem em que o painel salvou.
 */
type RenderGroup =
  | { kind: "stats"; items: AboutStatBlock[] }
  | { kind: "block"; block: Exclude<AboutBlock, AboutStatBlock> };
const groups = computed<RenderGroup[]>(() => {
  const out: RenderGroup[] = [];
  for (const b of blocks.value) {
    if (b.type === "stat") {
      const last = out[out.length - 1];
      if (last?.kind === "stats") last.items.push(b);
      else out.push({ kind: "stats", items: [b] });
    } else {
      out.push({ kind: "block", block: b });
    }
  }
  return out;
});

// Corretores só são buscados quando a página realmente tem um bloco "equipe" —
// sem isto, toda visita a "/quem-somos" pagaria a requisição à toa.
const { data: teamBrokers } = await useAsyncData(
  "quem-somos:brokers",
  () => (blocks.value.some((b) => b.type === "team") ? requestFetch<PublicBroker[]>("/api/brokers") : Promise.resolve([])),
  { default: () => [] as PublicBroker[] },
);

function isInternalHref(href: string): boolean {
  return href.startsWith("/");
}

const firstText = computed(() => blocks.value.find((b): b is Extract<AboutBlock, { type: "text" }> => b.type === "text"));
const description = computed(() => {
  const texto = firstText.value?.body?.trim();
  if (texto) return texto.length > 160 ? texto.slice(0, 157) + "..." : texto;
  return (
    tenant.value?.heroSubtitle ||
    tenant.value?.tagline ||
    `Conheça ${tenant.value?.name || "a nossa imobiliária"}${tenant.value?.city ? ` em ${tenant.value.city}` : ""}.`
  );
});

useSeoMeta({
  title: () => titulo.value,
  description: () => description.value,
  ogTitle: () => titulo.value,
  ogType: "website",
});

useHead(() => ({
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: url.origin + "/" },
              { "@type": "ListItem", position: 2, name: "Quem somos", item: canonical },
            ],
          },
          {
            "@type": "AboutPage",
            url: canonical,
            name: titulo.value,
            description: description.value,
            mainEntity: tenant.value?.name
              ? { "@type": "RealEstateAgent", name: tenant.value.name, url: url.origin }
              : undefined,
          },
        ],
      }),
    },
  ],
}));
</script>

<template>
  <div class="qs">
    <nav class="crumbs" aria-label="Trilha de navegação">
      <NuxtLink to="/">Início</NuxtLink>
      <span aria-hidden="true">›</span>
      <span aria-current="page">Quem somos</span>
    </nav>

    <template v-if="groups.length">
      <template v-for="(g, i) in groups" :key="i">
        <h2 v-if="g.kind === 'block' && g.block.type === 'heading'" class="qs-heading">
          {{ g.block.text }}
        </h2>

        <p v-else-if="g.kind === 'block' && g.block.type === 'text'" class="qs-text">
          {{ g.block.body }}
        </p>

        <figure v-else-if="g.kind === 'block' && g.block.type === 'image'" class="qs-figure">
          <img
            :src="supabaseRenderImage(g.block.url, { width: 960, quality: 78 })"
            :alt="g.block.alt || ''"
            loading="lazy"
          />
          <figcaption v-if="g.block.caption">{{ g.block.caption }}</figcaption>
        </figure>

        <div v-else-if="g.kind === 'stats'" class="qs-stats">
          <div v-for="(s, j) in g.items" :key="j" class="qs-stat">
            <strong>{{ s.value }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>

        <section
          v-else-if="g.kind === 'block' && g.block.type === 'banner'"
          class="qs-banner"
          :style="g.block.imageUrl ? { backgroundImage: `url(${supabaseRenderImage(g.block.imageUrl, { width: 1400, quality: 72 })})` } : undefined"
        >
          <div class="qs-banner-in">
            <h2>{{ g.block.title }}</h2>
            <NuxtLink v-if="g.block.ctaLabel && isInternalHref(g.block.ctaHref)" class="qs-banner-cta" :to="g.block.ctaHref">
              {{ g.block.ctaLabel }}
            </NuxtLink>
            <a v-else-if="g.block.ctaLabel" class="qs-banner-cta" :href="g.block.ctaHref" target="_blank" rel="noopener">
              {{ g.block.ctaLabel }}
            </a>
          </div>
        </section>

        <section
          v-else-if="g.kind === 'block' && g.block.type === 'split'"
          class="qs-split"
          :class="{ 'img-left': g.block.imagePosition === 'left' }"
        >
          <img
            v-if="g.block.imageUrl"
            :src="supabaseRenderImage(g.block.imageUrl, { width: 640, quality: 78 })"
            :alt="g.block.imageAlt || ''"
            loading="lazy"
          />
          <div class="qs-split-text">
            <h2 v-if="g.block.title">{{ g.block.title }}</h2>
            <p v-if="g.block.body">{{ g.block.body }}</p>
          </div>
        </section>

        <ScrollCarousel v-else-if="g.kind === 'block' && g.block.type === 'gallery'" label="Galeria de fotos" class="qs-gallery">
          <img
            v-for="(img, j) in g.block.images"
            :key="j"
            class="qs-gallery-img"
            :src="supabaseRenderImage(img.url, { width: 480, height: 480, quality: 75 })"
            :alt="img.alt || ''"
            loading="lazy"
          />
        </ScrollCarousel>

        <blockquote v-else-if="g.kind === 'block' && g.block.type === 'testimonial'" class="qs-testimonial">
          <p>“{{ g.block.quote }}”</p>
          <footer>
            {{ g.block.authorName }}<span v-if="g.block.authorRole"> · {{ g.block.authorRole }}</span>
          </footer>
        </blockquote>

        <div v-else-if="g.kind === 'block' && g.block.type === 'logos'" class="qs-logos">
          <img
            v-for="(item, j) in g.block.items"
            :key="j"
            :src="supabaseRenderImage(item.url, { width: 240, height: 120, quality: 80 })"
            :alt="item.alt || ''"
            loading="lazy"
          />
        </div>

        <section v-else-if="g.kind === 'block' && g.block.type === 'team' && teamBrokers?.length" class="qs-team">
          <h2>{{ g.block.title || "Nossa equipe" }}</h2>
          <ScrollCarousel :label="g.block.title || 'Nossa equipe'">
            <article v-for="broker in teamBrokers" :key="broker.id" class="qs-broker">
              <div class="qs-broker-photo">
                <img
                  v-if="broker.photoUrl"
                  :src="supabaseRenderImage(broker.photoUrl, { width: 200, height: 200, quality: 78 })"
                  :alt="broker.name"
                  loading="lazy"
                />
                <AppIcon v-else name="home" />
              </div>
              <strong>{{ broker.name }}</strong>
              <span v-if="broker.creci" class="qs-broker-creci">CRECI {{ broker.creci }}</span>
              <p v-if="broker.bio">{{ broker.bio }}</p>
            </article>
          </ScrollCarousel>
        </section>
      </template>
    </template>

    <!-- Página existe mas o painel ainda não tem blocos: nunca em branco. -->
    <div v-else class="qs-empty">
      <h1>{{ tenant?.name || "Sobre nós" }}</h1>
      <p>
        {{
          tenant?.city
            ? `Atuamos em ${tenant.city}${tenant.state ? "/" + tenant.state : ""} com atendimento próximo, do primeiro contato à assinatura.`
            : "Estamos preparando esta página. Fale com a gente pelos canais abaixo."
        }}
      </p>
      <a v-if="tenant?.whatsapp" class="qs-cta" :href="whatsappLink()" target="_blank" rel="noopener">
        <AppIcon name="wa" /> Falar no WhatsApp
      </a>
    </div>
  </div>
</template>

<style scoped>
.qs {
  max-width: 920px;
  margin: 0 auto;
  padding: 22px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 30px;
}
.crumbs {
  display: flex;
  gap: 7px;
  font-size: 13.5px;
  color: var(--ink-soft);
}
.crumbs a {
  color: var(--brand);
}
.qs-heading {
  font-family: "Space Grotesk", sans-serif;
  font-size: clamp(22px, 4vw, 30px);
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin: 10px 0 0;
}
.qs-text {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-soft);
  white-space: pre-line;
}
.qs-figure {
  margin: 0;
}
.qs-figure img {
  width: 100%;
  border-radius: 14px;
  display: block;
}
.qs-figure figcaption {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ink-soft);
  text-align: center;
}
.qs-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.qs-stat {
  flex: 1 1 140px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}
.qs-stat strong {
  display: block;
  font-family: "Space Grotesk", sans-serif;
  font-size: 26px;
  color: var(--brand);
}
.qs-stat span {
  font-size: 13px;
  color: var(--ink-soft);
}
.qs-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}
.qs-empty h1 {
  font-family: "Space Grotesk", sans-serif;
  font-size: clamp(24px, 5vw, 34px);
  margin: 0;
}
.qs-empty p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.6;
  max-width: 60ch;
}
.qs-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--wa);
  color: #fff;
  font-weight: 600;
  padding: 11px 18px;
  border-radius: 10px;
  text-decoration: none;
}

/* ---- banner ---- */
.qs-banner {
  border-radius: 18px;
  background-color: var(--ink);
  background-size: cover;
  background-position: center;
  padding: 44px 28px;
  display: flex;
}
.qs-banner-in {
  max-width: 46ch;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  /* Sombra de texto em vez de overlay sólido: funciona com ou sem imagem de
     fundo, e não escurece uma imagem que a pessoa escolheu a dedo. */
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.55);
}
.qs-banner h2 {
  margin: 0;
  color: #fff;
  font-family: "Space Grotesk", sans-serif;
  font-size: clamp(22px, 4vw, 32px);
  line-height: 1.2;
}
.qs-banner-cta {
  display: inline-flex;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  padding: 11px 20px;
  border-radius: 10px;
  text-decoration: none;
  text-shadow: none;
}

/* ---- split (texto + imagem) ---- */
.qs-split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  align-items: center;
}
.qs-split img {
  width: 100%;
  border-radius: 14px;
  display: block;
}
.qs-split-text h2 {
  font-family: "Space Grotesk", sans-serif;
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0 0 10px;
}
.qs-split-text p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 15.5px;
  line-height: 1.7;
  white-space: pre-line;
}
@media (min-width: 720px) {
  .qs-split {
    grid-template-columns: 1fr 1fr;
  }
  .qs-split.img-left {
    direction: rtl;
  }
  .qs-split.img-left > * {
    direction: ltr;
  }
}

/* ---- galeria ---- */
.qs-gallery-img {
  width: 220px;
  height: 220px;
  object-fit: cover;
  border-radius: 12px;
}

/* ---- depoimento ---- */
.qs-testimonial {
  margin: 0;
  border-left: 3px solid var(--brand);
  padding: 4px 0 4px 20px;
}
.qs-testimonial p {
  margin: 0;
  font-size: 18px;
  line-height: 1.6;
  font-style: italic;
}
.qs-testimonial footer {
  margin-top: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
}

/* ---- logos/selos ---- */
.qs-logos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
}
.qs-logos img {
  height: 40px;
  max-width: 140px;
  object-fit: contain;
  /* Preto e branco até passar o mouse: fileira de selo vira "papel timbrado"
     colorido demais quando cada logo tem cor própria; assim ficam discretos e
     em pé de igualdade. */
  filter: grayscale(1);
  opacity: 0.75;
  transition:
    filter 0.15s,
    opacity 0.15s;
}
.qs-logos img:hover {
  filter: none;
  opacity: 1;
}

/* ---- equipe (dinâmico) ---- */
.qs-team h2 {
  font-family: "Space Grotesk", sans-serif;
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0 0 16px;
}
.qs-broker {
  width: 200px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.qs-broker-photo {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface);
  border: 1.5px solid var(--line);
  display: grid;
  place-items: center;
  color: var(--ink-soft);
}
.qs-broker-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.qs-broker strong {
  font-size: 15px;
}
.qs-broker-creci {
  font-size: 12px;
  color: var(--ink-soft);
}
.qs-broker p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.5;
}
</style>
