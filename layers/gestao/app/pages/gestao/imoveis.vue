<script setup lang="ts">
import {
  FILTRO_IMOVEIS_VAZIO,
  FINALIDADES_IMOVEL,
  ROTULO_SITUACAO_IMOVEL,
  TIPOS_IMOVEL,
  filtrarImoveis,
  situacaoImovel,
  type FiltroImoveis,
  type NovoImovel,
} from '../../../domain/imoveis'
import { CORRETORES } from '../../../domain/seed'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `imoveis`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Imóveis · Gestão' })

const store = useGestaoStore()
const toast = useToast()
const { sessao } = useGestaoSessao()
await store.carregar()

const filtro = reactive<FiltroImoveis>({ ...FILTRO_IMOVEIS_VAZIO })
const lista = computed(() => filtrarImoveis(store.imoveis.value, store.locacoes.value, filtro))

const vazio = (): NovoImovel => ({ titulo: '', endereco: '', tipo: '', finalidade: '', proprietario: '', captadorId: sessao.value?.corretorId ?? '' })
const form = reactive<NovoImovel>(vazio())
const aberto = ref(false)
const erro = ref('')

function cadastrar() {
  const r = store.cadastrarImovel({ ...form })
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  erro.value = ''
  Object.assign(form, vazio())
  aberto.value = false
  toast.success(`Imóvel ${r.imovel.id} cadastrado.`)
}

const nomeCorretor = (id: string) => CORRETORES.find((c) => c.id === id)?.nome ?? '—'
const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const rotulo = '[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold'
const card = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5'
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-extrabold">Imóveis</h1>
        <p class="mt-1 text-[var(--ink-soft)]">Imóveis cadastrados na imobiliária. A situação vem das locações em andamento.</p>
      </div>
      <button type="button" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-5 font-bold text-white hover:opacity-90" data-testid="imovel-novo" @click="aberto = !aberto">
        {{ aberto ? 'Fechar cadastro' : 'Cadastrar imóvel' }}
      </button>
    </header>

    <form v-if="aberto" :class="card" class="[display:grid] gap-3 md:grid-cols-2" novalidate data-testid="imovel-form" @submit.prevent="cadastrar">
      <label :class="rotulo">Título
        <input v-model="form.titulo" :class="campo" autocomplete="off" placeholder="Apartamento 3 quartos" data-testid="imovel-titulo" />
      </label>
      <label :class="rotulo">Endereço
        <input v-model="form.endereco" :class="campo" autocomplete="off" placeholder="Rua, número, bairro" data-testid="imovel-endereco" />
      </label>
      <label :class="rotulo">Tipo
        <select v-model="form.tipo" :class="campo" data-testid="imovel-tipo">
          <option value="" disabled>Escolha…</option>
          <option v-for="t in TIPOS_IMOVEL" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label :class="rotulo">Finalidade
        <select v-model="form.finalidade" :class="campo" data-testid="imovel-finalidade">
          <option value="" disabled>Escolha…</option>
          <option v-for="f in FINALIDADES_IMOVEL" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label :class="rotulo">Proprietário
        <input v-model="form.proprietario" :class="campo" autocomplete="off" data-testid="imovel-proprietario" />
      </label>
      <label :class="rotulo">Corretor captador
        <select v-model="form.captadorId" :class="campo" data-testid="imovel-captador">
          <option value="" disabled>Escolha…</option>
          <option v-for="c in CORRETORES" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
      <p v-if="erro" role="alert" class="m-0 font-semibold text-[var(--danger)] md:col-span-2" data-testid="imovel-erro">{{ erro }}</p>
      <div class="md:col-span-2">
        <button type="submit" class="min-h-11 cursor-pointer rounded-[10px] bg-[var(--brand)] px-5 font-bold text-white hover:opacity-90" data-testid="imovel-salvar">Salvar imóvel</button>
      </div>
    </form>

    <div :class="card" class="[display:grid] gap-3 md:grid-cols-[1fr_12rem_12rem]">
      <label :class="rotulo">Buscar
        <input v-model="filtro.busca" :class="campo" type="search" autocomplete="off" placeholder="Título, endereço ou proprietário" data-testid="imovel-busca" />
      </label>
      <label :class="rotulo">Situação
        <select v-model="filtro.situacao" :class="campo" data-testid="imovel-filtro-situacao">
          <option value="">Todas</option>
          <option v-for="(r, k) in ROTULO_SITUACAO_IMOVEL" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
      <label :class="rotulo">Finalidade
        <select v-model="filtro.finalidade" :class="campo" data-testid="imovel-filtro-finalidade">
          <option value="">Todas</option>
          <option v-for="f in FINALIDADES_IMOVEL" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
    </div>

    <p v-if="!lista.length" class="m-0 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink-soft)]" data-testid="imovel-vazio">
      Nenhum imóvel encontrado com esse filtro.
    </p>
    <ul v-else class="m-0 list-none [display:grid] gap-3 p-0 md:grid-cols-2" data-testid="imovel-lista">
      <li v-for="i in lista" :key="i.id" :class="card" data-testid="imovel-card">
        <div class="flex items-start justify-between gap-2">
          <div>
            <strong class="block text-[length:var(--fs-body)]">{{ i.titulo }}</strong>
            <span class="text-[var(--ink-soft)]">{{ i.endereco || 'Sem endereço' }}</span>
          </div>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-[length:var(--fs-caption)] font-bold"
            :class="situacaoImovel(i.id, store.locacoes.value) === 'em-locacao' ? 'bg-[#dbeafe] text-[#1e3a8a]' : 'bg-[#d1fae5] text-[#064e3b]'"
            data-testid="imovel-situacao"
          >{{ ROTULO_SITUACAO_IMOVEL[situacaoImovel(i.id, store.locacoes.value)] }}</span>
        </div>
        <p class="m-0 mt-2 text-[length:var(--fs-label)] text-[var(--ink-soft)]">
          {{ i.tipo }} · {{ i.finalidade }} · Proprietário: {{ i.proprietario }} · Captador: {{ nomeCorretor(i.captadorId) }}
        </p>
      </li>
    </ul>
  </div>
</template>
