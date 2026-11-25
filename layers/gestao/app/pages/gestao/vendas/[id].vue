<script setup lang="ts">
import {
  brl,
  type DadosFinanceiros,
  type DadosImovel,
  type DadosPessoa,
  type NovoAdiantamento,
} from '../../../../domain/acoes-processo'
import type { DadosAbertura } from '../../../../domain/acoes-ciclo'
import { validarArquivo } from '../../../../domain/documentos'
import { pendenciasEtapa, type Requisito } from '../../../../domain/requisitos'
import { ETAPAS_VENDA, progresso, STATUS_VENDA, statusFinal, TOTAL_ETAPAS } from '../../../../domain/status'
import type { ConferenciaFinal, Documento, StatusVenda } from '../../../../domain/types'
import type { ArquivoGestao as ArquivoEscolhido } from '../../../services/GestaoRepository'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const store = useGestaoStore()
const toast = useToast()
const demo = !!useRuntimeConfig().public.gestaoDemo && !useGestaoHttp()
const { askConfirm } = useConfirm()

await store.carregar(false, ['base', 'corretores', 'config', 'vendas'])
await Promise.all([store.carregarDetalhe('venda', String(route.params.id)), store.carregarDocumentos('venda', String(route.params.id))])

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
const aba = ref<'etapas' | 'comissao' | 'observacoes'>('etapas')
// Mesmo critério do servidor (`salvarAnotacoes` em gestao-vendas-acoes.ts): todo perfil que vê o
// processo escreve; só o processo encerrado trava, como o resto dele.
const podeAnotar = computed(() => !final.value)
const motivoSemAnotar = computed(() => (podeAnotar.value ? '' : 'Processo encerrado: somente consulta.'))

const prog = computed(() => progresso(processo.value?.concluidas ?? []))
// Comissão: quem vê o financeiro deste processo (`valores`, ou o corretor dele com `financeiroLivre`).
const podeFinanceiro = computed(() => !!caps.value?.verFinanceiro)
const podeEditarFinanceiro = computed(() => !final.value && !!caps.value?.editarFinanceiro)
const analisando = ref(false)
// Etapas 6 e 7 têm dono próprio (recepção / jurídico): o jurídico não tem
// `editar`, e sem esta exceção ninguém do seu perfil conseguiria concluir a 7.
const podeNaEtapa = (etapa: number) => {
  const c = caps.value
  if (!c || final.value) return false
  if (etapa === 6) return c.conferir
  if (etapa === 7) return c.juridico
  return c.editar
}
// Pendências da etapa em exibição: a mesma função que `concluirEtapa` usa para recusar.
const pendencias = computed(() =>
  processo.value && !final.value ? pendenciasEtapa(processo.value, docs.value, etapaVista.value) : [],
)
const podeEnviarArquivo = computed(() => !final.value && !!caps.value?.enviarDocs)
const podeConferirArquivo = computed(() => !final.value && !!caps.value?.conferir)

const podeMudarStatus = computed(() => !final.value && !!(caps.value?.editar || caps.value?.juridico))

/**
 * Executa uma ação de venda pelo NOME (o servidor despacha pela mesma chave) e avisa o resultado;
 * devolve se deu certo. 409 e 422 chegam aqui como `erro` já com a frase certa.
 */
async function executar(id: string, acao: string, dados: unknown, sucesso?: string): Promise<boolean> {
  const r = await store.executar('venda', id, acao, dados)
  if (!r.ok) {
    toast.error(r.erro)
    return false
  }
  if (sucesso) toast.success(sucesso)
  return true
}

const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? id

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
  if (!(await executar(p.id, 'mudarStatus', { status: novo }, `Status: ${novo}.`))) {
    if (selectStatus.value) selectStatus.value.value = p.status
    return
  }
  etapaVista.value = processo.value?.etapa ?? etapaVista.value
}

/** Envio, aprovação e devolução da análise do financeiro: mesmas ações do servidor. */
async function analisar(acao: 'enviarAnaliseFinanceira' | 'aprovarAnaliseFinanceira' | 'devolverAnaliseFinanceira', dados: unknown, sucesso: string) {
  const p = processo.value
  if (!p) return
  analisando.value = true
  await executar(p.id, acao, dados, sucesso)
  analisando.value = false
}

async function concluirEtapa() {
  const p = processo.value
  if (!p) return
  const feita = etapaVista.value
  if (await executar(p.id, 'concluirEtapa', { etapa: feita }, `Etapa ${feita} concluída.`)) {
    etapaVista.value = Math.min(feita + 1, TOTAL_ETAPAS)
  }
}

function salvarFin(dados: DadosFinanceiros) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarFinanceiro', { valor: dados.valor, fin: dados.fin }, 'Checklist comercial salvo.')
}

function salvarParte(quem: 'vendedor' | 'comprador', dados: DadosPessoa) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarPessoa', { quem, cpf: dados.cpf, telefone: dados.telefone, email: dados.email }, 'Cadastro salvo.')
}

function salvarDadosImovel(dados: DadosImovel) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarImovel', { matriculaMae: dados.matriculaMae, valorVenal: dados.valorVenal }, 'Dados do imóvel salvos.')
}

function salvarMatriculaMae(mae: boolean) {
  const p = processo.value
  if (p) void executar(p.id, 'marcarMatriculaMae', { matriculaMae: mae }, mae ? 'Matrícula-mãe marcada.' : 'Matrícula-mãe desmarcada.')
}

function salvarConferencia(dados: ConferenciaFinal) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarConferenciaFinal', dados, 'Conferência final salva.')
}

function salvarDadosAbertura(dados: DadosAbertura) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarAbertura', dados, 'Abertura salva.')
}

function salvarObs(texto: string) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarObservacao', { obs: texto }, 'Observações salvas.')
}

function salvarAnotacoes(texto: string) {
  const p = processo.value
  if (p) void executar(p.id, 'salvarAnotacoes', { anotacoes: texto }, 'Observações do contrato salvas.')
}

async function cancelarVenda() {
  const p = processo.value
  if (!p) return
  const ok = await askConfirm({
    title: `Cancelar a venda ${p.id}?`,
    description: 'O processo passa a aceitar só consulta e não poderá ser reaberto nesta demonstração.',
    confirmLabel: 'Cancelar venda',
    cancelLabel: 'Voltar',
    danger: true,
  })
  if (ok) await executar(p.id, 'mudarStatus', { status: 'Venda cancelada' }, 'Venda cancelada.')
}

async function arquivar() {
  const p = processo.value
  if (!p) return
  const ok = await askConfirm({
    title: 'Arquivar este contrato?',
    description: 'Ele sai da lista de contratos e vai para «Arquivados». Pode ser restaurado depois.',
    confirmLabel: 'Arquivar contrato',
    cancelLabel: 'Voltar',
  })
  if (ok && (await executar(p.id, 'arquivarProcesso', {}, 'Contrato arquivado.'))) await navigateTo('/gestao/vendas')
}

async function concluirVenda() {
  const p = processo.value
  if (!p) return
  const ok = await askConfirm({
    title: `Concluir a venda ${p.id}?`,
    description: 'O processo passa a aceitar só consulta.',
    confirmLabel: 'Concluir venda',
  })
  if (ok) await executar(p.id, 'mudarStatus', { status: 'Venda concluída' }, 'Venda concluída.')
}

// Arquivos dos itens do checklist. Em `mock` guarda só nome e tamanho (sem binário); em `http` o
// arquivo sobe de verdade (URL assinada). A validação de tipo e tamanho é a mesma da tela de documentos.
async function enviarArquivo(r: Requisito, arq: ArquivoEscolhido) {
  const p = processo.value
  if (!p) return
  const erro = validarArquivo(arq.name, arq.size)
  if (erro) return void toast.error(erro)
  const res = await store.enviarDocumento('venda', p.id, arq, { categoria: r.categoria, requisito: r.chave })
  if (res.ok) toast.success('Documento enviado.')
  else toast.error(res.erro)
}

async function trocarArquivo(d: Documento, arq: ArquivoEscolhido) {
  const erro = validarArquivo(arq.name, arq.size)
  if (erro) return void toast.error(erro)
  const res = await store.novaVersaoDocumento(d, arq)
  if (res.ok) toast.success('Arquivo trocado.')
  else toast.error(res.erro)
}

async function conferirArquivo(d: Documento) {
  const res = await store.conferirDocumento(d)
  if (res.ok) toast.success('Documento conferido.')
  else toast.error(res.erro)
}

/** Sobe o comprovante antes de gravar; se o envio falhar, nada é registrado. Devolve o nome, `null` (sem arquivo) ou `undefined` (falhou, já avisou). */
async function subirComprovante(p: { id: string }, arquivo: File | null): Promise<string | null | undefined> {
  if (!arquivo) return null
  const up = await store.subirComprovante('venda', p.id, arquivo)
  if (up.ok) return up.nome
  toast.error(up.erro)
  return undefined
}

async function registrar(dados: NovoAdiantamento, arquivo: File | null) {
  const p = processo.value
  if (!p) return
  const nome = await subirComprovante(p, arquivo)
  if (nome === undefined) return
  void executar(p.id, 'registrarAdiantamento', { ...dados, comprovante: nome ?? dados.comprovante }, `Adiantamento de ${brl(dados.valor)} registrado.`)
}

async function pagarAdiantamento(adId: string, arquivo: File | null) {
  const p = processo.value
  if (!p) return
  const comprovante = await subirComprovante(p, arquivo)
  if (comprovante === undefined) return
  void executar(p.id, 'marcarAdiantamentoPago', { adiantamentoId: adId, comprovante }, 'Adiantamento marcado como pago.')
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
  if (ok) await executar(p.id, 'removerAdiantamento', { adiantamentoId: adId }, 'Adiantamento removido.')
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
  <div v-if="!processo" class="mx-auto w-full max-w-xl rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6" data-testid="nao-encontrado">
    <h1 class="m-0 mb-2 text-[length:var(--fs-title)] font-bold">Processo não encontrado</h1>
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
            <span class="rounded-full border border-[var(--line-2)] bg-[var(--paper)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold">
              {{ processo.id }}
            </span>
            <GestaoStatusChip :status="processo.status" />
            <GestaoAnaliseSelo v-if="processo.analiseFin && processo.analiseFin.status !== 'rascunho'" :status="processo.analiseFin.status" />
          </div>
          <h1 class="m-0 text-[length:var(--fs-title)] font-bold leading-tight">{{ processo.imovel }}</h1>
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

    <!-- Abas: Etapas | Comissão. Sem acesso ao financeiro a aba nem existe: avisar que algo está
         escondido só convida a pedir acesso, e o perfil não precisa saber que há comissão. -->
    <div class="flex gap-1 border-b border-[var(--line-2)]" role="tablist" aria-label="Seções do processo">
      <button type="button" role="tab" :aria-selected="aba === 'etapas'" :class="aba_(aba === 'etapas')" data-testid="aba-etapas" @click="aba = 'etapas'">
        Etapas
      </button>
      <button
        v-if="podeFinanceiro"
        type="button"
        role="tab"
        :aria-selected="aba === 'comissao'"
        :class="aba_(aba === 'comissao')"
        data-testid="aba-comissao"
        @click="aba = 'comissao'"
      >
        Comissão
      </button>
      <!-- Para todo perfil que vê o processo: quem pediu o campo foi a recepção, que não vê a comissão. -->
      <button
        type="button"
        role="tab"
        :aria-selected="aba === 'observacoes'"
        :class="aba_(aba === 'observacoes')"
        data-testid="aba-observacoes"
        @click="aba = 'observacoes'"
      >
        Observações<span v-if="processo.anotacoes" class="ml-1.5 inline-block size-2 rounded-full bg-[var(--brand)] align-middle" aria-label="(preenchidas)" />
      </button>
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

    <div class="[display:grid] gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div class="flex min-w-0 flex-col gap-3">
        <template v-if="aba === 'comissao' && podeFinanceiro">
          <GestaoAnaliseFinanceira
            v-if="processo.analiseFin"
            :analise="processo.analiseFin"
            :pode-enviar="podeEditarFinanceiro"
            :pode-analisar="!final && !!caps?.valores"
            :ocupado="analisando"
            @enviar="analisar('enviarAnaliseFinanceira', {}, 'Financeiro enviado para análise.')"
            @aprovar="analisar('aprovarAnaliseFinanceira', {}, 'Financeiro aprovado.')"
            @devolver="(motivo) => analisar('devolverAnaliseFinanceira', { motivo }, 'Financeiro devolvido ao corretor.')"
          />
          <GestaoComissao :processo="processo" :editavel="podeEditarFinanceiro" @registrar="registrar" @remover="remover" @pagar="pagarAdiantamento" />
        </template>
        <GestaoObservacoesContrato
          v-else-if="aba === 'observacoes'"
          :processo="processo"
          :editavel="podeAnotar"
          :motivo="motivoSemAnotar"
          @salvar="salvarAnotacoes"
        />
        <template v-else>
          <GestaoEtapaPainel
            :processo="processo"
            :etapa="etapaVista"
            :documentos="docs"
            :pode-editar="podeNaEtapa(etapaVista) && (etapaVista !== 5 || !!caps?.editarFinanceiro)"
            :pode-checklist="etapaVista === 6 ? !!caps?.conferir : !!caps?.juridico"
            :pode-concluir-venda="!final && !!(caps?.editar || caps?.juridico)"
            :pode-enviar="podeEnviarArquivo"
            :pode-conferir="podeConferirArquivo"
            :demo="demo"
            @salvar-financeiro="salvarFin"
            @salvar-pessoa="salvarParte"
            @salvar-imovel="salvarDadosImovel"
            @marcar-matricula-mae="salvarMatriculaMae"
            @salvar-conferencia="salvarConferencia"
            :pode-arquivar="final && !!caps?.arquivar"
            @concluir-venda="concluirVenda"
            @cancelar-venda="cancelarVenda"
            @arquivar="arquivar"
            @salvar-abertura="salvarDadosAbertura"
            @salvar-observacao="salvarObs"
            @enviar-requisito="enviarArquivo"
            @trocar-arquivo="trocarArquivo"
            @conferir-doc="conferirArquivo"
          />

          

          <div class="flex flex-wrap items-center gap-2">
            <button type="button" :class="btn" :disabled="etapaVista <= 1" @click="etapaVista--">← Etapa anterior</button>
            <button
              v-if="etapaVista === processo.etapa && etapaVista < TOTAL_ETAPAS && !final"
              type="button"
              class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!podeNaEtapa(etapaVista) || pendencias.length > 0"
              :aria-describedby="pendencias.length ? 'pendencias-etapa' : undefined"
              data-testid="concluir-etapa"
              @click="concluirEtapa"
            >
              Concluir etapa {{ etapaVista }}
            </button>
            <button type="button" :class="btn" :disabled="etapaVista >= TOTAL_ETAPAS" @click="etapaVista++">Próxima etapa →</button>
          </div>
          <!-- Motivo do botão desabilitado, colado nele: antes ficava acima, fora da vista em tela pequena. -->
          <!-- O que falta para concluir: o botão só habilita sem pendências. -->
          <div
            v-if="pendencias.length && etapaVista === processo.etapa && etapaVista < TOTAL_ETAPAS"
            id="pendencias-etapa"
            class="rounded-[10px] bg-[#fef3c7] px-3 py-2 text-[#78350f]"
            role="note"
            data-testid="pendencias-etapa"
          >
            <strong class="block">Para concluir a etapa {{ etapaVista }}:</strong>
            <ul class="m-0 list-disc pl-5">
              <li v-for="m in pendencias" :key="m">{{ m }}</li>
            </ul>
          </div>
          <p v-if="!final && etapaVista === processo.etapa && etapaVista < TOTAL_ETAPAS && !podeNaEtapa(etapaVista)" class="m-0 text-[var(--ink-soft)]">
            Seu perfil não conclui a etapa {{ etapaVista }} ({{ ETAPAS_VENDA[etapaVista - 1] }}).
          </p>
        </template>
      </div>

      <aside class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="hist-titulo">
        <h2 id="hist-titulo" class="m-0 mb-2 text-[length:var(--fs-body)] font-bold">Histórico</h2>
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
