<script setup lang="ts">
import {
  brl,
  type DadosFinanceiros,
  type DadosImovel,
  type DadosPessoa,
  type NovoAdiantamento,
  registrarAdiantamento,
  removerAdiantamento,
  salvarConferenciaFinal,
  salvarFinanceiro,
  salvarImovel,
  salvarPessoa,
} from '../../../../domain/acoes-processo'
import { ETAPAS_VENDA, progresso, STATUS_VENDA, statusFinal, TOTAL_ETAPAS } from '../../../../domain/status'
import { CORRETORES } from '../../../../domain/seed'
import type { ConferenciaFinal, StatusVenda } from '../../../../domain/types'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()

await store.carregar()

// Só enxerga o que `visiveis` devolve: corretor com «só os meus» pedindo o
// processo de outro cai em «não encontrado», sem revelar que ele existe.
const processo = computed(() => store.visiveis.value.find((p) => p.id === String(route.params.id)) ?? null)
const caps = computed(() => store.caps(processo.value))
const final = computed(() => (processo.value ? statusFinal(processo.value.status) : false))
const docs = computed(() =>
  store.documentos.value.filter((d) => d.processoId === processo.value?.id && !d.apagado),
)

// Etapa em exibição: estado local. Navegar pelas etapas não altera o processo.
const etapaVista = ref(processo.value?.etapa ?? 1)
const aba = ref<'etapas' | 'comissao'>('etapas')

const prog = computed(() => progresso(processo.value?.concluidas ?? []))
const podeValores = computed(() => !!caps.value?.valores)
// Etapas 6 e 7 têm dono próprio (recepção / jurídico): o jurídico não tem
// `editar`, e sem esta exceção ninguém do seu perfil conseguiria concluir a 7.
const podeNaEtapa = (etapa: number) => {
  const c = caps.value
  if (!c || final.value) return false
  if (etapa === 6) return c.conferir
  if (etapa === 7) return c.juridico
  return c.editar
}
const podeMudarStatus = computed(() => !final.value && !!(caps.value?.editar || caps.value?.juridico))

/** Executa uma ação do store e avisa o resultado; devolve se deu certo. */
function executar(fn: Parameters<typeof store.aplicar>[0], sucesso?: string): boolean {
  const r = store.aplicar(fn)
  if (!r.ok) {
    toast.error(r.erro)
    return false
  }
  if (sucesso) toast.success(sucesso)
  return true
}

const nomeCorretor = (id: string) => CORRETORES.find((c) => c.id === id)?.nome ?? id

const selectStatus = ref<HTMLSelectElement | null>(null)

async function mudarStatus(e: Event) {
  const p = processo.value
  const novo = (e.target as HTMLSelectElement).value as StatusVenda
  if (!p || novo === p.status) return
  const cancelar = novo === 'Venda cancelada'
  if (cancelar || novo === 'Venda concluída') {
    const ok = await askConfirm({
      title: cancelar ? `Cancelar a venda ${p.id}?` : `Concluir a venda ${p.id}?`,
      description: 'O processo passa a aceitar só consulta e não poderá ser reaberto nesta demonstração.',
      confirmLabel: cancelar ? 'Cancelar venda' : 'Concluir venda',
      cancelLabel: 'Voltar',
      danger: cancelar,
    })
    if (!ok) {
      // O <select> já mostra a opção nova; sem isto ele ficaria dizendo «cancelada» sem ter sido.
      if (selectStatus.value) selectStatus.value.value = p.status
      return
    }
  }
  if (!executar((s, a) => store.acoes.mudarStatus(s, p.id, novo, a), `Status: ${novo}.`)) {
    if (selectStatus.value) selectStatus.value.value = p.status
    return
  }
  etapaVista.value = processo.value?.etapa ?? etapaVista.value
}

function concluirEtapa() {
  const p = processo.value
  if (!p) return
  const feita = etapaVista.value
  if (executar((s, a) => store.acoes.concluirEtapa(s, p.id, feita, a), `Etapa ${feita} concluída.`)) {
    etapaVista.value = Math.min(feita + 1, TOTAL_ETAPAS)
  }
}

function salvarFin(dados: DadosFinanceiros) {
  const p = processo.value
  if (p) executar((s, a) => salvarFinanceiro(s, p.id, dados, a), 'Checklist comercial salvo.')
}

function salvarParte(quem: 'vendedor' | 'comprador', dados: DadosPessoa) {
  const p = processo.value
  if (p) executar((s, a) => salvarPessoa(s, p.id, quem, dados, a), 'Cadastro salvo.')
}

function salvarDadosImovel(dados: DadosImovel) {
  const p = processo.value
  if (p) executar((s, a) => salvarImovel(s, p.id, dados, a), 'Dados do imóvel salvos.')
}

function salvarConferencia(dados: ConferenciaFinal) {
  const p = processo.value
  if (p) executar((s, a) => salvarConferenciaFinal(s, p.id, dados, a), 'Conferência final salva.')
}

async function concluirVenda() {
  const p = processo.value
  if (!p) return
  const ok = await askConfirm({
    title: `Concluir a venda ${p.id}?`,
    description: 'O processo passa a aceitar só consulta.',
    confirmLabel: 'Concluir venda',
  })
  if (ok) executar((s, a) => store.acoes.mudarStatus(s, p.id, 'Venda concluída', a), 'Venda concluída.')
}

function registrar(dados: NovoAdiantamento) {
  const p = processo.value
  if (p) executar((s, a) => registrarAdiantamento(s, p.id, dados, a), `Adiantamento de ${brl(dados.valor)} registrado.`)
}

async function remover(adId: string) {
  const p = processo.value
  const ad = p?.adiantamentos.find((a) => a.id === adId)
  if (!p || !ad) return
  const ok = await askConfirm({
    title: `Remover o adiantamento de ${brl(ad.valor)}?`,
    description: 'A remoção fica registrada no histórico do processo.',
    confirmLabel: 'Remover',
    danger: true,
  })
  if (ok) executar((s, a) => removerAdiantamento(s, p.id, adId, a), 'Adiantamento removido.')
}

const btn =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--paper)]'
const aba_ = (ativa: boolean) =>
  `min-h-11 rounded-t-[10px] border border-b-0 px-4 font-bold ${
    ativa ? 'border-[var(--line-2)] bg-[var(--paper)] text-[var(--brand)]' : 'border-transparent text-[var(--ink-soft)]'
  }`
</script>

<template>
  <!-- Processo inexistente ou de outro corretor: nada do dado alheio é renderizado. -->
  <div v-if="!processo" class="mx-auto max-w-xl rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6" data-testid="nao-encontrado">
    <h1 class="m-0 mb-2 text-[length:var(--fs-title)] font-extrabold">Processo não encontrado</h1>
    <p class="m-0 mb-4 text-[var(--ink-soft)]">
      Esse processo não existe ou você não tem acesso a ele.
    </p>
    <NuxtLink to="/gestao/vendas" class="inline-flex min-h-11 items-center font-bold text-[var(--brand)] underline">
      ← Voltar para a lista
    </NuxtLink>
  </div>

  <div v-else class="flex flex-col gap-4">
    <header class="flex flex-col gap-3">
      <NuxtLink to="/gestao/vendas" class="inline-flex min-h-11 w-fit items-center font-bold text-[var(--brand)] no-underline hover:underline">
        ← Voltar para a lista
      </NuxtLink>

      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span class="rounded-full border border-[var(--line-2)] bg-[var(--paper)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-extrabold">
              {{ processo.id }}
            </span>
            <GestaoStatusChip :status="processo.status" />
          </div>
          <h1 class="m-0 text-[length:var(--fs-title)] font-extrabold leading-tight">{{ processo.imovel }}</h1>
          <p class="m-0 text-[var(--ink-soft)]">
            {{ processo.vendedor.nome }} · {{ processo.comprador.nome }} ·
            {{ nomeCorretor(processo.corretorId) }}
          </p>
        </div>

        <label class="flex flex-col gap-1 text-[length:var(--fs-label)] font-bold">
          Status da venda
          <select
            ref="selectStatus"
            :value="processo.status"
            :disabled="!podeMudarStatus"
            class="min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]"
            data-testid="select-status"
            @change="mudarStatus"
          >
            <option v-for="s in STATUS_VENDA" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
      </div>

      <p
        v-if="final"
        class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 font-semibold"
        role="status"
        data-testid="aviso-final"
      >
        Processo {{ processo.status === 'Venda cancelada' ? 'cancelado' : 'concluído' }}: somente consulta. Nada mais pode ser alterado.
      </p>
    </header>

    <div>
      <div class="mb-1 flex justify-between text-[length:var(--fs-label)] font-bold">
        <span>Progresso</span>
        <span data-testid="progresso-texto">{{ prog.texto }}</span>
      </div>
      <div
        class="h-2.5 overflow-hidden rounded-full bg-[var(--line)]"
        role="progressbar"
        aria-label="Progresso do processo"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="prog.pct"
      >
        <div class="h-full bg-[var(--brand)]" :style="{ width: `${prog.pct}%` }" />
      </div>
    </div>

    <GestaoStepper :vista="etapaVista" :atual="processo.etapa" :concluidas="processo.concluidas" @ir="etapaVista = $event" />

    <!-- Abas: Etapas | Comissão (trancada sem `valores`) -->
    <div class="flex gap-1 border-b border-[var(--line-2)]" role="tablist" aria-label="Seções do processo">
      <button type="button" role="tab" :aria-selected="aba === 'etapas'" :class="aba_(aba === 'etapas')" data-testid="aba-etapas" @click="aba = 'etapas'">
        Etapas
      </button>
      <button
        v-if="podeValores"
        type="button"
        role="tab"
        :aria-selected="aba === 'comissao'"
        :class="aba_(aba === 'comissao')"
        data-testid="aba-comissao"
        @click="aba = 'comissao'"
      >
        Comissão
      </button>
      <span
        v-else
        role="tab"
        aria-disabled="true"
        class="inline-flex min-h-11 items-center px-4 font-bold text-[var(--ink-soft)]"
        data-testid="aba-comissao"
      >
        🔒 Comissão · Só jurídico e dono
      </span>
      <!-- Fora do painel de etapa de propósito: vale em qualquer etapa, perfil e
           status — processo encerrado é só leitura, mas consultar documento não. -->
      <NuxtLink
        :to="`/gestao/documentos?processo=${processo.id}&de=processo`"
        class="ml-auto inline-flex min-h-11 items-center px-2 font-bold text-[var(--brand)] underline"
        data-testid="link-documentos"
      >
        Documentos do processo →
      </NuxtLink>
    </div>

    <div class="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div class="flex min-w-0 flex-col gap-3">
        <template v-if="aba === 'comissao' && podeValores">
          <GestaoComissao :processo="processo" :editavel="!final" @registrar="registrar" @remover="remover" />
        </template>
        <template v-else>
          <GestaoEtapaPainel
            :processo="processo"
            :etapa="etapaVista"
            :documentos="docs"
            :pode-editar="podeNaEtapa(etapaVista)"
            :pode-checklist="etapaVista === 6 ? !!caps?.conferir : !!caps?.juridico"
            :pode-concluir-venda="!final && !!(caps?.editar || caps?.juridico)"
            @salvar-financeiro="salvarFin"
            @salvar-pessoa="salvarParte"
            @salvar-imovel="salvarDadosImovel"
            @salvar-conferencia="salvarConferencia"
            @concluir-venda="concluirVenda"
          />

          <div class="flex flex-wrap items-center gap-2">
            <button type="button" :class="btn" :disabled="etapaVista <= 1" @click="etapaVista--">← Etapa anterior</button>
            <button
              v-if="etapaVista === processo.etapa && etapaVista < TOTAL_ETAPAS && !final"
              type="button"
              class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!podeNaEtapa(etapaVista)"
              data-testid="concluir-etapa"
              @click="concluirEtapa"
            >
              Concluir etapa {{ etapaVista }}
            </button>
            <button type="button" :class="btn" :disabled="etapaVista >= TOTAL_ETAPAS" @click="etapaVista++">Próxima etapa →</button>
          </div>
          <p v-if="!final && etapaVista === processo.etapa && etapaVista < TOTAL_ETAPAS && !podeNaEtapa(etapaVista)" class="m-0 text-[var(--ink-soft)]">
            Seu perfil não conclui a etapa {{ etapaVista }} ({{ ETAPAS_VENDA[etapaVista - 1] }}).
          </p>
        </template>
      </div>

      <aside class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="hist-titulo">
        <h2 id="hist-titulo" class="m-0 mb-2 text-[length:var(--fs-body)] font-extrabold">Histórico</h2>
        <p v-if="!processo.hist.length" class="m-0 text-[var(--ink-soft)]">Nenhum evento ainda.</p>
        <ol v-else class="m-0 flex list-none flex-col gap-2 p-0" data-testid="historico">
          <li v-for="(h, i) in processo.hist" :key="i" class="border-b border-[var(--line)] pb-2 last:border-b-0">
            <span class="block font-semibold">{{ h.acao }}</span>
            <span class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ h.quem }} · {{ h.quando }}</span>
          </li>
        </ol>
      </aside>
    </div>
  </div>
</template>
