<template>
  <div class="admin">
    <AdminSidebar />
    <main class="admin-main">
      <slot />
    </main>

    <!-- Montados uma vez aqui: qualquer tela do painel chama useToast() /
         useConfirm() sem precisar renderizar nada. -->
    <AdminToasts />
    <AdminConfirmDialog />
  </div>
</template>
