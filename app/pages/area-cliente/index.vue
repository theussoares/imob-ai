<script setup lang="ts">
/**
 * Home da Área do Cliente.
 *
 * Aqui é só a prova de que o fluxo de autenticação fecha: quem chega passou pelo
 * middleware, que por sua vez passou pelo servidor. A lista de contratos é o
 * card 2.2.
 */
definePageMeta({ middleware: "portal", layout: "portal" });

const { me, signOut } = usePortalAuth();

async function sair() {
  await signOut();
  await navigateTo("/area-cliente/login");
}

useSeoMeta({ title: "Área do cliente", robots: "noindex, nofollow" });
</script>

<template>
  <div>
    <h1>Olá, {{ me?.name }}</h1>
    <p class="pc-sub">{{ me?.tenantName }}</p>
    <p>Seus contratos aparecem aqui em breve.</p>
    <button type="button" class="pc-link" @click="sair">Sair</button>
  </div>
</template>
