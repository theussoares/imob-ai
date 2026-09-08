<script setup lang="ts">
import type { AboutBlock, AboutStatBlock } from "~~/shared/models/about-page";

const tenant = useTenant();
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
const { whatsappLink } = useContact();

const titulo = computed(() => `Quem somos${tenant.value?.name ? " · " + tenant.value.name : ""}`);
const canonical = `${url.origin}/quem-somos`;

const blocks = computed<AboutBlock[]>(() => tenant.value?.aboutContent?.blocks ?? []);

/**
 * Agrupa "stat" consecutivos numa fileira (é o layout comum de "20 anos de
 * mercado · 500 imóveis vendidos"); os demais tipos renderizam um a um, na
 * ordem em que o painel salvou.
 */
type RenderGroup = { kind: "stats"; items: AboutStatBlock[] } | { kind: "block"; block: Exclude<AboutBlock, AboutStatBlock> };
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
  max-width: 780px;
  margin: 0 auto;
  padding: 22px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 22px;
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
</style>
