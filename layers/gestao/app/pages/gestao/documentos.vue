<script setup lang="ts">
import {
  CATEGORIAS,
  filtroDocumentosDaUrl,
  listaVersoes,
  queryDosDocumentos,
  validarArquivo,
} from '../../../domain/documentos'
import type { CategoriaDocumento, Documento } from '../../../domain/types'

definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Documentos' })

const store = useGestaoStore()
const toast = useToast()
const { askConfirm } = useConfirm()

await store.carregar()

const caps = computed(() => store.caps())
const podeEnviar = computed(() => !!caps.value?.enviarDocs)
const podeConferir = computed(() => !!caps.value?.conferir)
const podeApagar = computed(() => !!caps.value?.apagarDocs)

// --- filtros: tudo na URL --------------------------------------------------------
// Aba, categoria, busca, página e `?processo=` vivem na rota (`useListaPaginada`): recarregar, voltar e colar
// o link mantêm a tela como estava. `processo` restringe a lista; `de` só decide para onde o «voltar» leva.
const { filtro, resultado, falhou, q: busca, carregar, irParaPagina, mudar } = useListaPaginada(
  (f) => store.paginaDeDocumentos(f),
  (query) => filtroDocumentosDaUrl(query, { podeApagar: podeApagar.value }),
  queryDosDocumentos,
)
const aba = computed(() => filtro.value.aba)
const categoria = computed(() => filtro.value.categoria)
const processoFiltro = computed(() => filtro.value.processo || null)
const veioDoProcesso = computed(() => filtro.value.de === 'processo')
const voltar = computed(() =>
  veioDoProcesso.value
    ? { rotulo: `← Voltar ao processo ${processoFiltro.value}`, to: `/gestao/vendas/${processoFiltro.value}` }
    : { rotulo: '← Voltar para a lista', to: '/gestao/vendas' },
)
// Sem `de` também: sem processo, o «voltar ao processo» não teria alvo.
const limparFiltroProcesso = () => mudar({ processo: '', de: '' })

const abas = computed(() => resultado.value?.abas ?? { documentos: 0, lixeira: 0, 'sem-pdf': 0 })
const lista = computed(() => resultado.value?.itens ?? [])
const semPdf = computed(() => resultado.value?.contratos ?? [])

// O card mostra «V-… · imóvel»: o imóvel vem do servidor (a lista do store não tem todos os processos).
const rotuloDoDocumento = (id: string) => (resultado.value?.imoveis[id] ? `${id} · ${resultado.value.imoveis[id]}` : id)

// --- ações ------------------------------------------------------------------
// `mock`: sem Storage, ver/baixar só avisam (link de arquivo falso levaria a um 404).
// `http`: URL assinada de 60 s, pedida na hora (o servidor audita antes de entregá-la).
const demoArquivo = () => toast.success('Demonstração: arquivo de exemplo')

async function abrirArquivo(d: Documento) {
  if (!store.http) return demoArquivo()
  const r = await store.baixarDocumento(d)
  if (!r.ok) return void toast.error(r.erro)
  if (r.url) window.open(r.url, '_blank', 'noopener')
}

/** Mensagem de sucesso ou do erro (409 já vem com «alterado por outra pessoa»). */
async function avisar(r: { ok: true } | { ok: false; erro: string }, sucesso: string) {
  if (r.ok) {
    toast.success(sucesso)
    // A página vem do servidor: depois de mexer num documento ela precisa ser pedida de novo.
    await carregar()
  } else toast.error(r.erro)
}

async function substituir(d: Documento, arquivo: File) {
  const invalido = validarArquivo(arquivo.name, arquivo.size)
  if (invalido) return toast.error(invalido)
  await avisar(await store.novaVersaoDocumento(d, { name: arquivo.name, size: arquivo.size, file: arquivo }), `Nova versão de «${d.nome}» enviada.`)
}

async function conferir(d: Documento) {
  await avisar(await store.conferirDocumento(d), `«${d.nome}» conferido.`)
}

async function apagar(d: Documento) {
  const ok = await askConfirm({
    title: `Apagar «${d.nome}»?`,
    description: 'O documento vai para a lixeira e pode ser restaurado depois.',
    confirmLabel: 'Apagar',
    danger: true,
  })
  if (!ok) return
  await avisar(await store.apagarDocumento(d), 'Documento enviado para a lixeira.')
}

async function restaurar(d: Documento) {
  await avisar(await store.restaurarDocumento(d), `«${d.nome}» restaurado.`)
}

// --- enviar documento -------------------------------------------------------
const modal = ref<{ abrir: (p?: string) => void; fechar: () => void } | null>(null)
const erroEnvio = ref('')

function abrirEnvio() {
  erroEnvio.value = ''
  modal.value?.abrir(processoFiltro.value ?? '')
}

async function enviar(dados: { arquivo: File | null; categoria: CategoriaDocumento; processoId: string }) {
  const { arquivo } = dados
  // Nenhum arquivo escolhido chega como nome vazio; o domínio (mock) e o servidor (http) validam o resto.
  const r = await store.enviarDocumento(
    'venda',
    dados.processoId,
    { name: arquivo?.name ?? '', size: arquivo?.size ?? 0, ...(arquivo && { file: arquivo }) },
    { categoria: dados.categoria },
  )
  if (!r.ok) {
    erroEnvio.value = r.erro
    return
  }
  erroEnvio.value = ''
  modal.value?.fechar()
  // O item novo entra no topo: limpa o que poderia escondê-lo.
  const antes = JSON.stringify(filtro.value)
  busca.value = ''
  await mudar({ aba: 'documentos', categoria: 'todas', q: '' })
  if (JSON.stringify(filtro.value) === antes) await carregar()
  toast.success('Documento enviado.')
}

// --- versões ----------------------------------------------------------------
const dialogoVersoes = ref<HTMLDialogElement | null>(null)
const docVersoes = ref<Documento | null>(null)

function verVersoes(d: Documento) {
  docVersoes.value = d
  dialogoVersoes.value?.showModal()
}

const chip = (ativo: boolean) => [
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]',
  ativo
    ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
    : 'border-[var(--line-2)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--brand-ghost)]',
]
const tab = (ativo: boolean) => [
  'min-h-11 cursor-pointer whitespace-nowrap border-b-2 px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)]',
  ativo
    ? 'border-[var(--brand)] text-[var(--brand)]'
    : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]',
]
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4">
    <NuxtLink
      :to="voltar.to"
      class="inline-flex min-h-11 w-fit items-center rounded-[10px] px-1 font-bold text-[var(--brand)] no-underline hover:underline"
      data-testid="voltar"
    >
      {{ voltar.rotulo }}
    </NuxtLink>

    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[length:var(--fs-title)] font-extrabold">Documentos</h1>
        <p class="text-[var(--ink-soft)]">Todo documento fica ligado a um imóvel e a um processo.</p>
      </div>
      <button
        v-if="podeEnviar"
        type="button"
        class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        data-testid="enviar-documento"
        @click="abrirEnvio"
      >
        Enviar documento
      </button>
    </header>

    <p
      v-if="processoFiltro"
      class="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
      data-testid="filtro-processo"
    >
      <span>
        Mostrando só o processo <strong>{{ processoFiltro }}</strong>
      </span>
      <button
        type="button"
        class="min-h-11 cursor-pointer rounded-[10px] px-2 font-bold text-[var(--brand)] underline"
        @click="limparFiltroProcesso"
      >
        Limpar filtro
      </button>
    </p>

    <div role="tablist" aria-label="Seções de documentos" class="flex overflow-x-auto border-b border-[var(--line)]">
      <button
        type="button"
        role="tab"
        :aria-selected="aba === 'documentos'"
        :class="tab(aba === 'documentos')"
        data-testid="aba-documentos"
        @click="mudar({ aba: 'documentos' })"
      >
        Documentos ({{ abas.documentos }})
      </button>
      <button
        v-if="podeApagar"
        type="button"
        role="tab"
        :aria-selected="aba === 'lixeira'"
        :class="tab(aba === 'lixeira')"
        data-testid="aba-lixeira"
        @click="mudar({ aba: 'lixeira' })"
      >
        Lixeira ({{ abas.lixeira }})
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="aba === 'sem-pdf'"
        :class="tab(aba === 'sem-pdf')"
        data-testid="aba-sem-pdf"
        @click="mudar({ aba: 'sem-pdf' })"
      >
        Contratos sem PDF ({{ abas['sem-pdf'] }})
      </button>
    </div>

    <div class="flex flex-col gap-3">
      <div>
        <label for="busca-documento" class="mb-1 block text-[length:var(--fs-label)] font-bold">
          {{ aba === 'sem-pdf' ? 'Buscar por processo ou imóvel' : 'Buscar por documento, processo ou imóvel' }}
        </label>
        <input
          id="busca-documento"
          v-model="busca"
          type="search"
          class="min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          data-testid="busca-documento"
        />
      </div>
      <div v-if="aba !== 'sem-pdf'" class="flex flex-wrap gap-2" role="group" aria-label="Categoria">
        <button
          v-for="c in CATEGORIAS"
          :key="c.chave"
          type="button"
          :class="chip(categoria === c.chave)"
          :aria-pressed="categoria === c.chave"
          data-testid="chip-categoria"
          :data-categoria="c.chave"
          @click="mudar({ categoria: c.chave })"
        >
          {{ c.rotulo }}
        </button>
      </div>
    </div>

    <p v-if="resultado?.truncado" role="status" class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] p-3 text-[var(--ink-soft)]" data-testid="aviso-truncado">
      Há mais de 5000 processos ou documentos: a lista e as contagens cobrem só os mais recentes.
    </p>

    <div v-if="falhou" role="alert" class="flex flex-col items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-5">
      <p class="font-bold">Não foi possível carregar os documentos.</p>
      <button type="button" class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="carregar">Tentar de novo</button>
    </div>

    <p v-else-if="!resultado" class="rounded-xl border border-dashed border-[var(--line-2)] p-6 text-center text-[var(--ink-soft)]" aria-busy="true">Carregando…</p>

    <!-- Contratos sem PDF: aviso por processo, não por documento -->
    <template v-else-if="aba === 'sem-pdf'">
      <ul v-if="semPdf.length" class="flex flex-col gap-2">
        <li
          v-for="p in semPdf"
          :key="p.id"
          class="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid="contrato-sem-pdf"
        >
          <div class="min-w-0">
            <p class="font-bold">{{ p.id }} · {{ p.imovel }}</p>
            <p class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">
              Aditivos, apólices e contratos assinados podem ficar sem PDF até alguém anexar o arquivo.
            </p>
            <div class="mt-1"><GestaoStatusChip :status="p.status" /></div>
          </div>
          <NuxtLink
            :to="`/gestao/vendas/${p.id}`"
            class="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold text-[var(--ink)] no-underline hover:bg-[var(--brand-ghost)]"
          >
            Abrir processo
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="rounded-xl border border-dashed border-[var(--line-2)] p-6 text-center text-[var(--ink-soft)]" data-testid="vazio">
        Nenhum contrato sem PDF.
      </p>
    </template>

    <template v-else>
      <ul v-if="lista.length" class="flex flex-col gap-2">
        <GestaoDocumentoItem
          v-for="d in lista"
          :key="d.id"
          :doc="d"
          :processo="rotuloDoDocumento(d.processoId)"
          :lixeira="aba === 'lixeira'"
          :pode-substituir="podeEnviar"
          :pode-conferir="podeConferir"
          :pode-apagar="podeApagar"
          @ver="abrirArquivo(d)"
          @baixar="abrirArquivo(d)"
          @substituir="substituir(d, $event)"
          @versoes="verVersoes(d)"
          @conferir="conferir(d)"
          @apagar="apagar(d)"
          @restaurar="restaurar(d)"
        />
      </ul>
      <p v-else class="rounded-xl border border-dashed border-[var(--line-2)] p-6 text-center text-[var(--ink-soft)]" data-testid="vazio">
        {{ aba === 'lixeira' ? 'A lixeira está vazia.' : 'Nenhum documento encontrado.' }}
      </p>
    </template>

    <GestaoPaginacao
      v-if="resultado"
      :pagina="resultado.pagina"
      :paginas="resultado.paginas"
      :total="resultado.total"
      :rotulo="aba === 'sem-pdf' ? 'contratos' : 'documentos'"
      @ir="irParaPagina"
    />

    <GestaoEnviarDocumentoModal ref="modal" :erro="erroEnvio" @enviar="enviar" />

    <dialog
      ref="dialogoVersoes"
      class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-[var(--ink)] backdrop:bg-black/50"
      aria-labelledby="versoes-titulo"
      data-testid="modal-versoes"
    >
      <div v-if="docVersoes" class="flex flex-col gap-3">
        <h2 id="versoes-titulo" class="text-[length:var(--fs-title-sm)] font-extrabold">
          Versões de {{ docVersoes.nome }}
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="v in listaVersoes(docVersoes)"
            :key="v.numero"
            class="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2"
          >
            <span class="font-semibold">Versão {{ v.numero }} de {{ v.total }}</span>
            <span v-if="v.atual" class="text-[length:var(--fs-caption)] font-bold text-[#064e3b]">Atual</span>
          </li>
        </ul>
        <p class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">
          Demonstração: as versões anteriores ficam guardadas, mas os arquivos de exemplo não são abertos.
        </p>
        <button
          type="button"
          class="min-h-11 cursor-pointer self-end rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]"
          @click="dialogoVersoes?.close()"
        >
          Fechar
        </button>
      </div>
    </dialog>
  </div>
</template>
