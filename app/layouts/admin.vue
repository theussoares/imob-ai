<template>
  <div class="admin">
    <AdminSidebar />
    <main class="admin-main">
      <!-- Antes do conteúdo: quando a sessão cai, TODA ação da tela falha, e a
           causa precisa ser a primeira coisa que a pessoa lê. -->
      <AdminSessionExpiredBanner />
      <slot />
    </main>

    <!-- Montados uma vez aqui: qualquer tela do painel chama useToast() /
         useConfirm() sem precisar renderizar nada. -->
    <AdminToasts />
    <AdminConfirmDialog />
  </div>
</template>
