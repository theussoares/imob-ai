<script setup lang="ts">
import { avisosLocacao, hojeISO } from '../../../../domain/avisos-locacao'
import { validarArquivo } from '../../../../domain/documentos'
import { pendenciasEtapaLocacao, requisitosDaEtapaLocacao } from '../../../../domain/locacao-requisitos'
import { ETAPAS_LOCACAO, locacaoFinal, TOTAL_ETAPAS_LOCACAO } from '../../../../domain/locacao-status'
import type { Requisito } from '../../../../domain/requisitos'
import type { ContratoLocacao, Documento, Pessoa, Vistoria } from '../../../../domain/types'
import type { ArquivoGestao as ArquivoEscolhido } from '../../../services/GestaoRepository'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })

const route = useRoute()
const store = useGestaoStore()
const toast = useToast()
const demo = !!useRuntimeConfig().public.gestaoDemo && !useGestaoHttp()
const { askConfirm } = useConfirm()
const { sessao } = useGestaoSessao()

await store.carregar()
await Promise.all([store.carregarDetalhe('locacao', String(route.params.id)), store.carregarDocumentos('locacao', String(route.params.id))])

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
const avisos = computed(() => (locacao.value ? avisosLocacao(locacao.value, hojeISO()) : []))
const pendencias = computed(() =>
  locacao.value && !final.value ? pendenciasEtapaLocacao(locacao.value, store.documentos.value, etapaVista.value) : [],
)
// Etapa 7 é de quem vê valores; as demais, de quem edita cadastros.
const podeNaEtapa = (e: number) => (e === 7 ? podeValores.value : podeEditar.value)
const requisitos = computed(() => requisitosDaEtapaLocacao(etapaVista.value))
const nomeCorretor = (id: string) => store.corretores.value.find((c) => c.id === id)?.nome ?? id

/**
 * Executa uma ação da locação pelo NOME (o servidor despacha pela mesma chave) e avisa o
 * resultado. 409 («alterada por outra pessoa») e 422 (frase do domínio) chegam como `erro`.
 */
async function executar(acao: string, dados: unknown, sucesso?: string): Promise<boolean> {
  const r = await store.executar('locacao', id(), acao, dados)
  if (!r.ok) {
    toast.error(r.erro)
    return false
  }
  if (sucesso) toast.success(sucesso)
  return true
}

const id = () => locacao.value!.id

/** O que a abertura da locação grava: só estes campos (o resto do agregado é do servidor). */
const abertura = (l: { locador: Pessoa; locatario: Pessoa; imovelId: string; imovel: string; corretorId: string }) => ({
  locador: l.locador,
  locatario: l.locatario,
  imovelId: l.imovelId,
  imovel: l.imovel,
  corretorId: l.corretorId,
})

async function concluirEtapa() {
  const feita = etapaVista.value
  if (await executar('concluirEtapaLocacao', { etapa: feita }, `Etapa ${feita} concluída.`)) {
    etapaVista.value = Math.min(feita + 1, TOTAL_ETAPAS_LOCACAO)
  }
}

function salvarPessoa(quem: 'locador' | 'locatario', pessoa: Pessoa) {
  const l = locacao.value!
  void executar('salvarAberturaLocacao', abertura({ ...l, [quem]: pessoa }), 'Cadastro salvo.')
}

function salvarVistoria(quando: 'entrada' | 'saida', v: Vistoria) {
  void executar('salvarVistoria', { quando, vistoria: v }, 'Vistoria salva.')
}

const salvarContrato = (c: ContratoLocacao) => executar('salvarContrato', c, 'Contrato salvo.')

const hoje = () => new Date().toISOString().slice(0, 10)

async function enviarArquivo(r: Requisito, arq: ArquivoEscolhido) {
  const erro = validarArquivo(arq.name, arq.size)
  if (erro) return void toast.error(erro)
  const res = await store.enviarDocumento('locacao', id(), arq, { categoria: r.categoria, requisito: r.chave })
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

async function confirmar(titulo: string, descricao: string, rotulo: string, acao: string, sucesso: string) {
  if (await askConfirm({ title: titulo, description: descricao, confirmLabel: rotulo, cancelLabel: 'Voltar' })) return executar(acao, {}, sucesso)
  return false
}

const renovar = () => confirmar('Renovar por 12 meses?', 'O fim do contrato avança 12 meses.', 'Renovar', 'renovarLocacao', 'Contrato renovado.')
const encerrar = () => confirmar('Encerrar a locação?', 'Ela passa a aceitar só consulta.', 'Encerrar locação', 'encerrarLocacao', 'Locação encerrada.')

async function arquivar() {
  const ok = await confirmar('Arquivar esta locação?', 'Ela sai da lista e vai para «Arquivados». Pode ser restaurada.', 'Arquivar', 'arquivarLocacao', 'Locação arquivada.')
  if (ok) await navigateTo('/gestao/locacao')
}

const btn =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--paper)]'
</script>

<template>
  <div v-if="!locacao" class="mx-auto max-w-xl rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6" data-testid="nao-encontrado">
    <h1 class="m-0 mb-2 text-[length:var(--fs-title)] font-bold">Locação não encontrada</h1>
    <p class="m-0 mb-4 text-[var(--ink-soft)]">Essa locação não existe ou você não tem acesso a ela.</p>
    <NuxtLink to="/gestao/locacao" class="inline-flex min-h-11 items-center font-bold text-[var(--brand)] underline">← Voltar para a lista</NuxtLink>
  </div>

  <div v-else class="flex flex-col gap-4">
    <header class="flex flex-col gap-3">
      <NuxtLink to="/gestao/locacao" class="inline-flex min-h-11 w-fit items-center font-bold text-[var(--brand)] no-underline hover:underline">← Voltar para a lista</NuxtLink>
      <div class="min-w-0">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-[var(--line-2)] bg-[var(--paper)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold">{{ locacao.id }}</span>
          <GestaoStatusChip :status="locacao.status" />
        </div>
        <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">{{ locacao.imovel }}</h1>
        <p class="m-0 text-[var(--ink-soft)]">{{ locacao.locador.nome }} · {{ locacao.locatario.nome }} · {{ nomeCorretor(locacao.corretorId) }}</p>
      </div>
      <p v-if="final" class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 py-2 font-semibold" role="status" data-testid="aviso-final">
        Locação encerrada: somente consulta. Nada mais pode ser alterado.
      </p>
    </header>

    <GestaoAvisosLocacao :avisos="avisos" />

    <p class="m-0 text-[length:var(--fs-label)] font-bold" data-testid="progresso-texto">{{ feitas }} de {{ TOTAL_ETAPAS_LOCACAO }} etapas concluídas</p>
    <NuxtLink
      :to="`/gestao/documentos?processo=${locacao.id}&de=processo`"
      class="inline-flex min-h-11 w-fit items-center px-2 font-bold text-[var(--brand)] underline"
      data-testid="link-documentos"
    >
      Documentos da locação →
    </NuxtLink>

    <GestaoStepper :nomes="ETAPAS_LOCACAO" :vista="etapaVista" :atual="locacao.etapa" :concluidas="locacao.concluidas" @ir="etapaVista = $event" />

    <div class="[display:grid] gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div class="flex min-w-0 flex-col gap-3">
        <h2 class="m-0 text-[length:var(--fs-title-sm)] font-bold">Etapa {{ etapaVista }}: {{ ETAPAS_LOCACAO[etapaVista - 1] }}</h2>

        <GestaoLocacaoAbertura v-if="etapaVista === 1" :key="locacao.updated" :locacao="locacao" :pode-editar="podeEditar" :corretor-travado="sessao?.perfil === 'corretor'" @salvar="(d) => executar('salvarAberturaLocacao', abertura(d), 'Abertura salva.')" />
        <GestaoLocacaoPessoa v-else-if="etapaVista === 2" :key="locacao.updated" titulo="Cadastro do locatário" :pessoa="locacao.locatario" :pode-editar="podeEditar" @salvar="salvarPessoa('locatario', $event)" />
        <GestaoLocacaoPessoa v-else-if="etapaVista === 3" :key="locacao.updated" titulo="Cadastro do locador" :pessoa="locacao.locador" :pode-editar="podeEditar" @salvar="salvarPessoa('locador', $event)" />
        <GestaoLocacaoGarantia v-else-if="etapaVista === 5" :key="locacao.updated" :locacao="locacao" :pode-editar="podeEditar" @salvar="(d) => executar('salvarGarantia', d, 'Garantia salva.')" />
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
              @gerar="(c) => executar('gerarCobranca', { competencia: c }, 'Cobrança gerada.')"
              @pagar="(cb, comp) => executar('registrarPagamento', { cobrancaId: cb, data: hoje(), comprovante: comp }, 'Pagamento registrado.')"
              @repassar="(cb, comp) => executar('registrarRepasse', { cobrancaId: cb, data: hoje(), comprovante: comp }, 'Repasse registrado.')"
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
          @conferir="conferirArquivo"
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
            class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--gestao-amarelo)] px-4 font-bold text-[var(--brand)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
        <h2 id="hist-titulo" class="m-0 mb-2 text-[length:var(--fs-body)] font-bold">Histórico</h2>
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
