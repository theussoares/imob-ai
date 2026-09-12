<script setup lang="ts">
/**
 * Home da Área do Cliente.
 *
 * Aqui é só a prova de que o fluxo de autenticação fecha: quem chega passou pelo
 * middleware, que por sua vez passou pelo servidor. A lista de contratos é o
 * card 2.2.
 */
definePageMeta({ middleware: "portal", layout: false });

const { me, signOut } = usePortalAuth();

async function sair() {
  await signOut();
  await navigateTo("/area-cliente/login");
}

useSeoMeta({ title: "Área do cliente", robots: "noindex, nofollow" });
</script>

<template>
  <main class="pc-wrap">
    <section class="pc-card">
      <h1>Olá, {{ me?.name }}</h1>
      <p class="pc-sub">{{ me?.tenantName }}</p>
      <p>Seus contratos aparecem aqui em breve.</p>
      <button type="button" class="pc-link" @click="sair">Sair</button>
    </section>
  </main>
</template>

<style scoped>
.pc-wrap {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--brand) 6%, white);
}
.pc-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
h1 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--brand);
}
.pc-sub {
  margin: 4px 0 22px;
  color: #5c6b67;
  font-size: 0.95rem;
}
.pc-link {
  margin-top: 18px;
  background: none;
  border: 0;
  padding: 0;
  color: var(--brand);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}
</style>
