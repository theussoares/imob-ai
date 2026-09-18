<script setup lang="ts">
import { itensDoMenu } from "~~/shared/utils/header-menu";

const tenant = useTenant();
const { whatsappLink } = useContact();
const route = useRoute();

/**
 * Quais destinos existem — a regra mora em `shared/utils/header-menu.ts`, fora
 * do componente, porque este repositório não tem teste de componente (decisão
 * registrada no `vitest.config.ts`) e a condição da Área do Cliente já quebrou
 * antes, sem deixar erro.
 */
const itens = computed(() => itensDoMenu(tenant.value, whatsappLink()));

const aberto = ref(false);
const barra = ref<HTMLElement | null>(null);

/**
 * Fecha ao navegar.
 *
 * O painel flutua por cima da página, então sem isto ele continuaria aberto
 * sobre o conteúdo novo — e a pessoa tocaria no link duas vezes achando que o
 * primeiro toque não pegou.
 */
watch(() => route.fullPath, () => { aberto.value = false });

/**
 * Fecha no clique fora e no Esc.
 *
 * O clique fora existe porque o painel passou a flutuar POR CIMA da página:
 * tocar no conteúdo atrás é o gesto natural para dispensá-lo, e sem isso o
 * único jeito de fechar é acertar o burger de novo.
 *
 * O Esc é o par disso para quem navega por teclado — mesma saída, sem mouse.
 */
onClickOutside(barra, () => { aberto.value = false });
onKeyStroke("Escape", () => { aberto.value = false });
</script>

<template>
  <header class="bar">
    <div ref="barra" class="bar-in">
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
        id="menu-site"
        class="menu"
        :class="{ aberto }"
        aria-label="Menu do site"
      >
        <template v-for="item in itens" :key="item.label">
          <a
            v-if="item.externo"
            class="menu-item destaque"
            :href="item.to"
            target="_blank"
            rel="noopener"
          >
            <AppIcon name="wa" />
            {{ item.label }}
          </a>
          <NuxtLink v-else class="menu-item" :to="item.to">
            {{ item.label }}
          </NuxtLink>
        </template>
      </nav>

      <!--
        Só no celular (o CSS o esconde no desktop, onde os itens já estão na
        barra). `aria-expanded` e `aria-controls` porque um botão que abre algo
        precisa dizer o que abriu e se está aberto — sem isso, leitor de tela
        anuncia "botão" e nada mais.
      -->
      <button
        class="burger"
        type="button"
        :aria-expanded="aberto"
        aria-controls="menu-site"
        :aria-label="aberto ? 'Fechar menu' : 'Abrir menu'"
        @click="aberto = !aberto"
      >
        <AppIcon :name="aberto ? 'close' : 'menu'" />
      </button>
    </div>
  </header>
</template>
