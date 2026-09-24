<script setup lang="ts">
const tenant = useTenant();
const { signOut } = useAdminAuth();
const route = useRoute();
const siteUrl = usePublicSiteUrl();

const { areaCliente, quemSomos, carregar } = useAdminFeatures();
onMounted(carregar);

const TODOS = [
  { to: "/admin", label: "Dashboard", exact: true },
  { to: "/admin/imoveis", label: "Imóveis", exact: false },
  { to: "/admin/leads", label: "Contatos", exact: false },
  { to: "/admin/corretores", label: "Corretores", exact: false },
  // Contratos e Clientes são a Área do Cliente vista do lado da imobiliária, e
  // ficam juntos: cadastrar um contrato sem ter os clientes é meio caminho.
  //
  // `recurso: "areaCliente"` é o que os tira do menu de quem não tem a Área do
  // Cliente contratada. Sem isso eles apareciam para TODA imobiliária, inclusive
  // as que nunca viram a feature — e clicar levava a uma tela vazia que parece
  // sistema quebrado, não recurso ausente.
  { to: "/admin/contratos", label: "Contratos", exact: false, recurso: "areaCliente" },
  { to: "/admin/clientes", label: "Clientes", exact: false, recurso: "areaCliente" },
  // "Meu site" (edição do dia a dia) antes de "Configurações" (setup técnico):
  // a ordem do menu é a frequência de uso, não a hierarquia conceitual.
  { to: "/admin/site", label: "Meu site", exact: false },
  { to: "/admin/quem-somos", label: "Quem somos", exact: false, recurso: "quemSomos" },
  { to: "/admin/usuarios", label: "Usuários", exact: false },
  { to: "/admin/config", label: "Configurações", exact: false },
];

/**
 * O estado de cada recurso, por chave — a mesma que o item usa em `recurso`.
 *
 * Era uma comparação com a string "areaCliente" na mão. Um recurso novo marcado
 * no item e esquecido aqui NÃO some do menu e nada reclama: a marca vira
 * enfeite, que é o modo de falha silencioso que a trava existia para impedir.
 */
const RECURSOS = computed<Record<string, boolean>>(() => ({
  areaCliente: areaCliente.value,
  quemSomos: quemSomos.value,
}));

const links = computed(() => TODOS.filter((l) => !l.recurso || RECURSOS.value[l.recurso] === true));

function isActive(l: { to: string; exact: boolean }) {
  return l.exact ? route.path === l.to : route.path.startsWith(l.to);
}

async function logout() {
  await signOut();
  await navigateTo("/admin/login");
}
</script>

<template>
  <aside class="admin-sidebar">
    <div class="admin-sidebar-head">
      <NuxtLink class="brand" to="/admin" style="color: #fff">
        <span class="mark" :class="{ 'has-logo': tenant?.logoUrl }">
          <img
            v-if="tenant?.logoUrl"
            :src="tenant.logoUrl"
            :alt="tenant?.name || 'Logo'"
          />
          <AppIcon v-else name="home" />
        </span>
        <span>
          <b style="color: #fff">{{ tenant?.name || "Painel" }}</b>
          <small style="color: #cfe3dd">Painel administrativo</small>
        </span>
      </NuxtLink>
      <div class="admin-sidebar-actions">
        <AdminReloadButton />
        <button class="admin-btn ghost admin-logout" @click="logout">Sair</button>
      </div>
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
      <a :href="siteUrl" target="_blank" rel="noopener">Ver site ↗</a>
      <!-- Só aparece quando há o que oferecer: navegador que permite instalar,
           ou iOS, onde a instalação é manual. Já instalado, some. -->
      <AdminInstallButton />
    </nav>
  </aside>
</template>

<style scoped>
.admin-nav a.active {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

/* A sidebar tem fundo var(--brand), o mesmo do .mark: uma logo com fundo
   transparente e traço escuro desapareceria. Fundo branco garante contraste
   para qualquer logo. */
.brand .mark.has-logo {
  background: transparent;
}
/* `contain` em vez do `cover` global: logo não pode ser cortada. */
.brand .mark.has-logo img {
  object-fit: contain;
}
</style>
