<script setup lang="ts">
import * as acao from '../../../../domain/acoes-locacao'
import { conferirDocumento, substituirDocumento } from '../../../../domain/acoes'
import { validarArquivo } from '../../../../domain/documentos'
import { pendenciasEtapaLocacao, requisitosDaEtapaLocacao } from '../../../../domain/locacao-requisitos'
import { ETAPAS_LOCACAO, locacaoFinal, TOTAL_ETAPAS_LOCACAO } from '../../../../domain/locacao-status'
import type { Requisito } from '../../../../domain/requisitos'
import { CORRETORES } from '../../../../domain/seed'
import type { ContratoLocacao, Documento, Pessoa, Vistoria } from '../../../../domain/types'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const store = useGestaoStore()
const toast = useToast()
const demo = !!useRuntimeConfig().public.gestaoDemo
const { askConfirm } = useConfirm()
const { sessao } = useGestaoSessao()

await store.carregar()

// Só enxerga o que `locacoesVisiveis` devolve: corretor pedindo a locação de outro cai
// em «não encontrada», sem revelar que ela existe.
const locacao = computed(() => store.locacoesVisiveis.value.find((l) => l.id === String(route.params.id)) ?? null)
const caps = computed(() => store.caps(null))
const final = computed(() => (locacao.value ? locacaoFinal(locacao.value.status) : false))
const docs = computed(() => store.documentos.value.filter((d) => d.processoId === locacao.value?.id && !d.apagado))
const etapaVista = ref(locacao.value?.etapa ?? 1)

const podeEditar = computed(() => !final.value && !!caps.value?.editar)
const podeValores = computed(() => !final.value && !!caps.value?.valores)
const feitas = computed(() => locacao.value?.concluidas.filter(Boolean).length ?? 0)
const pendencias = computed(() =>
  locacao.value && !final.value ? pendenciasEtapaLocacao(locacao.value, store.documentos.value, etapaVista.value) : [],
)
// Etapa 7 é de quem vê valores; as demais, de quem edita cadastros.
const podeNaEtapa = (e: number) => (e === 7 ? podeValores.value : podeEditar.value)
const requisitos = computed(() => requisitosDaEtapaLocacao(etapaVista.value))
const nomeCorretor = (id: string) => CORRETORES.find((c) => c.id === id)?.nome ?? id

function executar(fn: Parameters<typeof store.aplicar>[0], sucesso?: string): boolean {
  const r = store.aplicar(fn)
  if (!r.ok) {
    toast.error(r.erro)
    return false
  }
  if (sucesso) toast.success(sucesso)
  return true
}

const id = () => locacao.value!.id

function concluirEtapa() {
  const feita = etapaVista.value
  if (executar((s, a) => acao.concluirEtapaLocacao(s, id(), feita, a), `Etapa ${feita} concluída.`)) {
    etapaVista.value = Math.min(feita + 1, TOTAL_ETAPAS_LOCACAO)
  }
}

function salvarPessoa(quem: 'locador' | 'locatario', pessoa: Pessoa) {
  const l = locacao.value!
  executar((s, a) => acao.salvarAberturaLocacao(s, l.id, { ...l, [quem]: pessoa }, a), 'Cadastro salvo.')
}

function salvarVistoria(quando: 'entrada' | 'saida', v: Vistoria) {
  executar((s, a) => acao.salvarVistoria(s, id(), quando, v, a), 'Vistoria salva.')
}

const salvarContrato = (c: ContratoLocacao) => executar((s, a) => acao.salvarContrato(s, id(), c, a), 'Contrato salvo.')

function enviarArquivo(r: Requisito, arq: { name: string; size: number }) {
  const erro = validarArquivo(arq.name, arq.size)
  if (erro) return void toast.error(erro)
  executar(
    (s, a) => acao.enviarDocumentoLocacao(s, { nome: arq.name, categoria: r.categoria, processoId: id(), tamanho: arq.size, requisito: r.chave }, a),
    'Documento enviado.',
  )
}

function trocarArquivo(d: Documento, arq: { name: string; size: number }) {
  const erro = validarArquivo(arq.name, arq.size)
  if (erro) return void toast.error(erro)
  executar((s) => substituirDocumento(s, d.id, arq.size), 'Arquivo trocado.')
}

async function confirmar(titulo: string, descricao: string, rotulo: string, fn: Parameters<typeof store.aplicar>[0], sucesso: string) {
  if (await askConfirm({ title: titulo, description: descricao, confirmLabel: rotulo, cancelLabel: 'Voltar' })) return executar(fn, sucesso)
  return false
}

const renovar = () =>
  confirmar('Renovar por 12 meses?', 'O fim do contrato avança 12 meses.', 'Renovar', (s, a) => acao.renovarLocacao(s, id(), a), 'Contrato renovado.')
const encerrar = () =>
  confirmar('Encerrar a locação?', 'Ela passa a aceitar só consulta.', 'Encerrar locação', (s, a) => acao.encerrarLocacao(s, id(), a), 'Locação encerrada.')

async function arquivar() {
  const ok = await confirmar('Arquivar esta locação?', 'Ela sai da lista e vai para «Arquivados». Pode ser restaurada.', 'Arquivar', (s, a) => acao.arquivarLocacao(s, id(), a), 'Locação arquivada.')
  if (ok) await navigateTo('/gestao/locacao')
}

const btn =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--paper)]'
</script>

<template>
  <div v-if="!locacao" class="mx-auto max-w-xl rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6" data-testid="nao-encontrado">
    <h1 class="m-0 mb-2 text-[length:var(--fs-title)] font-extrabold">Locação não encontrada</h1>
    <p class="m-0 mb-4 text-[var(--ink-soft)]">Essa locação não existe ou você não tem acesso a ela.</p>
    <NuxtLink to="/gestao/locacao" class="inline-flex min-h-11 items-center font-bold text-[var(--brand)] underline">← Voltar para a lista</NuxtLink>
  </div>

  <div v-else class="flex flex-col gap-4">
    <header class="flex flex-col gap-3">
      <NuxtLink to="/gestao/locacao" class="inline-flex min-h-11 w-fit items-center font-bold text-[var(--brand)] no-underline hover:underline">← Voltar para a lista</NuxtLink>
      <div class="min-w-0">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-[var(--line-2)] bg-[var(--paper)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-extrabold">{{ locacao.id }}</span>
          <GestaoStatusChip :status="locacao.status" />
        </div>
        <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-extrabold">{{ locacao.imovel }}</h1>
        <p class="m-0 text-[var(--ink-soft)]">{{ locacao.locador.nome }} · {{ locacao.locatario.nome }} · {{ nomeCorretor(locacao.corretorId) }}</p>
      </div>
      <p v-if="final" class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 font-semibold" role="status" data-testid="aviso-final">
        Locação encerrada: somente consulta. Nada mais pode ser alterado.
      </p>
    </header>

    <p class="m-0 text-[length:var(--fs-label)] font-bold" data-testid="progresso-texto">{{ feitas }} de {{ TOTAL_ETAPAS_LOCACAO }} etapas concluídas</p>
    <GestaoStepper :nomes="ETAPAS_LOCACAO" :vista="etapaVista" :atual="locacao.etapa" :concluidas="locacao.concluidas" @ir="etapaVista = $event" />

    <div class="[display:grid] gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div class="flex min-w-0 flex-col gap-3">
        <h2 class="m-0 text-[length:var(--fs-title-sm)] font-extrabold">Etapa {{ etapaVista }}: {{ ETAPAS_LOCACAO[etapaVista - 1] }}</h2>

        <GestaoLocacaoAbertura v-if="etapaVista === 1" :key="locacao.updated" :locacao="locacao" :pode-editar="podeEditar" :corretor-travado="sessao?.perfil === 'corretor'" @salvar="(d) => executar((s, a) => acao.salvarAberturaLocacao(s, id(), d, a), 'Abertura salva.')" />
        <GestaoLocacaoPessoa v-else-if="etapaVista === 2" :key="locacao.updated" titulo="Cadastro do locatário" :pessoa="locacao.locatario" :pode-editar="podeEditar" @salvar="salvarPessoa('locatario', $event)" />
        <GestaoLocacaoPessoa v-else-if="etapaVista === 3" :key="locacao.updated" titulo="Cadastro do locador" :pessoa="locacao.locador" :pode-editar="podeEditar" @salvar="salvarPessoa('locador', $event)" />
        <GestaoLocacaoGarantia v-else-if="etapaVista === 5" :key="locacao.updated" :locacao="locacao" :pode-editar="podeEditar" @salvar="(d) => executar((s, a) => acao.salvarGarantia(s, id(), d, a), 'Garantia salva.')" />
        <GestaoLocacaoVistoria v-else-if="etapaVista === 6" :key="locacao.updated" titulo="Vistoria de entrada" :vistoria="locacao.vistoriaEntrada" :pode-editar="podeEditar" :demo="demo" @salvar="salvarVistoria('entrada', $event)" />

        <template v-else-if="etapaVista === 7">
          <p v-if="!caps?.valores" class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-[var(--ink-soft)]" data-testid="etapa-sem-valores">
            Esta etapa é do jurídico e financeiro. Ela está {{ locacao.concluidas[6] ? 'concluída' : 'pendente' }}.
          </p>
          <template v-else>
            <GestaoLocacaoContrato :key="locacao.updated" :contrato="locacao.contrato" :pode-editar="podeValores" @salvar="salvarContrato" />
            <GestaoLocacaoCobrancas
              :cobrancas="locacao.cobrancas"
              :pode-editar="podeValores && !!locacao.contrato"
              :demo="demo"
              @gerar="(c) => executar((s, a) => acao.gerarCobranca(s, id(), c, a), 'Cobrança gerada.')"
              @pagar="(cb, comp) => executar((s, a) => acao.registrarPagamento(s, id(), cb, { data: new Date().toISOString().slice(0, 10), comprovante: comp }, a), 'Pagamento registrado.')"
              @repassar="(cb, comp) => executar((s, a) => acao.registrarRepasse(s, id(), cb, { data: new Date().toISOString().slice(0, 10), comprovante: comp }, a), 'Repasse registrado.')"
            />
          </template>
        </template>

        <template v-else-if="etapaVista === 8">
          <div class="flex flex-wrap gap-2" data-testid="acompanhamento">
            <button v-if="podeEditar || podeValores" type="button" :class="btn" :disabled="locacao.status !== 'Ativa'" data-testid="renovar" @click="renovar">Renovar por 12 meses</button>
            <button v-if="podeEditar || podeValores" type="button" :class="btn" :disabled="locacao.status !== 'Ativa'" data-testid="encerrar" @click="encerrar">Encerrar locação</button>
            <button v-if="final && caps?.arquivar" type="button" :class="btn" data-testid="arquivar" @click="arquivar">Arquivar locação</button>
          </div>
          <p v-if="locacao.contrato && caps?.valores" class="m-0 text-[var(--ink-soft)]" data-testid="fim-contrato">Contrato termina em {{ locacao.contrato.fim }}.</p>
          <GestaoLocacaoVistoria
            v-if="locacao.concluidas[6] || locacao.vistoriaSaida"
            :key="locacao.updated"
            titulo="Vistoria de saída"
            :vistoria="locacao.vistoriaSaida"
            :pode-editar="podeEditar"
            :demo="demo"
            @salvar="salvarVistoria('saida', $event)"
          />
          <p v-else class="m-0 text-[var(--ink-soft)]">A vistoria de saída fica disponível depois do contrato.</p>
        </template>

        <GestaoRequisitos
          v-if="requisitos.length"
          :requisitos="requisitos"
          :documentos="docs"
          :processo-id="locacao.id"
          :pode-enviar="podeEditar && !!caps?.enviarDocs"
          :pode-conferir="!final && !!caps?.conferir"
          :demo="demo"
          @enviar="enviarArquivo"
          @trocar="trocarArquivo"
          @conferir="(d) => executar((s) => conferirDocumento(s, d.id), 'Documento conferido.')"
        />

        <div v-if="pendencias.length && etapaVista === locacao.etapa && etapaVista < TOTAL_ETAPAS_LOCACAO && podeNaEtapa(etapaVista)" id="pendencias-etapa" class="rounded-[10px] bg-[#fef3c7] px-3 py-2 text-[#78350f]" role="note" data-testid="pendencias-etapa">
          <strong class="block">Para concluir a etapa {{ etapaVista }}:</strong>
          <ul class="m-0 list-disc pl-5"><li v-for="m in pendencias" :key="m">{{ m }}</li></ul>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" :class="btn" :disabled="etapaVista <= 1" @click="etapaVista--">← Etapa anterior</button>
          <button
            v-if="etapaVista === locacao.etapa && etapaVista < TOTAL_ETAPAS_LOCACAO && !final && podeNaEtapa(etapaVista)"
            type="button"
            class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pendencias.length > 0"
            :aria-describedby="pendencias.length ? 'pendencias-etapa' : undefined"
            data-testid="concluir-etapa"
            @click="concluirEtapa"
          >
            Concluir etapa {{ etapaVista }}
          </button>
          <button type="button" :class="btn" :disabled="etapaVista >= TOTAL_ETAPAS_LOCACAO" @click="etapaVista++">Próxima etapa →</button>
        </div>
      </div>

      <aside class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-labelledby="hist-titulo">
        <h2 id="hist-titulo" class="m-0 mb-2 text-[length:var(--fs-body)] font-extrabold">Histórico</h2>
        <ol class="m-0 flex list-none flex-col gap-2 p-0" data-testid="historico">
          <li v-for="(h, i) in locacao.hist" :key="i" class="border-b border-[var(--line)] pb-2 last:border-b-0">
            <span class="block font-semibold">{{ h.acao }}</span>
            <span class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">{{ h.quem }} · {{ h.quando }}</span>
          </li>
        </ol>
      </aside>
    </div>
  </div>
</template>
