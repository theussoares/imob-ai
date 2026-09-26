<script setup lang="ts">
const tenant = useTenant();
const { signOut } = useAdminAuth();
const route = useRoute();
const siteUrl = usePublicSiteUrl();

const { areaCliente, quemSomos, crm, carregar } = useAdminFeatures();
onMounted(carregar);

interface NavItem {
  to: string;
  label: string;
  exact: boolean;
  icon: string;
  recurso?: string;
  /** Vai para a barra inferior do celular (no máximo 4 + "Mais"). */
  principal?: boolean;
}

const TODOS: NavItem[] = [
  { to: "/admin", label: "Dashboard", exact: true, icon: "dashboard", principal: true },
  { to: "/admin/imoveis", label: "Imóveis", exact: false, icon: "home", principal: true },
  { to: "/admin/leads", label: "Contatos", exact: false, icon: "contacts", principal: true },
  // Logo abaixo de Contatos: é a tela que o corretor abre de manhã, e a
  // agenda sem o funil ao lado vira lista solta.
  { to: "/admin/agenda", label: "Agenda", exact: false, icon: "calendar", recurso: "crm" },
  { to: "/admin/corretores", label: "Corretores", exact: false, icon: "users" },
  // Contratos e Clientes são a Área do Cliente vista do lado da imobiliária, e
  // ficam juntos: cadastrar um contrato sem ter os clientes é meio caminho.
  //
  // `recurso: "areaCliente"` é o que os tira do menu de quem não tem a Área do
  // Cliente contratada. Sem isso eles apareciam para TODA imobiliária, inclusive
  // as que nunca viram a feature — e clicar levava a uma tela vazia que parece
  // sistema quebrado, não recurso ausente.
  { to: "/admin/contratos", label: "Contratos", exact: false, icon: "contract", recurso: "areaCliente" },
  { to: "/admin/clientes", label: "Clientes", exact: false, icon: "user", recurso: "areaCliente" },
  // "Meu site" (edição do dia a dia) antes de "Configurações" (setup técnico):
  // a ordem do menu é a frequência de uso, não a hierarquia conceitual.
  { to: "/admin/site", label: "Meu site", exact: false, icon: "site", principal: true },
  { to: "/admin/quem-somos", label: "Quem somos", exact: false, icon: "notes", recurso: "quemSomos" },
  { to: "/admin/usuarios", label: "Usuários", exact: false, icon: "key" },
  { to: "/admin/config", label: "Configurações", exact: false, icon: "settings" },
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
  crm: crm.value,
}));

const links = computed(() => TODOS.filter((l) => !l.recurso || RECURSOS.value[l.recurso] === true));

function isActive(l: { to: string; exact: boolean }) {
  return l.exact ? route.path === l.to : route.path.startsWith(l.to);
}

/**
 * Celular: barra inferior com os quatro destinos do dia a dia + "Mais".
 *
 * Antes os 10 itens viravam uma nuvem de links de ~27px de altura no topo:
 * ocupavam ~244px antes de qualquer conteúdo, eram pequenos demais para o
 * polegar (o alvo mínimo é 44px) e sumiam ao rolar — para trocar de tela era
 * preciso voltar ao topo. A barra inferior fica ao alcance do polegar e sempre
 * visível; o Material limita a cinco destinos, e é por isso que o resto vai
 * para "Mais" em vez de espremer ícones.
 *
 * Os principais são os de uso diário (a ordem do menu já é a de frequência,
 * ver comentário de "Meu site"). O desktop não muda: a barra lateral segue
 * com todos os itens.
 */
const principais = computed(() => links.value.filter((l) => l.principal));
const secundarios = computed(() => links.value.filter((l) => !l.principal));
const maisAtivo = computed(() => secundarios.value.some(isActive));

const maisDialog = ref<HTMLDialogElement | null>(null);
function abrirMais() {
  maisDialog.value?.showModal();
}
function fecharMais() {
  maisDialog.value?.close();
}
// `<dialog>` nativo pelo mesmo motivo do ConfirmDialog: foco preso, Esc e
// devolução do foco ao botão "Mais" vêm do navegador, não de código nosso.
watch(() => route.fullPath, fecharMais);

async function logout() {
  fecharMais();
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

      </div>
    </div>

    <nav class="admin-nav" aria-label="Menu do painel">
      <NuxtLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        :class="{ active: isActive(l) }"
        :aria-current="isActive(l) ? 'page' : undefined"
      >
        <AppIcon :name="l.icon" />
        {{ l.label }}
      </NuxtLink>
      <a :href="siteUrl" target="_blank" rel="noopener">
        <AppIcon name="external" />
        Ver site
        <span class="sr-only">(abre em nova aba)</span>
      </a>
      <!-- Só aparece quando há o que oferecer: navegador que permite instalar,
           ou iOS, onde a instalação é manual. Já instalado, some. -->
      <AdminInstallButton />
    </nav>
    <!--
      "Sair" no rodapé da barra, como link discreto. Era um botão branco e
      cheio logo abaixo do logo — o controle mais chamativo da barra, para a
      ação que ninguém quer fazer por engano. No celular ele mora no fim do
      "Mais", pelo mesmo motivo.
    -->
    <button type="button" class="admin-sair desk-only" @click="logout">Sair da conta</button>
  </aside>

  <!-- Barra inferior: só no celular (o CSS a esconde a partir de 860px). -->
  <nav class="admin-tabbar" aria-label="Menu principal do painel">
    <NuxtLink
      v-for="l in principais"
      :key="l.to"
      :to="l.to"
      :class="{ active: isActive(l) }"
      :aria-current="isActive(l) ? 'page' : undefined"
    >
      <AppIcon :name="l.icon" />
      <span>{{ l.label === "Dashboard" ? "Início" : l.label }}</span>
    </NuxtLink>
    <button
      type="button"
      :class="{ active: maisAtivo }"
      aria-haspopup="dialog"
      @click="abrirMais"
    >
      <AppIcon name="more" />
      <span>Mais</span>
    </button>
  </nav>

  <dialog ref="maisDialog" class="admin-more" aria-label="Mais opções" @click.self="fecharMais">
    <div class="admin-more-in">
      <div class="admin-more-head">
        <strong>Mais</strong>
        <button type="button" class="admin-more-x" aria-label="Fechar" @click="fecharMais">
          <AppIcon name="close" />
        </button>
      </div>
      <NuxtLink
        v-for="l in secundarios"
        :key="l.to"
        :to="l.to"
        :class="{ active: isActive(l) }"
        :aria-current="isActive(l) ? 'page' : undefined"
      >
        <AppIcon :name="l.icon" />
        {{ l.label }}
      </NuxtLink>
      <a :href="siteUrl" target="_blank" rel="noopener">
        <AppIcon name="external" />
        Ver site
        <span class="sr-only">(abre em nova aba)</span>
      </a>
      <AdminInstallButton />
      <hr />
      <button type="button" class="admin-more-sair" @click="logout">Sair da conta</button>
    </div>
  </dialog>
</template>

<style scoped>
.admin-nav :deep(svg) {
  width: 18px;
  height: 18px;
  flex: none;
}
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
