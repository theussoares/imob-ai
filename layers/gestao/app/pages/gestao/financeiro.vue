<script setup lang="ts">
import { brl } from '../../../domain/acoes-processo'
import { ROTULO_REPASSE, ROTULO_SITUACAO, type RespostaFinanceiro } from '../../../domain/financeiro'

// Rota estática: vence `[secao].vue`. A guarda do middleware já barra quem não tem `valores`.
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Financeiro · Gestão' })

const store = useGestaoStore()
const toast = useToast()
const demo = !!useRuntimeConfig().public.gestaoDemo && !useGestaoHttp()
await store.carregar()

const competencia = ref('')

// Totais do servidor (`http`) ou calculados aqui (`mock`): ver `store.lerFinanceiro`. A tela só guarda a resposta.
const resumo = ref<RespostaFinanceiro | null>(await store.lerFinanceiro('').catch(() => null))
const vendas = computed(() => resumo.value!.vendas)
const locacoes = computed(() => resumo.value!.locacoes)
const competencias = computed(() => resumo.value!.competencias)
const pendencias = computed(() => resumo.value!.pendencias)

let seq = 0
async function atualizar() {
  const minha = ++seq
  try {
    const r = await store.lerFinanceiro(competencia.value)
    if (minha !== seq) return
    resumo.value = r
  } catch {
    // Com totais antigos na tela, eles ficam; sem nenhum, o bloco de erro (`!resumo`) aparece.
  }
}
watch(competencia, atualizar)
const podeValores = computed(() => !!store.caps(null)?.valores)

// Mesma ação do contrato (etapa 7): a regra e o histórico da locação são os mesmos nos dois lugares.
async function registrar(loc: string, acao: 'registrarPagamento' | 'registrarRepasse', cobrancaId: string, comprovante: string, sucesso: string) {
  const r = await store.executar('locacao', loc, acao, { cobrancaId, data: new Date().toISOString().slice(0, 10), comprovante })
  if (r.ok) {
    toast.success(sucesso)
    await atualizar()
  } else toast.error(r.erro)
}
const pagar = (loc: string, cb: string, comp: string) => registrar(loc, 'registrarPagamento', cb, comp, 'Pagamento registrado.')
const repassar = (loc: string, cb: string, comp: string) => registrar(loc, 'registrarRepasse', cb, comp, 'Repasse registrado.')

const mes = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`
const dia = (iso: string) => iso.split('-').reverse().join('/')

const campo =
  'min-h-11 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-ui)] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
const aba = ref<'vendas' | 'locacoes'>('vendas')
const ABAS = [
  { chave: 'vendas', rotulo: 'Comissões de venda' },
  { chave: 'locacoes', rotulo: 'Aluguéis e repasses' },
] as const
const th = 'px-3 py-2 text-left text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]'
const td = 'px-3 py-2 align-top text-[length:var(--fs-ui)]'
</script>

<template>
  <section class="[display:grid] gap-6">
    <header>
      <h1 class="m-0 text-[length:var(--fs-title)] leading-tight font-bold">Financeiro</h1>
      <p class="mt-1 text-[var(--ink-soft)]">Comissões das vendas e aluguéis, taxas e repasses das locações.</p>
    </header>

    <div v-if="!resumo" role="alert" class="[display:grid] justify-items-start gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-5">
      <p class="m-0 font-bold">Não foi possível carregar os totais.</p>
      <button type="button" class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]" @click="atualizar">Tentar de novo</button>
    </div>

    <template v-else>
    <p v-if="resumo.truncado" role="status" class="m-0 rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] p-3 text-[var(--ink-soft)]" data-testid="aviso-truncado">
      Há mais de 5000 contratos de cada tipo: os totais cobrem só os mais recentes.
    </p>

    <GestaoFinanceiroPendencias :pendencias="pendencias" :pode-editar="podeValores" :demo="demo" @pagar="pagar" @repassar="repassar" />

    <div role="tablist" aria-label="Seções do financeiro" class="flex gap-1 border-b border-[var(--line)]">
      <button
        v-for="a in ABAS"
        :key="a.chave"
        type="button"
        role="tab"
        :aria-selected="aba === a.chave"
        class="-mb-px min-h-11 cursor-pointer border-b-[3px] px-4 font-semibold"
        :class="aba === a.chave ? 'border-[var(--gestao-amarelo)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'"
        :data-testid="`fin-aba-${a.chave}`"
        @click="aba = a.chave"
      >
        {{ a.rotulo }}
      </button>
    </div>

    <section v-show="aba === 'vendas'" class="[display:grid] gap-3" aria-labelledby="fin-vendas">
      <h2 id="fin-vendas" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Comissões de venda</h2>
      <div class="[display:grid] gap-3 sm:grid-cols-3">
        <GestaoIndicador rotulo="Comissão total" :valor="brl(vendas.comissaoTotal)" testid="fin-comissao-total" />
        <GestaoIndicador rotulo="Já adiantado" :valor="brl(vendas.adiantado)" testid="fin-comissao-adiantado" />
        <GestaoIndicador rotulo="A receber" :valor="brl(vendas.aReceber)" testid="fin-comissao-areceber" />
      </div>
      <div class="overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--paper)]">
        <table class="w-full border-collapse" data-testid="fin-tabela-vendas">
          <caption class="sr-only">Comissão por venda</caption>
          <thead>
            <tr>
              <th :class="th">Venda</th>
              <th :class="th">Imóvel</th>
              <th :class="th">Valor</th>
              <th :class="th">Comissão</th>
              <th :class="th">Adiantado</th>
              <th :class="th">A receber</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in vendas.linhas" :key="l.id" class="border-t border-[var(--line)]" data-testid="fin-linha-venda">
              <td :class="td">
                <NuxtLink :to="`/gestao/vendas/${l.id}`" class="font-bold text-[var(--brand)]">{{ l.id }}</NuxtLink>
                <div class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ l.status }}</div>
              </td>
              <td :class="td">{{ l.imovel }}</td>
              <td :class="td">{{ brl(l.valor) }}</td>
              <td :class="td">{{ brl(l.comissaoTotal) }}</td>
              <td :class="td">{{ brl(l.adiantado) }}</td>
              <td :class="td" class="font-bold">{{ brl(l.aReceber) }}</td>
            </tr>
            <tr v-if="!vendas.linhas.length">
              <td :class="td" colspan="6">Nenhuma venda com comissão.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-show="aba === 'locacoes'" class="[display:grid] gap-3" aria-labelledby="fin-locacoes">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h2 id="fin-locacoes" class="m-0 text-[length:var(--fs-title-sm)] font-bold">Aluguéis e repasses</h2>
        <label class="[display:grid] gap-1 text-[length:var(--fs-label)] font-semibold">
          Competência
          <select v-model="competencia" :class="campo" data-testid="fin-competencia">
            <option value="">Todas</option>
            <option v-for="c in competencias" :key="c" :value="c">{{ mes(c) }}</option>
          </select>
        </label>
      </div>
      <div class="[display:grid] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <GestaoIndicador rotulo="Aluguel recebido" :valor="brl(locacoes.recebido)" testid="fin-recebido" />
        <GestaoIndicador rotulo="Em aberto" :valor="brl(locacoes.emAberto)" testid="fin-aberto" />
        <GestaoIndicador rotulo="Em atraso" :valor="brl(locacoes.emAtraso)" :alerta="locacoes.emAtraso > 0" testid="fin-atraso" />
        <GestaoIndicador rotulo="Taxa da imobiliária recebida" :valor="brl(locacoes.taxaRecebida)" testid="fin-taxa" />
        <GestaoIndicador rotulo="Repasses feitos" :valor="brl(locacoes.repasseFeito)" testid="fin-repasse-feito" />
        <GestaoIndicador rotulo="Repasses pendentes" :valor="brl(locacoes.repassePendente)" :alerta="locacoes.repassePendente > 0" testid="fin-repasse-pendente" />
      </div>
      <div class="overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--paper)]">
        <table class="w-full border-collapse" data-testid="fin-tabela-alugueis">
          <caption class="sr-only">Cobranças e repasses por locação</caption>
          <thead>
            <tr>
              <th :class="th">Locação</th>
              <th :class="th">Competência</th>
              <th :class="th">Vencimento</th>
              <th :class="th">Aluguel</th>
              <th :class="th">Situação</th>
              <th :class="th">Taxa</th>
              <th :class="th">Repasse</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in locacoes.linhas" :key="l.locacaoId + l.competencia" class="border-t border-[var(--line)]" data-testid="fin-linha-aluguel" :data-situacao="l.situacao">
              <td :class="td">
                <NuxtLink :to="`/gestao/locacao/${l.locacaoId}`" class="font-bold text-[var(--brand)]">{{ l.locacaoId }}</NuxtLink>
                <div class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ l.imovel }}</div>
              </td>
              <td :class="td">{{ mes(l.competencia) }}</td>
              <td :class="td">{{ dia(l.vencimento) }}</td>
              <td :class="td">{{ brl(l.valor) }}</td>
              <td :class="td" class="font-bold">{{ ROTULO_SITUACAO[l.situacao] }}</td>
              <td :class="td">{{ brl(l.taxa) }}</td>
              <td :class="td">{{ brl(l.repasse) }}<div class="text-[length:var(--fs-caption)] text-[var(--ink-soft)]">{{ ROTULO_REPASSE[l.repasseSituacao] }}</div></td>
            </tr>
            <tr v-if="!locacoes.linhas.length">
              <td :class="td" colspan="7">Nenhuma cobrança neste período.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    </template>
  </section>
</template>
