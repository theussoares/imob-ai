<script setup lang="ts">
const tenant = useTenant()

/**
 * Tema e cabeçalho viram atributos no <html>, e o main.css escolhe o bloco de
 * variáveis por eles (ver docs/superpowers/specs/2026-09-25-temas-da-vitrine-design.md).
 *
 * Aqui, no layout público, e não no app.vue: o painel e a Área do Cliente usam
 * as mesmas variáveis de fonte, e com o atributo global o painel mudaria de
 * tipografia quando o cliente trocasse o tema do site. O painel é interface do
 * produto, não vitrine.
 *
 * Os valores já chegam normalizados para a lista fechada pelo mapper
 * (`temaValido`/`cabecalhoValido`) — nunca texto livre do banco num atributo.
 */
useHead(() => ({
  htmlAttrs: tenant.value
    ? { 'data-tema': tenant.value.siteTheme, 'data-cabecalho': tenant.value.headerStyle }
    : {},
}))
</script>

<template>
  <div>
    <!--
      Primeiro elemento focável da página: sem ele, quem navega por teclado
      atravessa logo, menu e WhatsApp em toda página antes de chegar ao
      conteúdo (WCAG 2.4.1). Fica fora da tela até receber foco.
    -->
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <AppHeader />
    <!--
      O <main> mora aqui, e não em cada página: a home abria o dela só depois
      do hero e da busca (a busca ficava fora do conteúdo principal), e o
      quero-vender não tinha nenhum. `tabindex="-1"` para o link acima mover o
      foco de fato, e não só a rolagem.
    -->
    <main id="conteudo" tabindex="-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
