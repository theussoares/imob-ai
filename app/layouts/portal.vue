<script setup lang="ts">
/**
 * Layout da Área do Cliente.
 *
 * Usa `--brand` e `--accent`, que o `app.vue` injeta por tenant no SSR: o
 * cliente precisa reconhecer a imobiliária dele, não uma ferramenta genérica.
 * É a diferença entre "o portal da OLMI" e "um site onde meus documentos
 * estão".
 *
 * Deliberadamente sem o header do site público: quem está aqui veio para
 * resolver uma coisa, e o menu de imóveis à venda não é ela.
 */
const tenant = useTenant()
const { user, signOut } = usePortalAuth()
const { expired, reconnect } = usePortalSessionExpired()

async function sair() {
  await signOut()
  await navigateTo('/area-cliente/login')
}
</script>

<template>
  <div class="portal">
    <header class="portal-top">
      <NuxtLink to="/area-cliente" class="portal-brand">
        <img v-if="tenant?.logoUrl" :src="tenant.logoUrl" :alt="tenant?.name || ''" class="portal-logo" >
        <span v-else class="portal-mark"><AppIcon name="home" /></span>
        <span class="portal-brand-text">
          <b>{{ tenant?.name || 'Área do Cliente' }}</b>
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
      <p v-if="tenant?.whatsapp">
        Dúvidas sobre seu contrato? Fale com a {{ tenant?.name }}.
      </p>
      <p class="portal-foot-dim">{{ tenant?.name }}</p>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}
.portal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.portal-logo {
  height: 34px;
  width: auto;
  max-width: 150px;
  object-fit: contain;
}
.portal-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--brand);
  color: #fff;
  flex: none;
}
.portal-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}
.portal-brand-text b {
  font-size: var(--fs-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-brand-text small {
  font-size: var(--fs-caption);
  color: #6b7280;
}
.portal-exit {
  flex: none;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: var(--r-sm);
  padding: 7px 12px;
  font-size: var(--fs-label);
  cursor: pointer;
}
.portal-expired {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #fef3c7;
  border-bottom: 1px solid #fde68a;
  font-size: var(--fs-label);
}
.portal-expired button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: var(--r-sm);
  padding: 5px 10px;
  font-size: var(--fs-label);
  cursor: pointer;
}
.portal-main {
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 18px 16px 40px;
}
.portal-foot {
  padding: 18px 16px 26px;
  text-align: center;
  font-size: var(--fs-caption);
  color: #6b7280;
}
.portal-foot-dim {
  opacity: 0.7;
  margin-top: 4px;
}
</style>
