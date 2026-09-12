<script setup lang="ts">
/**
 * Layout da Área do Cliente.
 *
 * Existe para que as telas do portal não repitam a mesma moldura — antes do
 * card 2.1 as três páginas carregavam ~50 linhas de CSS idênticas cada uma, e
 * isso é o começo de três telas que divergem entre si.
 *
 * Usa as CSS vars de marca injetadas no SSR (`--brand` / `--accent`), então
 * trocar de tenant muda o tema sem rebuild — a mesma infraestrutura do site
 * público e do painel.
 */
const tenant = useTenant();
</script>

<template>
  <div class="pc-shell">
    <main class="pc-main">
      <header class="pc-brand">
        <img
          v-if="tenant?.logoUrl"
          :src="tenant.logoUrl"
          :alt="tenant?.name || 'Logo da imobiliária'"
          class="pc-logo"
        />
        <!-- Sem logo cadastrada, o nome da imobiliária faz o mesmo trabalho:
             dizer à pessoa que ela está no lugar certo. -->
        <strong v-else class="pc-brand-name">{{ tenant?.name }}</strong>
      </header>

      <section class="pc-card">
        <slot />
      </section>

      <footer class="pc-foot">
        <p>Área do cliente · {{ tenant?.name }}</p>
        <a v-if="tenant?.whatsapp" :href="`https://wa.me/${tenant.whatsapp}`">
          Falar com a imobiliária
        </a>
      </footer>
    </main>
  </div>
</template>

<style>
/*
 * Não é `scoped` de propósito: as páginas do portal usam estas classes para os
 * elementos internos do card (título, formulário, mensagens), e o objetivo do
 * card 2.1 é justamente centralizar isso num lugar só.
 */
.pc-shell {
  min-height: 100dvh;
  background: color-mix(in srgb, var(--brand) 7%, white);
  display: flex;
  flex-direction: column;
}
.pc-main {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding-inline: 20px;
  padding-block: 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.pc-brand {
  display: flex;
  justify-content: center;
}
.pc-logo {
  max-height: 56px;
  max-width: 100%;
  object-fit: contain;
}
.pc-brand-name {
  color: var(--brand);
  font-size: 1.1rem;
  text-align: center;
}
.pc-card {
  background: #fff;
  border-radius: 14px;
  padding: 26px 22px;
  box-shadow: 0 1px 3px rgb(16 29 27 / 8%);
}
.pc-card h1 {
  margin: 0 0 4px;
  font-size: 1.3rem;
  line-height: 1.25;
  color: var(--brand);
  text-wrap: balance;
}
.pc-sub {
  margin: 0 0 20px;
  color: #5c6b67;
  font-size: 0.93rem;
}
.pc-card form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pc-card label {
  font-size: 0.85rem;
  font-weight: 600;
}
.pc-card input {
  padding: 12px;
  border: 1px solid #d8e0dc;
  border-radius: 9px;
  font-size: 1rem;
  margin-bottom: 12px;
  /* 16px evita o zoom automático do iOS ao focar o campo — e o portal é
     usado no celular por padrão, não por exceção. */
  min-height: 46px;
}
.pc-card input:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
  border-color: var(--brand);
}
.pc-btn {
  margin-top: 4px;
  padding: 13px;
  border: 0;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 48px;
}
.pc-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.pc-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.pc-link {
  margin-top: 16px;
  background: none;
  border: 0;
  padding: 0;
  color: var(--brand);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
  display: inline-block;
}
.pc-link:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 2px;
}
.pc-msg {
  margin: 0 0 4px;
  font-size: 0.9rem;
  border-radius: 8px;
  padding: 10px 12px;
}
.pc-msg.erro {
  color: #7a2a08;
  background: #fbeee7;
}
.pc-msg.ok {
  color: #1f5137;
  background: #e7f3ec;
}
/* ---- lista de contratos e detalhe (card 2.2) ---- */
.pc-lista {
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pc-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px;
  border: 1px solid #e4eae7;
  border-radius: 11px;
  text-decoration: none;
  color: inherit;
  /* O item inteiro é o alvo do toque, não só o texto do endereço: no celular
     acertar um link de uma linha é o tipo de atrito que faz a pessoa desistir
     e ligar para a imobiliária. */
  min-height: 48px;
}
.pc-item:hover,
.pc-item:focus-visible {
  border-color: var(--brand);
  outline: none;
}
.pc-item-topo {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  color: var(--brand);
}
.pc-item-meta {
  font-size: 0.87rem;
  color: #5c6b67;
}
.pc-tag {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef1f0;
  color: #5c6b67;
  white-space: nowrap;
}
.pc-voltar {
  display: inline-block;
  margin-bottom: 14px;
  font-size: 0.88rem;
  color: var(--brand);
  text-decoration: none;
}
.pc-voltar:hover {
  text-decoration: underline;
}
.pc-dados {
  margin: 0 0 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pc-dados > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  border-bottom: 1px solid #f0f3f2;
  padding-bottom: 10px;
}
.pc-dados > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.pc-dados dt {
  font-size: 0.87rem;
  color: #5c6b67;
}
.pc-dados dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

.pc-foot {
  margin-top: auto;
  text-align: center;
  font-size: 0.82rem;
  color: #5c6b67;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pc-foot p {
  margin: 0;
}
.pc-foot a {
  color: var(--brand);
}
@media (prefers-reduced-motion: no-preference) {
  .pc-card {
    animation: pc-in 0.2s ease-out;
  }
}
@keyframes pc-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
</style>
