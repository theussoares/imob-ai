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
