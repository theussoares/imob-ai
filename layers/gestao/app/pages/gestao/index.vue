<script setup lang="ts">

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Dashboard · Gestão' })

const store = useGestaoStore()
const { sessao } = useGestaoSessao()
await store.carregar(false, ['base'])

// Listas já filtradas por perfil: o corretor vê o painel só dos contratos dele.
// Contagens do servidor (`http`, sobre todos os contratos) ou calculadas aqui (`mock`): ver `store.lerDashboard`.
const r = ref(await store.lerDashboard().catch(() => null))
async function atualizar() {
  try {
    r.value = await store.lerDashboard()
  } catch {
    /* segue o aviso; tenta de novo no botão */
  }
}
const caps = computed(() => store.caps())

const ROTULO_NIVEL = { info: 'Aviso', atencao: 'Atenção', urgente: 'Urgente', vencido: 'Vencido' } as const
const TONS = {
  info: 'bg-[#dbeafe] text-[#1e3a8a]',
  atencao: 'bg-[#fef3c7] text-[#78350f]',
  urgente: 'bg-[#ffedd5] text-[#7c2d12]',
  vencido: 'bg-[#fee2e2] text-[#7f1d1d]',
} as const
</script>

<template>
  <section class="[display:grid] gap-6">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Dashboard</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Olá, {{ sessao?.nome }}. Este é o resumo dos contratos que você acompanha.</p>
    </header>

    <div v-if="!r" role="alert" class="[display:grid] justify-items-start gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-5">
      <p class="m-0 font-bold">Não foi possível carregar os totais.</p>
      <button type="button" class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="atualizar">Tentar de novo</button>
    </div>

    <template v-else>
    <p v-if="r.truncado" role="status" class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] p-3 text-[var(--ink-soft)]" data-testid="aviso-truncado">
      Há mais de 5000 contratos de cada tipo: os totais cobrem só os mais recentes.
    </p>

    <div class="[display:grid] gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GestaoIndicador rotulo="Vendas em andamento" :valor="String(r.vendas.andamento)" :detalhe="`${r.vendas.concluidas} concluídas · ${r.vendas.canceladas} canceladas`" to="/gestao/vendas" testid="dash-vendas" />
      <GestaoIndicador rotulo="Locações ativas" :valor="String(r.locacoes.ativas)" :detalhe="`${r.locacoes.implantacao} em implantação · ${r.locacoes.encerradas} encerradas`" to="/gestao/locacao" testid="dash-locacoes" />
      <GestaoIndicador rotulo="Aluguéis em atraso" :valor="String(r.aluguelEmAtraso)" :alerta="r.aluguelEmAtraso > 0" to="/gestao/locacao" testid="dash-atraso" />
      <GestaoIndicador v-if="caps?.conferir" rotulo="Documentos para conferir" :valor="String(r.documentosParaConferir)" to="/gestao/documentos" testid="dash-docs" />
    </div>

    <section class="[display:grid] gap-3" aria-labelledby="dash-atencao">
      <h2 id="dash-atencao" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Precisa de atenção</h2>
      <p v-if="!r.atencao.length" class="m-0 rounded-[14px] border border-dashed border-[var(--line-2)] bg-[var(--paper)] p-5 text-[var(--ink-soft)]" data-testid="dash-nada">
        Nada pendente por aqui.
      </p>
      <ul v-else class="m-0 flex list-none flex-col gap-2 p-0" data-testid="dash-atencao">
        <li v-for="a in r.atencao" :key="a.id + a.texto">
          <NuxtLink
            :to="a.href"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] no-underline hover:bg-[var(--brand-ghost)]"
            data-testid="dash-item"
          >
            <span class="rounded-full px-2.5 text-[length:var(--fs-caption)] font-bold" :class="TONS[a.nivel]">{{ ROTULO_NIVEL[a.nivel] }}</span>
            <strong>{{ a.titulo }}</strong>
            <span class="text-[var(--ink-soft)]">{{ a.texto }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>
    </template>
  </section>
</template>
