<script setup lang="ts">
const tenant = useTenant();
const { whatsappLink } = useContact();
const route = useRoute();

/**
 * Menu para todo tenant, em qualquer largura.
 *
 * "Quero vender" e "Quero alugar" servem a qualquer imobiliária — não são do
 * portal. Condicionar o menu inteiro ao plano deixaria esses dois destinos
 * existindo só para quem contratou a Área do Cliente, que é o item errado a
 * amarrar. O que depende do plano é UM item, não o menu.
 *
 * "Quero vender" e "Quero alugar" apontam para a MESMA página, de propósito: a
 * página de captação já trata os dois casos, e quem quer alugar o imóvel dele
 * procura a palavra "alugar" e não se reconhece em "quero vender". Dois rótulos
 * para uma página é mais barato que uma segunda página para manter, e é
 * reversível no dia em que o conteúdo divergir.
 */
const itens = computed(() => [
  // Só para quem contratou: link que leva a um login que recusa a pessoa é pior
  // que link nenhum — ela conclui que o site está quebrado, não que não tem
  // acesso. Ver `portalEnabled`.
  ...(tenant.value?.portalEnabled
    ? [{ label: "Área do Cliente", to: "/area-cliente", externo: false }]
    : []),
  { label: "Quero vender", to: "/quero-vender", externo: false },
  { label: "Quero alugar", to: "/quero-vender", externo: false },
  ...(tenant.value?.whatsapp
    ? [{ label: "Fala com a gente", to: whatsappLink(), externo: true }]
    : []),
]);

const aberto = ref(false);
const raiz = ref<HTMLElement | null>(null);

// Fecha ao navegar: sem isto o menu fica aberto por cima da página nova, e no
// celular a pessoa acha que o clique não funcionou.
watch(
  () => route.fullPath,
  () => (aberto.value = false),
);

function onKey(e: KeyboardEvent) {
  // Esc é o que qualquer um tenta antes de procurar o X.
  if (e.key === "Escape") aberto.value = false;
}

// O painel flutua por cima da página, então clicar fora é a forma natural de
// dispensá-lo — sem isso ele só fecha pelo próprio botão, e no celular a pessoa
// toca no conteúdo atrás esperando que suma.
function onClickFora(e: MouseEvent) {
  if (!aberto.value) return;
  if (raiz.value && !raiz.value.contains(e.target as Node))
    aberto.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  document.addEventListener("click", onClickFora);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("click", onClickFora);
});
</script>

<template>
  <header ref="raiz" class="bar">
    <div class="bar-in">
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

      <div class="bar-cta cta-group">
        <button
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

      <!--
        Sempre no DOM, aberto ou fechado: quem mostra e esconde é o CSS, não
        `v-if`/`v-show`. Assim os links existem no HTML do SSR e valem como
        navegação interna para o rastreador mesmo com o menu fechado.
      -->
      <nav
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
    </div>
  </header>
</template>

<style scoped>
/* Âncora do painel: sem isto o `absolute` do menu se resolveria contra a `.bar`,
   que vai de ponta a ponta da tela — e em monitor largo o painel descolaria do
   conteúdo, encostado na borda da janela. */
.bar-in {
  position: relative;
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

/*
 * Painel flutuante, não bloco que empurra a página.
 *
 * Abrir o menu não pode reposicionar o conteúdo atrás: quem tocou no burger
 * enquanto lia um anúncio veria o anúncio pular tela abaixo. Por isso
 * `absolute` — e por isso ele tem fundo e sombra próprios, já que passa por
 * cima de texto.
 */
.menu {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  z-index: 1;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--paper, #fff);
  box-shadow: 0 10px 30px rgb(16 29 27 / 12%);
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
/* O WhatsApp é o último da lista e o único com peso visual: saiu da barra, mas
   continua sendo a ação que converte. */
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

@media (min-width: 560px) {
  /* A partir daí o painel para de ocupar a largura toda e vira uma coluna
     ancorada no burger, que é onde o olho está depois do clique. */
  .menu {
    left: auto;
    min-width: 240px;
  }
}
</style>
