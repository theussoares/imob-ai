<script setup lang="ts">
import { hojeISO } from '../../../domain/avisos-locacao'
import { resumoDashboard } from '../../../domain/dashboard'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Dashboard · Gestão' })

const store = useGestaoStore()
const { sessao } = useGestaoSessao()
await store.carregar()

// Listas já filtradas por perfil: o corretor vê o painel só dos contratos dele.
const r = computed(() => resumoDashboard(store.visiveis.value, store.locacoesVisiveis.value, store.documentos.value, hojeISO()))
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
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-extrabold">Dashboard</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Olá, {{ sessao?.nome }}. Este é o resumo dos contratos que você acompanha.</p>
    </header>

    <div class="[display:grid] gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GestaoIndicador rotulo="Vendas em andamento" :valor="String(r.vendas.andamento)" :detalhe="`${r.vendas.concluidas} concluídas · ${r.vendas.canceladas} canceladas`" to="/gestao/vendas" testid="dash-vendas" />
      <GestaoIndicador rotulo="Locações ativas" :valor="String(r.locacoes.ativas)" :detalhe="`${r.locacoes.implantacao} em implantação · ${r.locacoes.encerradas} encerradas`" to="/gestao/locacao" testid="dash-locacoes" />
      <GestaoIndicador rotulo="Aluguéis em atraso" :valor="String(r.aluguelEmAtraso)" :alerta="r.aluguelEmAtraso > 0" to="/gestao/locacao" testid="dash-atraso" />
      <GestaoIndicador v-if="caps?.conferir" rotulo="Documentos para conferir" :valor="String(r.documentosParaConferir)" to="/gestao/documentos" testid="dash-docs" />
    </div>

    <section class="[display:grid] gap-3" aria-labelledby="dash-atencao">
      <h2 id="dash-atencao" class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">Precisa de atenção</h2>
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
  </section>
</template>
