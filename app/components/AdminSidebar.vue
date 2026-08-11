<script setup lang="ts">
const tenant = useTenant();
const client = useSupabaseClient();
const route = useRoute();

const links = [
  { to: "/admin", label: "Dashboard", exact: true },
  { to: "/admin/imoveis", label: "Imóveis", exact: false },
  { to: "/admin/config", label: "Configurações", exact: false },
];

function isActive(l: { to: string; exact: boolean }) {
  return l.exact ? route.path === l.to : route.path.startsWith(l.to);
}

async function logout() {
  await client.auth.signOut();
  await navigateTo("/admin/login");
}
</script>

<template>
  <aside class="admin-sidebar">
    <div class="flex justify-between items-center">
      <NuxtLink class="brand" to="/admin" style="color: #fff">
        <span class="mark"><AppIcon name="home" /></span>
        <span>
          <b style="color: #fff">{{ tenant?.name || "Painel" }}</b>
          <small style="color: #cfe3dd">Painel administrativo</small>
        </span>
      </NuxtLink>
      <button class="admin-btn ghost admin-logout" @click="logout">Sair</button>
    </div>

    <nav class="admin-nav">
      <NuxtLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        :class="{ active: isActive(l) }"
      >
        {{ l.label }}
      </NuxtLink>
      <a href="/" target="_blank" rel="noopener">Ver site ↗</a>
    </nav>
  </aside>
</template>

<style scoped>
.admin-nav a.active {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
</style>
