<script setup lang="ts">
import type { AboutBlock, AboutGalleryImage } from "~~/shared/models/about-page";
import type { PublicBroker } from "~~/shared/models/broker";
import { groupAboutBlocks } from "~~/shared/utils/about-render";

/**
 * Os blocos livres do "Quem somos", como o visitante vê.
 *
 * Saiu de `pages/quem-somos.vue` para o painel montar a MESMA coisa ao lado do
 * formulário: pré-visualizar com o componente real, e não com um iframe de
 * `/quem-somos?preview`, dispensa rota de rascunho, autenticação dentro do
 * iframe e o "salve para ver" que fazia a pessoa publicar para conferir.
 *
 * Por isso o responsivo aqui é por CONTAINER, não por viewport: no painel o
 * componente vive numa coluna de ~500px numa tela de 1400px, e uma media query
 * desenharia o layout de desktop espremido. `container-type` na raiz faz a
 * pré-visualização quebrar como o celular quebraria.
 *
 * A moldura (cabeçalho com h1/CRECI e o fechamento com contato) NÃO mora aqui:
 * ela é da página, lida do cadastro, e o painel não a edita.
 */
const props = defineProps<{
  blocks: AboutBlock[];
  brokers: PublicBroker[];
}>();

const groups = computed(() => groupAboutBlocks(props.blocks));

/**
 * Até 8 corretores, grade: carrossel esconde gente atrás de rolagem lateral, e
 * a equipe é o coração de um "Quem somos". Acima disso a grade vira uma parede
 * de rostos, e aí o carrossel volta. No celular a grade já rola na horizontal
 * pelo CSS (ver `.qs-team-grid`).
 */
const EQUIPE_EM_GRADE_ATE = 8;
const ScrollCarousel = resolveComponent("ScrollCarousel");
const equipeEmCarrossel = computed(() => props.brokers.length > EQUIPE_EM_GRADE_ATE);

function isInternalHref(href: string): boolean {
  return href.startsWith("/");
}

// Uma tela cheia para a página toda: só uma galeria fica aberta por vez.
const lightbox = ref<{ abrir: (i: number) => void } | null>(null);
const fotosAbertas = ref<{ src: string; srcset: string; alt: string }[]>([]);
function abrirFoto(images: AboutGalleryImage[], i: number) {
  fotosAbertas.value = images.map((img) => ({
    src: supabaseRenderImage(img.url, { width: 1600, height: 3200, quality: 80 }),
    srcset: supabaseSrcset(img.url, [960, 1600], 80),
    alt: img.alt,
  }));
  lightbox.value?.abrir(i);
}
</script>

<template>
  <div class="qs-blocks">
    <template v-for="(g, i) in groups" :key="i">
      <h2 v-if="g.kind === 'block' && g.block.type === 'heading'" class="qs-heading qs-narrow qs-secao">
        {{ g.block.text }}
      </h2>

      <p v-else-if="g.kind === 'block' && g.block.type === 'text'" class="qs-text qs-narrow">
        {{ g.block.body }}
      </p>

      <!--
        Proporção fixa + `object-fit: cover` em toda foto: a API de imagem só
        reduz (`resize=contain`), nunca informa a proporção de antemão, e sem
        largura/altura reservadas o texto abaixo pulava quando a foto chegava.
        O custo é recortar a borda de uma foto fora da proporção — aceito numa
        página institucional, onde a foto ilustra, não documenta.
      -->
      <figure v-else-if="g.kind === 'block' && g.block.type === 'image'" class="qs-figure">
        <img
          :src="supabaseRenderImage(g.block.url, { width: 1200, height: 2400, quality: 78 })"
          :srcset="supabaseSrcset(g.block.url, [640, 1200], 78) || undefined"
          sizes="(min-width: 1240px) 1200px, 100vw"
          width="1200"
          height="800"
          :alt="g.block.alt || ''"
          loading="lazy"
        />
        <figcaption v-if="g.block.caption">{{ g.block.caption }}</figcaption>
      </figure>

      <!--
        Faixa, não cartões: três cartões iguais em fileira é o desenho genérico
        de qualquer landing, e aqui os números são a prova mais forte da página.
        Sem contador animado — página de confiança, não de campanha.
      -->
      <ul v-else-if="g.kind === 'stats'" class="qs-stats">
        <li v-for="(s, j) in g.items" :key="j" class="qs-stat">
          <strong>{{ s.value }}</strong>
          <span>{{ s.label }}</span>
        </li>
      </ul>

      <section
        v-else-if="g.kind === 'block' && g.block.type === 'banner'"
        class="qs-banner"
        :class="{ 'has-img': g.block.imageUrl }"
        :style="g.block.imageUrl ? { backgroundImage: `url(${supabaseRenderImage(g.block.imageUrl, { width: 1400, height: 2800, quality: 72 })})` } : undefined"
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
        :class="{ 'img-left': g.block.imagePosition === 'left', 'sem-img': !g.block.imageUrl }"
      >
        <img
          v-if="g.block.imageUrl"
          :src="supabaseRenderImage(g.block.imageUrl, { width: 720, height: 1440, quality: 78 })"
          :srcset="supabaseSrcset(g.block.imageUrl, [480, 720], 78) || undefined"
          sizes="(min-width: 1240px) 590px, (min-width: 720px) 50vw, 100vw"
          width="720"
          height="540"
          :alt="g.block.imageAlt || ''"
          loading="lazy"
        />
        <div class="qs-split-text">
          <h2 v-if="g.block.title">{{ g.block.title }}</h2>
          <p v-if="g.block.body">{{ g.block.body }}</p>
        </div>
      </section>

      <section v-else-if="g.kind === 'block' && g.block.type === 'values'" class="qs-values qs-secao">
        <h2>{{ g.block.title || "Como trabalhamos" }}</h2>
        <ul>
          <li v-for="(v, j) in g.block.items" :key="j">
            <h3>{{ v.title }}</h3>
            <p v-if="v.body">{{ v.body }}</p>
          </li>
        </ul>
      </section>

      <ScrollCarousel v-else-if="g.kind === 'block' && g.block.type === 'gallery'" label="Galeria de fotos" class="qs-gallery">
        <button
          v-for="(img, j) in g.block.images"
          :key="j"
          type="button"
          class="qs-gallery-item"
          :aria-label="`Ampliar ${img.alt || `foto ${j + 1}`}`"
          @click="abrirFoto(g.block.images, j)"
        >
          <img
            :src="supabaseRenderImage(img.url, { width: 440, height: 880, quality: 75 })"
            width="220"
            height="220"
            alt=""
            loading="lazy"
          />
        </button>
      </ScrollCarousel>

      <!--
        Grade, e o complemento ("comprou um apartamento no Centro em 2025") com
        mais peso que antes: é ele que faz o depoimento parecer de gente real.
        Um depoimento só não estica por 1200px: fica na largura de leitura.
      -->
      <div v-else-if="g.kind === 'testimonials'" class="qs-testimonials" :class="{ solo: g.items.length === 1 }">
        <blockquote v-for="(t, j) in g.items" :key="j" class="qs-testimonial">
          <p>{{ t.quote }}</p>
          <footer>
            <strong>{{ t.authorName }}</strong>
            <span v-if="t.authorRole">{{ t.authorRole }}</span>
          </footer>
        </blockquote>
      </div>

      <div v-else-if="g.kind === 'block' && g.block.type === 'logos'" class="qs-logos">
        <img
          v-for="(item, j) in g.block.items"
          :key="j"
          :src="supabaseRenderImage(item.url, { width: 240, height: 120, quality: 80 })"
          width="140"
          height="40"
          :alt="item.alt || ''"
          loading="lazy"
        />
      </div>

      <section v-else-if="g.kind === 'block' && g.block.type === 'team' && brokers.length" class="qs-team qs-secao">
        <h2>{{ g.block.title || "Nossa equipe" }}</h2>
        <component
          :is="equipeEmCarrossel ? ScrollCarousel : 'div'"
          v-bind="equipeEmCarrossel ? { label: g.block.title || 'Nossa equipe' } : {}"
          :class="{ 'qs-team-grid': !equipeEmCarrossel }"
        >
          <article v-for="broker in brokers" :key="broker.id" class="qs-broker">
            <div class="qs-broker-photo">
              <img
                v-if="broker.photoUrl"
                :src="supabaseRenderImage(broker.photoUrl, { width: 480, height: 960, quality: 78 })"
                :srcset="supabaseSrcset(broker.photoUrl, [240, 480], 78) || undefined"
                sizes="240px"
                width="240"
                height="300"
                :alt="broker.name"
                loading="lazy"
              />
              <AppIcon v-else name="user" />
            </div>
            <strong>{{ broker.name }}</strong>
            <span v-if="broker.creci" class="qs-broker-creci">CRECI {{ broker.creci }}</span>
            <p v-if="broker.bio">{{ broker.bio }}</p>
          </article>
        </component>
      </section>
    </template>

    <ImageLightbox ref="lightbox" :images="fotosAbertas" label="Galeria de fotos" />
  </div>
</template>

<style scoped>
.qs-blocks {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
/* Texto corrido na largura de leitura (60–75 caracteres); banner, galeria,
   equipe e números usam a largura cheia. Numa coluna só de 920px o parágrafo
   passava de 100 caracteres por linha e as fotos não respiravam. */
.qs-narrow {
  max-width: 68ch;
}
/* Ritmo por seção: mais ar ANTES do que abre uma seção que entre blocos da
   mesma seção. Espaço igual entre todo par de blocos apagava a hierarquia. */
.qs-secao:not(:first-child) {
  margin-top: 24px;
}
.qs-heading + * {
  margin-top: -8px;
}

.qs-heading {
  font-family: var(--font-display);
  font-size: clamp(22px, 4vw, 30px);
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin: 0;
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
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: var(--r-md);
}
.qs-figure figcaption {
  margin-top: 8px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}

/* ---- números ---- */
.qs-stats {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 16px;
}
.qs-stat strong {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(30px, 6cqi, 48px);
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--brand);
}
.qs-stat span {
  display: block;
  margin-top: 6px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  line-height: 1.4;
}
@container (min-width: 560px) {
  .qs-stats {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0;
  }
  .qs-stat {
    padding: 0 24px;
  }
  .qs-stat:first-child {
    padding-left: 0;
  }
  .qs-stat + .qs-stat {
    border-left: 1px solid var(--line);
  }
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
  /* O contraste vem do gradiente acima; a sombra fica só como acabamento. */
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
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--r-md);
}
.qs-split.sem-img .qs-split-text {
  max-width: 68ch;
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
@container (min-width: 720px) {
  .qs-split:not(.sem-img) {
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .qs-split.img-left {
    direction: rtl;
  }
  .qs-split.img-left > * {
    direction: ltr;
  }
}

/* ---- como trabalhamos ---- */
.qs-values h2,
.qs-team h2 {
  font-family: var(--font-display);
  font-size: clamp(20px, 3.5vw, 26px);
  margin: 0 0 18px;
}
.qs-values ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 24px;
}
/* Fio no topo, na cor da marca: marca cada compromisso sem virar cartão. */
.qs-values li {
  border-top: 2px solid var(--brand);
  padding-top: 12px;
}
.qs-values h3 {
  margin: 0;
  font-size: var(--fs-title-sm);
  line-height: 1.3;
}
.qs-values p {
  margin: 6px 0 0;
  color: var(--ink-soft);
  font-size: var(--fs-ui);
  line-height: 1.55;
}

/* ---- galeria ---- */
.qs-gallery-item {
  flex: none;
  padding: 0;
  border: none;
  background: none;
  border-radius: var(--r-md);
  cursor: zoom-in;
}
.qs-gallery-item img {
  display: block;
  width: 220px;
  height: 220px;
  object-fit: cover;
  border-radius: var(--r-md);
}

/* ---- depoimentos ---- */
.qs-testimonials {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 20px;
}
.qs-testimonials.solo {
  max-width: 68ch;
}
/* Sem a borda lateral colorida: é assinatura de interface gerada, e as aspas
   grandes na cor da marca marcam a citação sem ela. */
.qs-testimonial {
  margin: 0;
  position: relative;
  padding: 26px 0 0;
  display: flex;
  flex-direction: column;
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
  font-size: var(--fs-body);
  line-height: 1.65;
}
.qs-testimonial footer {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--fs-label);
}
.qs-testimonial footer span {
  color: var(--ink);
  font-weight: 600;
  opacity: 0.8;
}

/* ---- logos/selos ---- */
.qs-logos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
}
.qs-logos img {
  width: auto;
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

/* ---- equipe ---- */
.qs-team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 24px 20px;
}
/* No celular a grade vira faixa rolável: duas colunas de rostos de 150px
   empurrariam o resto da página para longe, e deslizar é o gesto natural ali. */
@container (max-width: 559px) {
  .qs-team-grid {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: 62%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 6px;
  }
  .qs-team-grid > * {
    scroll-snap-align: start;
  }
}
.qs-broker {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* ScrollCarousel (equipe grande) precisa de largura fixa por card. */
.qs-team :deep(.sc-track) .qs-broker {
  width: 200px;
  flex: none;
}
/* 4:5 em vez do círculo de 108px: rosto de quem vai atender é o conteúdo
   principal da seção, não um avatar de comentário. */
.qs-broker-photo {
  aspect-ratio: 4 / 5;
  margin-bottom: 8px;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface);
  display: grid;
  place-items: center;
  color: var(--ink-soft);
}
.qs-broker-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.qs-broker-photo :deep(svg) {
  width: 40px;
  height: 40px;
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
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
