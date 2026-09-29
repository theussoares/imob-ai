<script setup lang="ts">
/**
 * Layout da Área do Cliente.
 *
 * Veste a identidade da Moradi (amarelo-ipê e preto, a mesma paleta da
 * landing), e NÃO o `--brand` que o `app.vue` injeta por tenant. A área do
 * cliente é um produto da plataforma, igual em todas as imobiliárias: com a cor
 * de cada tenant, um verde-escuro aqui e um coral ali, o botão principal mudava
 * de contraste a cada cliente e nenhum tema foi desenhado para esta tela. A
 * imobiliária continua reconhecível pelo nome e pelo logo no topo — é isso que
 * o inquilino procura, não a cor.
 *
 * Deliberadamente sem o header do site público: quem está aqui veio para
 * resolver uma coisa, e o menu de imóveis à venda não é ela.
 */
const tenant = useTenant()
const { user, signOut } = usePortalAuth()
const { expired, reconnect } = usePortalSessionExpired()
const { name: builtByName, link: builtByLink } = useBuiltBy()

async function sair() {
  await signOut()
  await navigateTo('/area-cliente/login')
}
</script>

<template>
  <div class="portal moradi-tema">
    <header class="portal-top">
      <NuxtLink to="/area-cliente" class="portal-brand">
        <!-- Logo num selo claro: o topo é preto, e logo de imobiliária quase
             sempre é escuro sobre transparente — direto no preto, sumia. -->
        <span v-if="tenant?.logoUrl" class="portal-logo-chip">
          <img :src="tenant.logoUrl" :alt="tenant?.name || ''" class="portal-logo" >
        </span>
        <span v-else class="portal-mark" aria-hidden="true">
          <svg viewBox="0 0 26 26" width="22" height="22"><path d="M13 2 24 10.5V23a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10.5Z" fill="#f4b400" /><path d="M8 24v-8.5a5 5 0 0 1 10 0V24" fill="none" stroke="#16181b" stroke-width="2.6" /></svg>
        </span>
        <span class="portal-brand-text">
          <b>{{ tenant?.name || 'Moradi' }}</b>
          <small>Área do Cliente</small>
        </span>
      </NuxtLink>

      <button v-if="user" type="button" class="portal-exit" @click="sair">Sair</button>
    </header>

    <!--
      O aviso de sessão caída fica FORA do slot: ele precisa aparecer em
      qualquer tela do portal, e some junto com a sessão que o causou.
    -->
    <div v-if="expired" class="portal-expired" role="alert">
      <span>Sua sessão expirou. Entre novamente para continuar.</span>
      <button type="button" @click="reconnect">Entrar de novo</button>
    </div>

    <main class="portal-main">
      <slot />
    </main>

    <footer class="portal-foot">
      <p class="portal-foot-dim">
        <template v-if="tenant?.name">{{ tenant.name }} · </template>Desenvolvido pela
        <a v-if="builtByLink" :href="builtByLink" target="_blank" rel="noopener noreferrer">{{ builtByName }}</a>
        <b v-else>{{ builtByName }}</b>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}
.portal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--ink);
  color: #f2f1ec;
  /* Filete amarelo: a única faixa de cor da moldura, e o que diz "Moradi" antes
     de qualquer texto ser lido. */
  box-shadow: inset 0 -3px 0 var(--ipe);
}
.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.portal-brand:focus-visible,
.portal-exit:focus-visible {
  outline: 2px solid var(--ipe);
  outline-offset: 3px;
  border-radius: var(--r-sm);
}
.portal-logo-chip {
  display: grid;
  place-items: center;
  flex: none;
  height: 38px;
  padding: 3px 8px;
  border-radius: var(--r-sm);
  background: #fff;
}
.portal-logo {
  height: 30px;
  width: auto;
  max-width: 130px;
  object-fit: contain;
}
.portal-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  background: #26292d;
  flex: none;
}
.portal-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}
.portal-brand-text b {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-brand-text small {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--ipe);
}
.portal-exit {
  flex: none;
  border: 1px solid #4a4f55;
  background: transparent;
  color: #f2f1ec;
  border-radius: var(--r-sm);
  padding: 7px 14px;
  font-size: var(--fs-label);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.portal-exit:hover {
  border-color: var(--ipe);
  color: var(--ipe);
}
.portal-expired {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--ipe-soft);
  border-bottom: 1px solid #f1d98a;
  font-size: var(--fs-label);
}
.portal-expired button {
  border: 0;
  background: var(--ink);
  color: #fff;
  border-radius: var(--r-sm);
  padding: 6px 12px;
  font-size: var(--fs-label);
  font-weight: 600;
  cursor: pointer;
}
.portal-main {
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 22px 16px 40px;
}
.portal-foot {
  padding: 18px 16px 26px;
  text-align: center;
  font-size: var(--fs-caption);
  color: var(--muted);
  border-top: 1px solid var(--line);
}
.portal-foot p {
  margin: 0;
}
.portal-foot a,
.portal-foot b {
  font-weight: 700;
  color: var(--ink);
}
.portal-foot a {
  text-decoration: underline;
  text-decoration-color: var(--ipe);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
.portal-foot p + p {
  margin-top: 4px;
}
</style>
