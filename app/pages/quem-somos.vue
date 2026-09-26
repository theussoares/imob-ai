<script setup lang="ts">
import type { AboutBlock } from "~~/shared/models/about-page";
import type { PublicBroker } from "~~/shared/models/broker";
import { formatTenantAddress, hasStructuredAddress } from "~~/shared/utils/address";
import { realEstateAgentJsonLd } from "~~/shared/utils/tenant-jsonld";

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
            // A mesma entidade (e o mesmo `@id`) da home, completa: endereço,
            // telefone, Instagram e CRECI já estavam no cadastro e não
            // chegavam ao resultado local do Google por esta página.
            mainEntity: tenant.value?.name ? realEstateAgentJsonLd(tenant.value, url.origin) : undefined,
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

    <AboutBlocks v-if="blocks.length" :blocks="blocks" :brokers="teamBrokers ?? []" />

    <!-- Publicada sem blocos válidos (o painel hoje não deixa ligar assim, mas
         páginas publicadas antes da regra existem): nunca em branco. -->
    <p v-else class="qs-fallback">
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
/* 1200px, não 920: banner, galeria, equipe e números precisam da largura
   cheia. O texto corrido se limita sozinho a 68ch dentro de AboutBlocks. */
.qs {
  max-width: 1200px;
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
.qs-fallback {
  margin: 0;
  max-width: 68ch;
  font-size: var(--fs-body);
  line-height: 1.7;
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

</style>
