<script setup lang="ts">
import { filtroArquivadosDaUrl, type Pagina, queryDosArquivados } from '../../../domain/paginacao'
import type { Locacao, Processo } from '../../../domain/types'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Arquivados' })

const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()

await store.carregar(false, ['base', 'corretores', 'vendas', 'locacoes'])

const podeRestaurar = computed(() => !!store.caps()?.arquivar)

// Vendas e locações são duas listas: uma por vez (`?tipo=`), cada uma paginada no servidor. Página e busca
// também na URL (`useListaPaginada`). Quem chega a esta tela já passou pelo guarda de menu.
const { filtro, resultado, falhou, q, carregar, irParaPagina, mudar } = useListaPaginada(
  async (f): Promise<Pagina<Processo | Locacao>> =>
    f.tipo === 'venda' ? await store.paginaDeVendas({ ...f, status: '', arquivados: true }) : await store.paginaDeLocacoes({ ...f, status: '', arquivados: true }),
  filtroArquivadosDaUrl,
  queryDosArquivados,
)
const arquivados = computed(() =>
  (resultado.value?.itens ?? []).map((c) =>
    'vendedor' in c
      ? { tipo: 'venda' as const, id: c.id, status: c.status, titulo: `${c.vendedor.nome} e ${c.comprador.nome}`, imovel: c.imovel, corretorId: c.corretorId, updated: c.updated }
      : { tipo: 'locacao' as const, id: c.id, status: c.status, titulo: `${c.locador.nome} e ${c.locatario.nome}`, imovel: c.imovel, corretorId: c.corretorId, updated: c.updated },
  ),
)
const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? '—'

async function restaurar(id: string, tipo: 'venda' | 'locacao') {
  const ok = await askConfirm({
    title: `Restaurar o contrato ${id}?`,
    description: `Ele volta para a lista de contratos de ${tipo === 'venda' ? 'venda' : 'locação'}, ainda como somente consulta.`,
    confirmLabel: 'Restaurar',
    cancelLabel: 'Voltar',
  })
  if (!ok) return
  const r = await store.executar(tipo, id, tipo === 'venda' ? 'restaurarProcesso' : 'restaurarLocacao', {})
  if (r.ok) {
    toast.success('Contrato restaurado.')
    await carregar()
  } else toast.error(r.erro)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="m-0 text-[length:var(--fs-title)] font-bold">Arquivados</h1>
      <p class="m-0 text-[var(--ink-soft)]">Contratos encerrados que saíram da lista. Nada é apagado: dá para restaurar.</p>
    </div>

    <div role="tablist" aria-label="Tipo de contrato" class="flex border-b border-[var(--line)]">
      <button
        v-for="t in [{ chave: 'venda', rotulo: 'Vendas' }, { chave: 'locacao', rotulo: 'Locações' }] as const"
        :key="t.chave"
        type="button"
        role="tab"
        :aria-selected="filtro.tipo === t.chave"
        :class="['min-h-11 cursor-pointer border-b-2 px-4 font-bold focus-visible:outline-2 focus-visible:outline-[var(--brand)]', filtro.tipo === t.chave ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]']"
        :data-testid="`arquivados-aba-${t.chave}`"
        @click="mudar({ tipo: t.chave })"
      >
        {{ t.rotulo }}
      </button>
    </div>

    <input
      v-model="q"
      type="search"
      class="min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]"
      placeholder="Nome, CPF, imóvel, corretor ou código"
      aria-label="Buscar arquivados"
      autocomplete="off"
      data-testid="arquivados-busca"
    />

    <div v-if="falhou" role="alert" class="flex flex-col items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-5">
      <p class="m-0 font-bold">Não foi possível carregar os arquivados.</p>
      <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="carregar">Tentar de novo</button>
    </div>

    <p v-else-if="!resultado" class="m-0 text-[var(--ink-soft)]" aria-busy="true">Carregando…</p>

    <p
      v-else-if="!arquivados.length"
      class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink-soft)]"
      data-testid="arquivados-vazio"
    >
      {{ q.trim() ? 'Nenhum arquivado encontrado para essa busca.' : 'Nenhum contrato arquivado. Contratos concluídos ou cancelados podem ser arquivados a partir do detalhe.' }}
    </p>

    <ul v-else class="m-0 flex list-none flex-col gap-3 p-0" data-testid="arquivados-lista">
      <li
        v-for="p in arquivados"
        :key="`${p.tipo}-${p.id}`"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
        data-testid="arquivado-item"
        :data-processo-id="p.id"
      >
        <div class="min-w-0">
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <strong>{{ p.id }}</strong>
            <GestaoStatusChip :status="p.status" />
          </div>
          <p class="m-0 font-bold">{{ p.titulo }}</p>
          <p class="m-0 text-[var(--ink-soft)]">{{ p.imovel }} · {{ nomeCorretor(p.corretorId) }} · {{ p.updated }}</p>
        </div>
        <button
          v-if="podeRestaurar"
          type="button"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]"
          data-testid="restaurar-contrato"
          @click="restaurar(p.id, p.tipo)"
        >
          Restaurar contrato
        </button>
      </li>
    </ul>

    <GestaoPaginacao
      v-if="resultado"
      :pagina="resultado.pagina"
      :paginas="resultado.paginas"
      :total="resultado.total"
      rotulo="arquivados"
      @ir="irParaPagina"
    />
  </div>
</template>
