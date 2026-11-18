<script setup lang="ts">
import { MENU, menuVisivel, PERFIS } from '../../domain/permissions'

const route = useRoute()
const tenant = useTenant()
const { sessao, sair } = useGestaoSessao()
const store = useGestaoStore()
const toast = useToast()

await store.carregar()

const itens = computed(() =>
  sessao.value ? MENU.filter((m) => menuVisivel(store.matriz.value, sessao.value!.perfil, m.chave)) : [],
)

// '/gestao' (dashboard) só fica ativo exato; as demais por prefixo.
const ativo = (rota: string) => (rota === '/gestao' ? route.path === '/gestao' : route.path.startsWith(rota))

async function trocarPerfil() {
  await sair()
  await navigateTo('/gestao/login')
}

async function restaurarDados() {
  await store.restaurar()
  toast.success('Dados de exemplo restaurados.')
}

// Grupos do menu. Item sem grupo conhecido cai em Administração, para uma
// chave nova nunca sumir do menu.
const GRUPOS: { nome: string; chaves: string[] }[] = [
  { nome: 'Operação', chaves: ['dashboard', 'imoveis', 'vendas', 'locacao'] },
  { nome: 'Financeiro', chaves: ['financeiro', 'consulta'] },
]
const grupos = computed(() => {
  const usados = new Set(GRUPOS.flatMap((g) => g.chaves))
  const lista = GRUPOS.map((g) => ({ nome: g.nome, itens: itens.value.filter((m) => g.chaves.includes(m.chave)) }))
  lista.push({ nome: 'Administração', itens: itens.value.filter((m) => !usados.has(m.chave)) })
  return lista.filter((g) => g.itens.length)
})

// Ícones de linha (24x24, traço); um caminho por item.
const ICONES: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z',
  imoveis: 'M3 11 12 3l9 8M5 10v10h14V10M10 20v-5h4v5',
  vendas: 'M6 3h9l3 3v15H6V3Zm3 7h6M9 14h6M9 18h4',
  locacao: 'M15 7a4 4 0 1 1-3.9 5L3 20v-3l2-1v-2h2l1-1 3.1-.1A4 4 0 0 1 15 7Z',
  financeiro: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  consulta: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4',
  arquivados: 'M4 5h16v4H4V5Zm1 4v11h14V9M10 13h4',
  auditoria: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8m0-4v4h4',
  usuarios: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6m2 8a5 5 0 0 1 3 5',
  config: 'M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6',
}

// Menu do avatar e paleta de navegação (Ctrl/Cmd+K). Fecham com Esc ou clique fora.
const menuAberto = ref(false)
const drawer = ref(false)
watch(() => route.path, () => { drawer.value = false })
const buscaAberta = ref(false)
const termo = ref('')
const campoBusca = ref<HTMLInputElement | null>(null)
const resultados = computed(() => {
  const t = termo.value.trim().toLowerCase()
  return itens.value.filter((m) => !t || m.rotulo.toLowerCase().includes(t))
})
async function abrirBusca() {
  menuAberto.value = false
  drawer.value = false
  buscaAberta.value = true
  termo.value = ''
  await nextTick()
  campoBusca.value?.focus()
}
async function ir(rota: string) {
  buscaAberta.value = false
  await navigateTo(rota)
}
function teclas(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    void abrirBusca()
  } else if (e.key === 'Escape') {
    menuAberto.value = false
    buscaAberta.value = false
    drawer.value = false
  }
}
onMounted(() => document.addEventListener('keydown', teclas))
onBeforeUnmount(() => document.removeEventListener('keydown', teclas))

const btn =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)]'
</script>

<template>
  <div class="gestao-tema flex min-h-dvh flex-col bg-[var(--surface)] text-[length:var(--fs-ui)] text-[var(--ink)]">
    <a
      href="#gestao-conteudo"
      class="absolute -left-[999px] top-2 z-50 rounded-lg bg-[var(--paper)] px-3 py-2 focus:left-2"
    >
      Ir para o conteúdo
    </a>

    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5 font-bold">
        <button
          v-if="sessao"
          type="button"
          class="[display:grid] size-11 cursor-pointer place-items-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] md:hidden"
          aria-label="Abrir menu"
          :aria-expanded="drawer"
          aria-controls="gestao-menu"
          data-testid="menu-drawer"
          @click="drawer = true"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span
          class="[display:grid] size-8 place-items-center rounded-lg bg-[var(--brand)] font-bold text-white"
          aria-hidden="true"
        >
          {{ (tenant?.name || 'G').slice(0, 1) }}
        </span>
        <span>{{ tenant?.name || 'Gestão' }}</span>
        <span
          v-if="!store.http"
          class="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]"
        >
          Demonstração
        </span>
      </div>
      <div v-if="sessao" class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[var(--ink-soft)] hover:bg-[var(--brand-ghost)]"
          data-testid="busca-global"
          aria-label="Ir para…"
          @click="abrirBusca"
        >
          <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" /></svg>
          <span class="hidden sm:inline">Ir para…</span>
          <kbd class="hidden rounded border border-[var(--line-2)] px-1.5 text-[length:var(--fs-caption)] sm:inline">Ctrl K</kbd>
        </button>
        <div class="relative">
          <button
            type="button"
            class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--paper)] py-1 pr-3 pl-1 outline-none hover:bg-[var(--brand-ghost)] focus-visible:ring-2 focus-visible:ring-[var(--line-2)]"
            aria-haspopup="menu"
            :aria-expanded="menuAberto"
            data-testid="menu-avatar"
            @click="menuAberto = !menuAberto"
          >
            <span class="[display:grid] size-9 place-items-center rounded-full bg-[var(--brand)] font-bold text-white" aria-hidden="true">
              {{ sessao.nome.slice(0, 1) }}
            </span>
            <span class="hidden flex-col text-left leading-tight sm:flex">
              <strong>{{ sessao.nome }}</strong>
              <small class="text-[var(--ink-soft)]">{{ PERFIS[sessao.perfil].nome }}</small>
            </span>
          </button>
          <div
            v-if="menuAberto"
            role="menu"
            class="absolute right-0 z-40 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2 shadow-[0_8px_24px_rgba(20,22,26,0.12)]"
          >
            <p class="m-0 px-3 py-1 text-[var(--ink-soft)]">{{ PERFIS[sessao.perfil].nome }}</p>
            <button v-if="!store.http" type="button" role="menuitem" class="min-h-11 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-left font-semibold hover:bg-[var(--surface)]" @click="menuAberto = false; restaurarDados()">
              Restaurar dados
            </button>
            <button type="button" role="menuitem" class="min-h-11 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-left font-semibold hover:bg-[var(--surface)]" data-testid="sair" @click="menuAberto = false; trocarPerfil()">
              {{ store.http ? 'Sair' : 'Trocar perfil' }}
            </button>
          </div>
          <div v-if="menuAberto" class="fixed inset-0 z-30" aria-hidden="true" @click="menuAberto = false" />
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav
        v-if="sessao"
        id="gestao-menu"
        class="flex-none flex-col gap-1 border-[var(--line)] bg-[var(--paper)] p-3 md:static md:z-auto md:flex md:w-58 md:overflow-visible md:border-r md:shadow-none"
        :class="drawer ? 'fixed inset-y-0 left-0 z-50 flex w-72 overflow-y-auto shadow-[0_0_40px_rgba(20,22,26,0.3)]' : 'hidden'"
        aria-label="Seções do painel"
      >
        <button type="button" class="mb-1 ml-auto min-h-11 cursor-pointer rounded-[10px] border-0 bg-transparent px-3 font-bold text-[var(--ink-soft)] md:hidden" @click="drawer = false">Fechar</button>
        <div v-for="g in grupos" :key="g.nome" class="flex flex-none flex-col gap-1">
          <p class="m-0 px-3 pb-1 pt-3 text-[length:var(--fs-caption)] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            {{ g.nome }}
          </p>
          <NuxtLink
            v-for="m in g.itens"
            :key="m.chave"
            :to="m.rota"
            class="flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 font-semibold no-underline hover:bg-[var(--surface)]"
            :class="
              ativo(m.rota)
                ? 'bg-[var(--surface)] font-bold text-[var(--brand)] shadow-[inset_3px_0_0_var(--brand)]'
                : 'text-[var(--ink-soft)]'
            "
            :aria-current="ativo(m.rota) ? 'page' : undefined"
          >
            <svg
              class="size-[18px] flex-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="ICONES[m.chave]" />
            </svg>
            {{ m.rotulo }}
          </NuxtLink>
        </div>
      </nav>

      <div v-if="drawer" class="fixed inset-0 z-40 bg-black/40 md:hidden" aria-hidden="true" @click="drawer = false" />

      <main id="gestao-conteudo" class="min-w-0 flex-1 p-3 outline-none md:p-5" tabindex="-1">
        <p
          v-if="store.erroCarga.value"
          role="alert"
          class="m-0 mb-3 rounded-[10px] border border-[var(--danger-line)] bg-[var(--danger-ghost)] px-3 py-2 font-semibold text-[var(--danger)]"
          data-testid="erro-carga"
        >
          {{ store.erroCarga.value }}
          <button type="button" class="ml-2 cursor-pointer font-bold underline" @click="store.carregar(true)">Tentar de novo</button>
        </p>
        <div class="mx-auto w-full max-w-6xl"><slot /></div>
      </main>
    </div>

    <div v-if="buscaAberta" class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]" @click.self="buscaAberta = false">
      <div role="dialog" aria-modal="true" aria-label="Ir para uma tela" class="w-full max-w-md overflow-hidden rounded-xl bg-[var(--paper)] shadow-[0_20px_48px_rgba(20,22,26,0.25)]">
        <input
          ref="campoBusca"
          v-model="termo"
          type="search"
          placeholder="Ir para… (Dashboard, Imóveis, Financeiro)"
          class="min-h-12 w-full border-0 border-b border-[var(--line)] px-4 text-[length:var(--fs-body)] outline-none"
          data-testid="busca-global-campo"
          @keydown.enter="resultados[0] && ir(resultados[0].rota)"
        />
        <ul class="m-0 max-h-72 list-none overflow-y-auto p-2">
          <li v-for="m in resultados" :key="m.chave">
            <button type="button" class="min-h-11 w-full cursor-pointer rounded-lg border-0 bg-transparent px-3 text-left font-semibold hover:bg-[var(--brand-ghost)]" @click="ir(m.rota)">{{ m.rotulo }}</button>
          </li>
          <li v-if="!resultados.length" class="px-3 py-3 text-[var(--ink-soft)]">Nada encontrado.</li>
        </ul>
      </div>
    </div>

    <AdminToasts />
    <AdminConfirmDialog />
  </div>
</template>
