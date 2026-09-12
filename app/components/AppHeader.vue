<script setup lang="ts">
const tenant = useTenant();
const { whatsappLink } = useContact();
const route = useRoute();

/**
 * O header ganha menu quando o tenant tem Área do Cliente.
 *
 * Sem portal, o header continua o que sempre foi: marca + um botão de WhatsApp.
 * É a única ação que existe, e transformá-la em item de menu esconderia a
 * conversão atrás de um clique a mais sem nada em troca.
 *
 * Com portal passam a existir quatro destinos — e é aí que a barra deixa de
 * caber no celular.
 */
const temMenu = computed(() => !!tenant.value?.portalEnabled);

/**
 * "Quero vender" e "Quero alugar" apontam para a MESMA página.
 *
 * Não é descuido: a página de captação já trata os dois casos, e quem quer
 * alugar o imóvel dele não se reconhece em "quero vender" — procura a palavra
 * "alugar" e não acha. Dois rótulos para uma página é mais barato que uma
 * segunda página para manter, e é reversível no dia em que o conteúdo divergir.
 */
const itens = computed(() => [
  { label: "Área do Cliente", to: "/area-cliente", externo: false },
  { label: "Quero vender", to: "/quero-vender", externo: false },
  { label: "Quero alugar", to: "/quero-vender", externo: false },
  ...(tenant.value?.whatsapp
    ? [{ label: "Fala com a gente", to: whatsappLink(), externo: true }]
    : []),
]);

const aberto = ref(false);

// Fecha ao navegar: sem isto o menu fica aberto por cima da página nova, e no
// celular a pessoa acha que o clique não funcionou.
watch(
  () => route.fullPath,
  () => (aberto.value = false),
);

// Esc fecha, que é o que qualquer um tenta antes de procurar o X.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") aberto.value = false;
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <header class="bar">
    <div class="bar-in" :class="{ 'com-menu': temMenu }">
      <NuxtLink class="brand" to="/">
        <span class="mark" aria-hidden="true">
          <img
            v-if="tenant?.logoUrl"
            :src="tenant.logoUrl"
            :alt="tenant?.name || 'Logo'"
          />
          <AppIcon v-else name="home" />
        </span>
        <span>
          <b class="hidden md:flex">{{ tenant?.name || "Imóveis" }}</b>
          <small v-if="tenant?.tagline">{{ tenant.tagline }}</small>
        </span>
      </NuxtLink>

      <!--
        Sempre no DOM, aberto ou fechado: quem mostra e esconde é o CSS, não
        `v-if`/`v-show`. Assim os links existem no HTML do SSR e valem como
        navegação interna para o rastreador mesmo com o menu fechado — e no
        desktop o mesmo markup vira uma linha, sem `!important` brigando com
        estilo inline.
      -->
      <nav
        v-if="temMenu"
        id="menu-site"
        class="menu"
        :class="{ aberto }"
        aria-label="Menu do site"
      >
        <template v-for="item in itens" :key="item.label">
          <a
            v-if="item.externo"
            :href="item.to"
            target="_blank"
            rel="noopener"
            class="menu-item destaque"
          >
            <AppIcon name="wa" /> {{ item.label }}
          </a>
          <NuxtLink v-else :to="item.to" class="menu-item">
            {{ item.label }}
          </NuxtLink>
        </template>
      </nav>

      <div class="bar-cta cta-group">
        <!-- Sem portal: o header de sempre. -->
        <a
          v-if="!temMenu && tenant?.whatsapp"
          class="wa-btn"
          :href="whatsappLink()"
          target="_blank"
          rel="noopener"
          aria-label="Falar no WhatsApp"
        >
          <AppIcon name="wa" />
          <span class="label-desk">Falar no WhatsApp</span>
        </a>

        <button
          v-if="temMenu"
          type="button"
          class="burger"
          :aria-expanded="aberto"
          aria-controls="menu-site"
          :aria-label="aberto ? 'Fechar menu' : 'Abrir menu'"
          @click="aberto = !aberto"
        >
          <!-- Três traços desenhados aqui mesmo: a coleção de ícones do projeto
               é bundlada localmente e não tem um "menu". Um arquivo a mais no
               bundle para três retângulos não se paga. -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="6" width="18" height="2" rx="1" />
            <rect x="3" y="11" width="18" height="2" rx="1" />
            <rect x="3" y="16" width="18" height="2" rx="1" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* A barra vira duas linhas no celular: marca + burger em cima, menu embaixo. */
.bar-in {
  flex-wrap: wrap;
}
.cta-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.burger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 44px é o alvo de toque mínimo, e o header é usado no celular por padrão. */
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: transparent;
  color: var(--brand);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.burger:hover {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.burger:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.burger svg {
  width: 22px;
  height: 22px;
  fill: currentColor;
}

.menu {
  display: none;
  /* Terceiro item da linha: quebra para baixo da marca e do burger. */
  order: 3;
  flex-basis: 100%;
  flex-direction: column;
  gap: 2px;
  margin: 0 -10px;
  padding: 6px 10px 10px;
  border-top: 1px solid var(--line);
}
.menu.aberto {
  display: flex;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  /* Linha inteira clicável, não só o texto: no celular acertar um link de uma
     palavra é o atrito que faz a pessoa desistir. */
  min-height: 48px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--ink);
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
}
.menu-item:hover {
  background: var(--brand-ghost);
  color: var(--brand);
}
.menu-item:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}
.menu-item.router-link-active {
  color: var(--brand);
}
/* O WhatsApp é o último da lista e o único com peso visual: continua sendo a
   ação que converte, mesmo tendo saído da barra. */
.menu-item.destaque {
  margin-top: 6px;
  background: var(--wa);
  color: #fff;
}
.menu-item.destaque:hover {
  background: var(--wa-dark);
  color: #fff;
}
.menu-item.destaque :deep(svg) {
  width: 18px;
  height: 18px;
  fill: #fff;
}

@media (min-width: 720px) {
  /*
   * No desktop há espaço de sobra: os quatro destinos ficam na própria barra e
   * o burger some. Menu escondido atrás de um clique numa tela larga esconde
   * "Quero vender", que é caminho de conversão.
   */
  .menu {
    display: flex;
    order: 0;
    flex-basis: auto;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    /* Empurra o menu para a direita; o `.bar-cta` fica vazio e some logo abaixo,
       então não há duas margens automáticas disputando o espaço livre. */
    margin: 0 0 0 auto;
    padding: 0;
    border-top: 0;
  }
  .menu-item {
    min-height: 40px;
    padding: 0 11px;
    font-size: 14px;
  }
  .menu-item.destaque {
    margin: 0 0 0 6px;
  }
  .bar-in.com-menu .cta-group {
    display: none;
  }
}
</style>
