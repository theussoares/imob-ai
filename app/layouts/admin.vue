<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <div class="admin">
    <AdminSidebar />
    <main class="admin-main">
      <!-- Antes do conteúdo: quando a sessão cai, TODA ação da tela falha, e a
           causa precisa ser a primeira coisa que a pessoa lê. -->
      <AdminSessionExpiredBanner />
      <!-- Sem `mode="out-in"`: ele adia a montagem da tela que entra até o leave
           terminar, e é no setup dela que o `useLazyAsyncData` dispara o fetch —
           ou seja, atrasaria em ~180ms justamente a requisição que as telas
           passaram a fazer sem `await` para abrir na hora. -->
      <Transition name="admin-page">
        <div :key="route.fullPath" class="admin-page-wrap">
          <slot />
        </div>
      </Transition>
    </main>

    <!-- Montados uma vez aqui: qualquer tela do painel chama useToast() /
         useConfirm() sem precisar renderizar nada. -->
    <AdminToasts />
    <AdminConfirmDialog />
  </div>
</template>

<style scoped>
/* Só na ENTRADA. Sem `mode`, a tela que sai e a que entra coexistem por um
   instante; se a que sai também tivesse transição, as duas ocupariam espaço no
   fluxo e o conteúdo daria um salto. Sem transição de saída, o Vue remove a
   antiga na hora e só a nova anima. */
.admin-page-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.admin-page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .admin-page-enter-active {
    transition: none;
  }
  .admin-page-enter-from {
    opacity: 1;
    transform: none;
  }
}
</style>
