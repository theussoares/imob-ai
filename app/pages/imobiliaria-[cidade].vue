<script setup lang="ts">
import type { PropertyCard } from "~~/shared/models/property";
import { formatTenantAddress, hasStructuredAddress } from "~~/shared/utils/address";
import { allCategories, categoryLabel, categorySlug, qualifyingCategories } from "~~/shared/utils/category";
import { hubCorresponde, hubDescricao, hubLugar, hubMarca, hubPath, hubTitulo } from "~~/shared/utils/hub-local";
import { qualifyingNeighborhoods } from "~~/shared/utils/neighborhood";
import { realEstateAgentJsonLd } from "~~/shared/utils/tenant-jsonld";

/**
 * Hub local: "Imobiliária em <cidade> - <UF>" (plano de SEO local, 08/10).
 *
 * Existe para a busca que a marca não cobre: quem digita "imobiliária em Três
 * Lagoas" não conhece o nome da imobiliária. A home responde a quem já a
 * conhece, e o "Quem somos" é institucional e opcional (recurso `about`) — nenhum
 * dos dois diz, no título e no H1, QUE é uma imobiliária e ONDE.
 *
 * A cidade vem do cadastro do tenant e é a ÚNICA que a rota aceita: sem cidade,
 * ou com outro segmento, 404. `/imobiliaria-qualquer-coisa` respondendo 200
 * seria conteúdo duplicado infinito, cada um com canonical afirmando ser a
 * versão autoritativa.
 *
 * Não é página fina: o texto sai do cadastro, mas os blocos de baixo são o
 * catálogo REAL (contagens, destaques, bairros com imóveis suficientes). A
 * mesma regra de piso das categorias vale para o que ela linka.
 */
const route = useRoute();
const tenant = useTenant();
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
const { whatsappLink } = useContact();

const city = tenant.value?.city?.trim() || "";
if (!city || !hubCorresponde(city, String(route.params.cidade))) {
  throw createError({ statusCode: 404, statusMessage: "Página não encontrada." });
}

const { data: properties } = await useCatalogCards();
const list = computed(() => properties.value ?? []);

const state = computed(() => tenant.value?.state?.trim() || "");
const lugar = computed(() => hubLugar(city, state.value));
const titulo = computed(() => hubTitulo(city, state.value));
const name = computed(() => tenant.value?.name || "Nossa imobiliária");
// Textos corridos usam a marca; título, og e JSON-LD usam o nome completo.
const marca = computed(() => hubMarca(name.value));
const canonical = `${url.origin}${hubPath(city)}`;

const description = computed(() =>
  hubDescricao({ name: name.value, city, state: state.value, imoveis: list.value.length }),
);

/**
 * `title` passa pelo `titleTemplate` do app ("· <imobiliária>"): o nome NÃO vai
 * aqui, senão sai duplicado na aba. `ogTitle` não passa por template nenhum, e
 * sem o nome o card do WhatsApp diria só "Imobiliária em <cidade>".
 */
useSeoMeta({
  title: () => titulo.value,
  description: () => description.value,
  ogTitle: () => `${titulo.value} · ${name.value}`,
  ogDescription: () => description.value,
  ogType: "website",
});

const venda = computed(() => list.value.filter((p) => p.purpose === "venda"));
const aluguel = computed(() => list.value.filter((p) => p.purpose === "aluguel"));

// Links para as categorias que existem de verdade: pretensão sempre (a página
// existe mesmo desindexada), tipo só com imóveis suficientes — o mesmo critério
// da home, para não linkar página que responde 404.
const categorias = computed(() => {
  const pretensoes = allCategories().filter((c) => c.type === null);
  const tipos = qualifyingCategories(list.value).filter((c) => c.type !== null);
  return [...pretensoes, ...tipos].map((c) => ({
    href: `/imoveis/${categorySlug(c)}`,
    label: `${categoryLabel(c)} em ${city}`,
  }));
});
const bairros = computed(() =>
  qualifyingNeighborhoods(list.value).map((h) => ({ href: `/imoveis/bairro/${h.slug}`, label: h.label })),
);

/** Destaques primeiro: é o que a imobiliária escolheu mostrar. */
const destaques = computed<PropertyCard[]>(() =>
  [...list.value].sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 6),
);

const endereco = computed(() =>
  tenant.value && hasStructuredAddress(tenant.value) ? formatTenantAddress(tenant.value) : "",
);

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
              { "@type": "ListItem", position: 2, name: titulo.value, item: canonical },
            ],
          },
          {
            "@type": "WebPage",
            url: canonical,
            name: `${titulo.value} · ${name.value}`,
            description: description.value,
            // A mesma entidade (e o mesmo `@id`) da home: o buscador entende
            // que esta página fala da empresa que ele já conhece.
            about: tenant.value?.name ? realEstateAgentJsonLd(tenant.value, url.origin) : undefined,
          },
        ],
      }),
    },
  ],
}));
</script>

<template>
  <div class="hub">
    <nav class="crumbs" aria-label="Trilha de navegação">
      <NuxtLink to="/">Início</NuxtLink>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{{ titulo }}</span>
    </nav>

    <header class="hub-head">
      <h1>{{ titulo }}</h1>
      <p class="hub-lede">
        {{ marca }} é uma imobiliária em {{ lugar }}, com atendimento em compra, venda e locação de imóveis.
        <!-- Sem `tagline`: o da OLMI ("Compra · Venda · Locação — Três Lagoas/MS")
             repetiria a frase de cima. O subtítulo do hero é texto de apresentação. -->
        <template v-if="tenant?.heroSubtitle">{{ tenant.heroSubtitle }}</template>
      </p>
      <p v-if="tenant?.creci" class="hub-meta">CRECI {{ tenant.creci }}</p>
    </header>

    <section aria-labelledby="hub-encontre">
      <h2 id="hub-encontre">Encontre seu imóvel em {{ city }}</h2>
      <p v-if="list.length" class="hub-p">
        São {{ list.length }} {{ list.length === 1 ? "imóvel disponível" : "imóveis disponíveis" }} agora<template
          v-if="venda.length && aluguel.length"
          >: {{ venda.length }} à venda e {{ aluguel.length }} para alugar</template
        >.
      </p>
      <nav class="hub-links" aria-label="Categorias de imóveis">
        <NuxtLink v-for="c in categorias" :key="c.href" :to="c.href">{{ c.label }}</NuxtLink>
      </nav>
    </section>

    <section v-if="destaques.length" aria-labelledby="hub-destaques">
      <h2 id="hub-destaques">Imóveis em destaque</h2>
      <div class="hub-grid">
        <PropertyCard v-for="(p, i) in destaques" :key="p.id" :property="p" :index="i" />
      </div>
    </section>

    <section v-if="bairros.length" aria-labelledby="hub-bairros">
      <h2 id="hub-bairros">Imóveis por bairro</h2>
      <nav class="hub-links" aria-label="Bairros">
        <NuxtLink v-for="b in bairros" :key="b.href" :to="b.href">Imóveis em {{ b.label }}</NuxtLink>
      </nav>
    </section>

    <section aria-labelledby="hub-vender">
      <h2 id="hub-vender">Venda ou alugue seu imóvel com a {{ marca }}</h2>
      <p class="hub-p">
        Tem um imóvel em {{ city }} para vender ou alugar? Conte o que você tem e a equipe retorna para combinar os
        próximos passos.
      </p>
      <NuxtLink to="/quero-vender" class="btn-detail hub-cta">Quero vender ou alugar</NuxtLink>
    </section>

    <section class="hub-close" aria-labelledby="hub-fale">
      <h2 id="hub-fale">Fale com a {{ marca }}</h2>
      <p v-if="endereco" class="hub-p">{{ endereco }}</p>
      <div class="hub-ctas">
        <a v-if="tenant?.whatsapp" class="btn-wa" :href="whatsappLink()" target="_blank" rel="noopener">
          <AppIcon name="wa" /> Falar no WhatsApp
        </a>
        <NuxtLink to="/" class="btn-detail">Ver todos os imóveis</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hub {
  max-width: 1200px;
  margin: 0 auto;
  padding: 22px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 34px;
}
.crumbs {
  display: flex;
  gap: 7px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.crumbs a {
  color: var(--brand);
}
.hub-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hub-head h1 {
  font-family: var(--font-display);
  font-size: clamp(26px, 5vw, 38px);
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 0;
}
.hub-lede {
  margin: 0;
  font-size: var(--fs-title-sm);
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: 62ch;
}
.hub-meta {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
section h2 {
  font-family: var(--font-display);
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0 0 12px;
}
.hub-p {
  margin: 0 0 14px;
  max-width: 62ch;
  font-size: var(--fs-body);
  line-height: 1.7;
  color: var(--ink-soft);
}
.hub-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
}
.hub-links a {
  padding: 8px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: 999px;
  color: var(--brand);
  font-weight: 600;
  font-size: var(--fs-label);
  text-decoration: none;
}
.hub-links a:hover {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.hub-cta {
  display: inline-block;
  padding: 12px 18px;
}
.hub-close {
  padding-top: 30px;
  border-top: 1px solid var(--line);
}
.hub-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
/* Botões do card de imóvel reusados para herdar o desenho de cada tema; aqui
   cada um tem o tamanho do texto e quebram linha juntos no celular. */
.hub-ctas > * {
  flex: 1 1 200px;
  padding: 12px 18px;
}
</style>
