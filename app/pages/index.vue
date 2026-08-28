<script setup lang="ts">
import type { PropertyCard } from "~~/shared/models/property";
import { createCatalogFilters } from "~/composables/useCatalog";
import {
  buildSearchLeadMessage,
  searchCriteriaParts,
} from "~~/shared/utils/search-lead";
import { seekingTypeFor } from "~~/shared/models/lead";
import { homeOgImage } from "~~/shared/utils/og-image";
import {
  qualifyingCategories,
  categorySlug,
  categoryLabel,
  allCategories,
} from "~~/shared/utils/category";

const tenant = useTenant();
const requestFetch = useRequestFetch();
const requestUrl = useRequestURL();

// Domínio-raiz da plataforma -> landing da Moradi (sem catálogo/tenant).
const platformRoot = useState("platformRoot", () => false);
if (platformRoot.value) setPageLayout("landing");

const { data: properties } = await useAsyncData(
  "properties",
  () =>
    platformRoot.value
      ? Promise.resolve([] as PropertyCard[])
      : requestFetch<PropertyCard[]>("/api/properties"),
  {
    default: () => [] as PropertyCard[],
    getCachedData: (key, nuxtApp) =>
      nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
);

const list = computed(() => properties.value ?? []);
// useState (não reactive local): sobrevive à navegação SPA (voltar do /{slug}/{codigo}
// mantém filtro), mas reseta num reload de verdade — e é seguro em SSR (isolado por
// requisição, ao contrário de um objeto solto no escopo do módulo).
const filters = useState("catalog-filters", createCatalogFilters).value;
const { filtered, reset } = useCatalog(list, filters);

// ---- Captura de quem filtrou e não achou nada ----
// Devolve os critérios em voz para a pessoa: mostrar que entendemos o pedido é o
// que faz ela confiar que vale deixar o contato.
const searchEcho = computed(() => {
  const partes = searchCriteriaParts(filters);
  const verbo = filters.purpose === "aluguel" ? "alugar" : "comprar";
  // A intenção vem ANTES da lista: jogada no fim, ela caía depois do termo entre
  // aspas e a frase ficava ilegível justamente onde precisa convencer.
  return partes.length
    ? `Já sabemos o que você procura para ${verbo}: ${partes.join(", ")}. Deixe seu contato que a gente avisa quando aparecer.`
    : `Deixe seu contato e conte o que procura — a gente avisa quando aparecer algo para ${verbo}.`;
});

// Passado ao LeadForm para que o formato da mensagem viva num lugar só.
const composeSearchMessage = (note: string) =>
  buildSearchLeadMessage(filters, note);

// Mesma captura, outra situação: aqui a pessoa VIU imóveis e nenhum serviu.
// Não cabe dizer "já sabemos o que você procura" — ela pode nem ter filtrado.
const browseEcho = computed(() => {
  const partes = searchCriteriaParts(filters);
  return partes.length
    ? `Se aparecer ${partes.join(", ")}, a gente te avisa.`
    : "Conte o que você procura e a gente avisa quando aparecer.";
});

// Categorias com inventário suficiente viram link aqui. Sem esses links as
// páginas existiriam mas ninguém — nem o rastreador — chegaria até elas. As de
// pretensão (/imoveis/a-venda e /imoveis/para-alugar) entram sempre, inclusive
// desindexadas: noindex,follow tira do índice, não da navegação.
const catLinks = computed(() => {
  const pretensoes = allCategories()
    .filter((c) => c.type === null)
    .map((c) => ({
      href: `/imoveis/${categorySlug(c)}`,
      label: `${categoryLabel(c)}${tenant.value?.city ? " em " + tenant.value.city : ""}`,
    }));
  const tipos = qualifyingCategories(list.value)
    .filter((c) => c.type !== null)
    .map((c) => ({
      href: `/imoveis/${categorySlug(c)}`,
      label: `${categoryLabel(c)}${tenant.value?.city ? " em " + tenant.value.city : ""}`,
    }));
  return [...pretensoes, ...tipos];
});

const resultsEl = ref<HTMLElement | null>(null);
function scrollToResults() {
  resultsEl.value?.scrollIntoView({ behavior: "smooth" });
}

useSeoMeta({
  title: () => tenant.value?.heroTitle || "Imóveis à venda e para alugar",
  ogTitle: () =>
    `${tenant.value?.name || "Imóveis"} · Imóveis à venda e para alugar`,
  // Sem isto, colar o link da home no WhatsApp não mostrava imagem nenhuma — a
  // página de detalhe já anunciava a capa do imóvel, a home não anunciava nada.
  ogImage: () => homeOgImage(tenant.value?.logoUrl, list.value),
});

useHead(() => ({
  link: [{ rel: "canonical", href: requestUrl.origin + "/" }],
}));

const sameAs = computed(
  () => [tenant.value?.instagram].filter(Boolean) as string[],
);

const orgJsonLd = computed(() => ({
  "@context": "https://schema.org",
  "@type": "RealEstateAgent",
  "@id": requestUrl.origin,
  name: tenant.value?.name,
  alternateName: tenant.value?.alternateNames?.length
    ? tenant.value.alternateNames
    : undefined,
  description: tenant.value?.heroSubtitle,
  telephone: tenant.value?.phone || undefined,
  email: tenant.value?.email || undefined,
  areaServed: tenant.value?.city || undefined,
  url: requestUrl.origin,
  logo: tenant.value?.logoUrl || undefined,
  image: tenant.value?.logoUrl || undefined,
  sameAs: sameAs.value.length ? sameAs.value : undefined,
  address: tenant.value?.city
    ? {
        "@type": "PostalAddress",
        addressLocality: tenant.value?.city,
        addressRegion: tenant.value?.state || undefined,
        addressCountry: "BR",
      }
    : undefined,
}));

useHead(() => ({
  script: platformRoot.value
    ? []
    : [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify(orgJsonLd.value),
        },
      ],
}));
</script>

<template>
  <MoradiLanding v-if="platformRoot" />
  <div v-else>
    <Hero :tenant="tenant" />

    <div class="search">
      <PropertySearch :filters="filters" @search="scrollToResults" />
    </div>

    <main ref="resultsEl" class="wrap">
      <div class="res-head">
        <div>
          <h2>
            {{
              filters.purpose === "aluguel"
                ? "Imóveis para alugar"
                : "Imóveis à venda"
            }}
          </h2>
          <div class="count">
            {{ filtered.length }}
            {{
              filtered.length === 1
                ? "imóvel encontrado"
                : "imóveis encontrados"
            }}
          </div>
        </div>
        <div class="sort">
          Ordenar
          <select v-model="filters.sort" aria-label="Ordenar imóveis">
            <option value="rel">Relevância</option>
            <option value="menor">Menor preço</option>
            <option value="maior">Maior preço</option>
            <option value="area">Maior área</option>
          </select>
        </div>
      </div>

      <LazyTypeChips :filters="filters" :properties="list" />

      <!-- Links internos pras categorias: é o que dá ao Google (e ao visitante)
           um caminho até elas. As de tipo só aparecem com imóveis suficientes;
           as de pretensão (a-venda/para-alugar) entram sempre. -->
      <nav
        v-if="catLinks.length"
        class="cat-links"
        aria-label="Categorias de imóveis"
      >
        <NuxtLink v-for="c in catLinks" :key="c.href" :to="c.href">{{
          c.label
        }}</NuxtLink>
      </nav>

      <div v-if="filtered.length" class="grid">
        <!-- stagger limitado a 8 cards: sem o teto, 50 imóveis deixam o último
             invisível por ~2s (e 200 imóveis, por 8s) por causa do fill-mode both. -->
        <LazyPropertyCard
          v-for="(p, i) in filtered"
          :key="p.id"
          :property="p"
          :index="i"
          :style="`animation: fade .4s ease ${Math.min(i, 8) * 0.04}s both`"
        />
      </div>

      <div v-else class="empty">
        <AppIcon name="home" />
        <h3>Nenhum imóvel com esses filtros</h3>
        <p>Tente ampliar a faixa de valor ou remover algum filtro.</p>
        <button @click="reset()">Limpar filtros</button>

        <!-- Momento de maior intenção do catálogo: a pessoa disse exatamente o
             que quer e não achou. Os filtros já são a resposta — pedir de novo
             num formulário em branco seria jogar fora o que ela informou. -->
        <div class="empty-lead">
          <LazyLeadForm
            source="catalog_empty"
            :lead-type="seekingTypeFor(filters.purpose)"
            title="Não encontrou? A gente procura pra você"
            :intro="searchEcho"
            note-placeholder="Algo mais que ajude na busca? (opcional)"
            submit-label="Quero que procurem pra mim"
            ok-message="Recebemos! Assim que aparecer algo com esse perfil, a gente te chama. ✅"
            :build-message="composeSearchMessage"
          />
        </div>
      </div>

      <!-- Quem viu a lista inteira e não gostou de nada não passa pelo estado
           vazio, então essa saída não existiria para ela. -->
      <div v-if="filtered.length" class="browse-lead">
        <LazyLeadForm
          source="catalog_footer"
          :lead-type="seekingTypeFor(filters.purpose)"
          title="Ainda não encontrou o imóvel ideal?"
          :intro="browseEcho"
          note-placeholder="O que você procura? (opcional)"
          submit-label="Quero que procurem pra mim"
          ok-message="Recebemos! Assim que aparecer algo com esse perfil, a gente te chama. ✅"
          :build-message="composeSearchMessage"
        />
      </div>
    </main>
  </div>
</template>
