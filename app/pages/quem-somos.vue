<script setup lang="ts">
import type { AboutBlock, AboutStatBlock } from "~~/shared/models/about-page";
import type { PublicBroker } from "~~/shared/models/broker";
import { formatTenantAddress, hasStructuredAddress } from "~~/shared/utils/address";

const tenant = useTenant();
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true });
const { whatsappLink } = useContact();
const requestFetch = useRequestFetch();

/**
 * Recurso desligado: esta página não existe para esta imobiliária.
 *
 * 404, e não `noindex` como nas telas do portal — a diferença é o que a página
 * seria se respondesse 200. Um login `noindex` ainda serve a alguém; um "Quem
 * somos" de quem nunca escreveu nada é conteúdo fino no domínio de um cliente
 * real, com um `canonical` afirmando ser a versão autoritativa.
 *
 * `aboutEnabled` já vem EFETIVO do payload (recurso × interruptor), então isto
 * cobre tanto quem não contratou quanto quem despublicou.
 */
if (!tenant.value?.aboutEnabled) {
  throw createError({ statusCode: 404, statusMessage: "Página não encontrada." });
}

/**
 * Dois títulos, e a diferença é qual deles passa pelo `titleTemplate`.
 *
 * O `title` passa — o `app.vue` acrescenta "· <imobiliária>" a todo título — e
 * por isso este NÃO pode trazer o nome, senão sai duplicado na aba.
 *
 * `ogTitle` e o `name` do JSON-LD NÃO passam por template nenhum, e aí o nome
 * precisa estar escrito: sem ele o card do WhatsApp vira só "Quem somos", sem
 * dizer de quem. Foi por isso que a correção não pôde ser apagar a interpolação.
 */
const titulo = "Quem somos";
const tituloCompleto = computed(
  () => `Quem somos${tenant.value?.name ? " · " + tenant.value.name : ""}`,
);
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

/**
 * Moldura fixa: cabeçalho e fechamento que a página mostra SEMPRE, em volta dos
 * blocos livres do painel.
 *
 * Os blocos dependem do que cada imobiliária escreve, e o que faltava nas
 * páginas reais era justamente o que ninguém lembra de montar: um `<h1>` (o
 * primeiro "Título de seção" virava `h2`, e leitor de tela e buscador viam uma
 * página sem título), o CRECI — primeiro sinal de legitimidade que o comprador
 * procura — e um próximo passo no fim. O visitante chega aqui decidindo se
 * confia; terminar a leitura sem botão nenhum desperdiça exatamente esse momento.
 *
 * Tudo sai do cadastro do tenant, e não de um bloco "hero" editável: o nome da
 * empresa num segundo lugar desalinha do resto do site na primeira troca.
 */
const posicionamento = computed(() => tenant.value?.tagline || tenant.value?.heroSubtitle || "");
const cidadeUf = computed(() => [tenant.value?.city, tenant.value?.state].filter(Boolean).join("/"));
const endereco = computed(() =>
  tenant.value && hasStructuredAddress(tenant.value) ? formatTenantAddress(tenant.value) : "",
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
  title: titulo,
  description: () => description.value,
  ogTitle: () => tituloCompleto.value,
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
            name: tituloCompleto.value,
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

    <header class="qs-head">
      <h1>{{ tenant?.name || "Quem somos" }}</h1>
      <p v-if="posicionamento" class="qs-lede">{{ posicionamento }}</p>
      <p v-if="cidadeUf || tenant?.creci" class="qs-meta">
        <span v-if="cidadeUf"><AppIcon name="pin" /> {{ cidadeUf }}</span>
        <span v-if="tenant?.creci">CRECI {{ tenant.creci }}</span>
      </p>
    </header>

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
          :class="{ 'has-img': g.block.imageUrl }"
          :style="g.block.imageUrl ? { backgroundImage: `url(${supabaseRenderImage(g.block.imageUrl, { width: 1400, quality: 72 })})` } : undefined"
        >
          <div class="qs-banner-in">
            <h2 v-if="g.block.title">{{ g.block.title }}</h2>
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
          <p>{{ g.block.quote }}</p>
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

    <!-- Publicada sem blocos válidos (o painel hoje não deixa ligar assim, mas
         páginas publicadas antes da regra existem): nunca em branco. -->
    <p v-else class="qs-text">
      {{
        cidadeUf
          ? `Atuamos em ${cidadeUf} com atendimento próximo, do primeiro contato à assinatura.`
          : "Estamos preparando esta página. Fale com a gente pelos canais abaixo."
      }}
    </p>

    <section class="qs-close" aria-labelledby="qs-close-t">
      <h2 id="qs-close-t">Vamos conversar?</h2>
      <p v-if="endereco" class="qs-close-addr"><AppIcon name="pin" /> {{ endereco }}</p>
      <div class="qs-close-ctas">
        <a v-if="tenant?.whatsapp" class="btn-wa" :href="whatsappLink()" target="_blank" rel="noopener">
          <AppIcon name="wa" /> Falar no WhatsApp
        </a>
        <NuxtLink to="/" class="btn-detail">Ver imóveis</NuxtLink>
        <NuxtLink to="/quero-vender" class="btn-detail">Quero vender ou alugar</NuxtLink>
      </div>
    </section>
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
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.crumbs a {
  color: var(--brand);
}
.qs-heading {
  font-family: var(--font-display);
  font-size: clamp(22px, 4vw, 30px);
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin: 10px 0 0;
}
.qs-text {
  margin: 0;
  font-size: var(--fs-body);
  line-height: 1.7;
  color: var(--ink-soft);
  white-space: pre-line;
}
.qs-figure {
  margin: 0;
}
.qs-figure img {
  width: 100%;
  border-radius: var(--r-md);
  display: block;
}
.qs-figure figcaption {
  margin-top: 8px;
  font-size: var(--fs-label);
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
  border-radius: var(--r-md);
  padding: 16px;
  text-align: center;
}
.qs-stat strong {
  display: block;
  font-family: var(--font-display);
  font-size: var(--fs-title-lg);
  color: var(--brand);
}
.qs-stat span {
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
/* ---- moldura: cabeçalho ---- */
.qs-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qs-head h1 {
  font-family: var(--font-display);
  font-size: clamp(26px, 5vw, 38px);
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 0;
}
.qs-lede {
  margin: 0;
  font-size: var(--fs-title-sm);
  line-height: 1.5;
  color: var(--ink-soft);
  max-width: 60ch;
}
.qs-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.qs-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.qs-meta :deep(svg) {
  width: 14px;
  height: 14px;
}

/* ---- moldura: fechamento ---- */
.qs-close {
  margin-top: 12px;
  padding-top: 30px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qs-close h2 {
  font-family: var(--font-display);
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0;
}
.qs-close-addr {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--ink-soft);
  font-size: var(--fs-body);
}
.qs-close-addr :deep(svg) {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 3px;
}
.qs-close-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
/* `.btn-wa`/`.btn-detail` são os botões do card de imóvel: reusados para herdar
   o desenho de cada tema da vitrine. Lá eles dividem o card em partes iguais;
   aqui cada um tem o tamanho do texto, e quebram linha juntos no celular. */
.qs-close-ctas > * {
  flex: 1 1 200px;
  padding: 12px 18px;
}

/* ---- banner ---- */
.qs-banner {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: var(--r-lg);
  background-color: var(--ink);
  background-size: cover;
  background-position: center;
  padding: 44px 28px;
  display: flex;
  align-items: flex-end;
}
/* Com foto, o texto desce para o pé e deixa o alto da imagem aparecer. */
.qs-banner.has-img {
  padding-top: 180px;
}
/* Escurece só de baixo para cima, atrás do texto, e deixa o alto da foto como
   a pessoa escolheu — o meio-termo entre overlay sólido (apaga a imagem) e só
   sombra de texto (falha com foto clara). É um `::before`, e não uma segunda
   camada em `background-image`, porque o `style` inline do bloco define
   `background-image` e sobrescreveria a camada. */
.qs-banner::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(to top, rgb(0 0 0 / 0.65), rgb(0 0 0 / 0.25) 55%, transparent 80%);
}
.qs-banner-in {
  max-width: 46ch;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  /* A sombra sozinha não garantia 4.5:1: título branco sobre céu, parede ou
     fachada clara ficava ilegível. O contraste agora vem do gradiente em
     `.qs-banner`; a sombra fica só como acabamento. */
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}
.qs-banner h2 {
  margin: 0;
  color: #fff;
  font-family: var(--font-display);
  font-size: clamp(22px, 4vw, 32px);
  line-height: 1.2;
}
.qs-banner-cta {
  display: inline-flex;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  padding: 11px 20px;
  border-radius: var(--r-md);
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
  border-radius: var(--r-md);
  display: block;
}
.qs-split-text h2 {
  font-family: var(--font-display);
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0 0 10px;
}
.qs-split-text p {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--fs-body);
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
  border-radius: var(--r-md);
}

/* ---- depoimento ---- */
/* Sem a borda lateral colorida de antes: é assinatura de interface gerada, e
   as aspas grandes na cor da marca marcam a citação sem ela. */
.qs-testimonial {
  margin: 0;
  position: relative;
  padding: 26px 0 0;
}
.qs-testimonial::before {
  content: "“";
  position: absolute;
  top: -8px;
  left: -2px;
  font-family: var(--font-display);
  font-size: 64px;
  line-height: 1;
  color: var(--brand);
}
.qs-testimonial p {
  margin: 0;
  font-size: var(--fs-title-sm);
  line-height: 1.6;
  font-style: italic;
}
.qs-testimonial footer {
  margin-top: 10px;
  font-size: var(--fs-label);
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
  font-family: var(--font-display);
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
  font-size: var(--fs-body);
}
.qs-broker-creci {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.qs-broker p {
  margin: 4px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  line-height: 1.5;
}
</style>
