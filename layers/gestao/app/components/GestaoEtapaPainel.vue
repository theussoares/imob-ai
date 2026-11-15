<script setup lang="ts">
import {
  brl,
  FORMAS_PAGAMENTO,
  itensChecklist,
  type DadosFinanceiros,
  type DadosImovel,
  type DadosPessoa,
  type ProcessoComVenal,
} from '../../domain/acoes-processo'
import { conferirFontes } from '../../domain/commission'
import { ETAPAS_VENDA } from '../../domain/status'
import type { CategoriaDocumento, ConferenciaFinal, Documento, FormaPagamento, Processo } from '../../domain/types'

const props = defineProps<{
  processo: Processo
  /** etapa exibida (1..8) */
  etapa: number
  /** documentos do processo, já sem os da lixeira */
  documentos: Documento[]
  /** pode editar esta etapa (perfil + processo não final) */
  podeEditar: boolean
  /** perfil tem a permissão específica da etapa 6/7 (conferir / jurídico) */
  podeChecklist: boolean
  /** pode concluir a venda na etapa 8 */
  podeConcluirVenda: boolean
}>()
const emit = defineEmits<{
  salvarFinanceiro: [dados: DadosFinanceiros]
  salvarPessoa: [quem: 'vendedor' | 'comprador', dados: DadosPessoa]
  salvarImovel: [dados: DadosImovel]
  salvarConferencia: [dados: ConferenciaFinal]
  concluirVenda: []
}>()

const { sessao } = useGestaoSessao()

const CATEGORIA_ETAPA: Record<number, CategoriaDocumento> = { 2: 'pessoas', 3: 'pessoas', 4: 'imoveis' }
const ROTULO_ESTADO = { pendente: 'pendente', enviado: 'enviado', conferido: 'conferido' } as const

const docsDaEtapa = computed(() =>
  props.documentos.filter((d) => d.categoria === CATEGORIA_ETAPA[props.etapa]),
)

// Checklists das etapas 6 e 7 são só marcação de tela: a demonstração não
// persiste «conferido item a item» (o dado real é o estado de cada documento).
const marcados = ref<Record<string, boolean>>({})

// Rascunho local do checklist comercial. Edita-se uma cópia e só «Salvar»
// grava no store; salvar a cada tecla encheria o histórico de eventos.
const forma = ref<FormaPagamento>(props.processo.fin.forma)
const valor = ref(props.processo.valor)
const financiado = ref(props.processo.fin.financiado)
const entrada = ref(props.processo.fin.entrada)
const fgts = ref(props.processo.fin.fgts)
const proprios = ref(props.processo.fin.proprios)
const avaliacao = ref(props.processo.fin.avaliacao ?? 0)
const ganhoCapital = ref(props.processo.fin.ganhoCapital ?? 0)
const bem = ref(props.processo.fin.bem ?? '')
const valorBem = ref(props.processo.fin.valorBem ?? 0)

// Cadastro da parte (etapas 2 e 3) e dados do imóvel (etapa 4): também rascunho local.
const quemPessoa = computed<'vendedor' | 'comprador'>(() => (props.etapa === 3 ? 'comprador' : 'vendedor'))
const cpf = ref('')
const telefone = ref('')
const email = ref('')
const matriculaMae = ref(false)
const valorVenal = ref(0)

// Conferência final: responsável nasce preenchido com quem está logado.
const hoje = () => new Date().toISOString().slice(0, 10)
const conf = reactive<ConferenciaFinal>({
  documentacao: false,
  valores: false,
  comissao: false,
  encaminhado: false,
  responsavel: '',
  data: hoje(),
})

function ressincronizar() {
  const p = props.processo
  forma.value = p.fin.forma
  valor.value = p.valor
  financiado.value = p.fin.financiado
  entrada.value = p.fin.entrada
  fgts.value = p.fin.fgts
  proprios.value = p.fin.proprios
  avaliacao.value = p.fin.avaliacao ?? 0
  ganhoCapital.value = p.fin.ganhoCapital ?? 0
  bem.value = p.fin.bem ?? ''
  valorBem.value = p.fin.valorBem ?? 0
  const parte = p[quemPessoa.value]
  cpf.value = parte.cpf
  telefone.value = parte.telefone ?? ''
  email.value = parte.email ?? ''
  matriculaMae.value = !!p.matriculaMae
  valorVenal.value = (p as ProcessoComVenal).valorVenal ?? 0
  Object.assign(conf, {
    documentacao: false,
    valores: false,
    comissao: false,
    encaminhado: false,
    data: hoje(),
    ...p.conferenciaFinal,
    responsavel: p.conferenciaFinal?.responsavel || sessao.value?.nome || '',
  })
}
ressincronizar()

watch(() => [props.processo, props.etapa], ressincronizar)

const n = (x: unknown) => Number(x) || 0
const dadosForm = computed<DadosFinanceiros>(() => ({
  valor: n(valor.value),
  fin: {
    forma: forma.value,
    financiado: forma.value === 'À vista' ? 0 : n(financiado.value),
    entrada: n(entrada.value),
    fgts: n(fgts.value),
    proprios: n(proprios.value),
    avaliacao: n(avaliacao.value),
    ganhoCapital: n(ganhoCapital.value),
    bem: bem.value.trim(),
    valorBem: n(valorBem.value),
  },
}))
const conferencia = computed(() => conferirFontes(dadosForm.value))
const itens = computed(() => itensChecklist(props.etapa, { matriculaMae: matriculaMae.value }))
// Documentação do proprietário = a do vendedor: já vem da etapa 2.
const proprietarioOk = computed(() => !!props.processo.concluidas[1])

const campo =
  'min-h-11 w-full rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3 text-[length:var(--fs-body)] text-[var(--ink)] disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]'
const rotuloCampo = 'flex flex-col gap-1 text-[length:var(--fs-label)] font-bold'
const btnSec =
  'min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-4 font-bold hover:bg-[var(--brand-ghost)]'
const linhaCheck = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2 hover:bg-[var(--surface)]'
</script>

<template>
  <section
    class="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"
    :aria-label="`Etapa ${etapa}: ${ETAPAS_VENDA[etapa - 1]}`"
    :data-testid="`painel-etapa-${etapa}`"
  >
    <h2 class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-extrabold">
      Etapa {{ etapa }} · {{ ETAPAS_VENDA[etapa - 1] }}
    </h2>

    <!-- 1 · Abertura -->
    <dl v-if="etapa === 1" class="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div v-for="[rot, val] in [
        ['Imóvel', processo.imovel],
        ['Vendedor', `${processo.vendedor.nome}${processo.vendedor.cpf ? ' · CPF ' + processo.vendedor.cpf : ''}`],
        ['Comprador', `${processo.comprador.nome}${processo.comprador.cpf ? ' · CPF ' + processo.comprador.cpf : ''}`],
        ['Última atualização', processo.updated],
        ['Observações', processo.obs || '—'],
      ]" :key="rot">
        <dt class="text-[length:var(--fs-label)] font-bold text-[var(--ink-soft)]">{{ rot }}</dt>
        <dd class="m-0">{{ val }}</dd>
      </div>
    </dl>

    <!-- 2 · 3 · 4 · Cadastro, checklist e documentos -->
    <div v-else-if="etapa >= 2 && etapa <= 4" class="flex flex-col gap-4">
      <!-- 2 e 3: cadastro da parte -->
      <form
        v-if="etapa !== 4"
        class="flex flex-col gap-3"
        novalidate
        @submit.prevent="emit('salvarPessoa', quemPessoa, { cpf, telefone, email })"
      >
        <h3 class="m-0 text-[length:var(--fs-body)] font-bold">
          Cadastro do {{ quemPessoa }}: {{ processo[quemPessoa].nome }}
        </h3>
        <div class="grid gap-3 sm:grid-cols-3">
          <label :class="rotuloCampo">
            CPF
            <input v-model="cpf" type="text" inputmode="numeric" autocomplete="off" :disabled="!podeEditar" :class="campo" data-testid="pessoa-cpf" />
          </label>
          <label :class="rotuloCampo">
            Telefone
            <input v-model="telefone" type="tel" autocomplete="off" :disabled="!podeEditar" :class="campo" data-testid="pessoa-telefone" />
          </label>
          <label :class="rotuloCampo">
            E-mail
            <input v-model="email" type="email" autocomplete="off" :disabled="!podeEditar" :class="campo" data-testid="pessoa-email" />
          </label>
        </div>
        <div v-if="podeEditar">
          <button
            type="submit"
            class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
            data-testid="pessoa-salvar"
          >
            Salvar cadastro
          </button>
        </div>
      </form>

      <!-- 4: matrícula e valor venal -->
      <form
        v-else
        class="flex flex-col gap-3"
        novalidate
        @submit.prevent="emit('salvarImovel', { matriculaMae, valorVenal: n(valorVenal) })"
      >
        <label :class="linhaCheck">
          <input v-model="matriculaMae" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeEditar" data-testid="matricula-mae" />
          <span>A matrícula é a matrícula-mãe (exige também o projeto/prancha do imóvel)</span>
        </label>
        <label :class="[rotuloCampo, 'sm:max-w-xs']">
          Valor venal (R$)
          <input v-model.number="valorVenal" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="valor-venal" />
        </label>
        <div v-if="podeEditar">
          <button
            type="submit"
            class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
            data-testid="imovel-salvar"
          >
            Salvar dados do imóvel
          </button>
        </div>
      </form>

      <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
        <legend class="mb-1 p-0 text-[length:var(--fs-body)] font-bold">Checklist</legend>
        <label v-for="item in itens" :key="item" :class="linhaCheck">
          <input v-model="marcados[`${etapa}:${item}`]" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeEditar" />
          <span>{{ item }}</span>
        </label>
        <!-- O proprietário costuma ser o vendedor: não se pede o mesmo papel duas vezes. -->
        <p
          v-if="etapa === 4"
          class="m-0 flex min-h-11 items-center gap-3 rounded-[10px] bg-[var(--surface)] px-2"
          data-testid="doc-proprietario"
        >
          <span aria-hidden="true">{{ proprietarioOk ? '✓' : '○' }}</span>
          <span>
            Documentação do proprietário = a do vendedor ·
            <strong>{{ proprietarioOk ? 'atendida pela etapa 2' : 'pendente: depende da etapa 2' }}</strong>
          </span>
        </p>
      </fieldset>

      <div>
        <h3 class="m-0 mb-1 text-[length:var(--fs-body)] font-bold">Documentos enviados</h3>
        <p v-if="!docsDaEtapa.length" class="m-0 text-[var(--ink-soft)]">Nenhum documento enviado nesta etapa.</p>
        <ul v-else class="m-0 flex list-none flex-col gap-1 p-0">
          <li
            v-for="d in docsDaEtapa"
            :key="d.id"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 last:border-b-0"
          >
            <span>{{ d.nome }}</span>
            <span class="rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold">
              {{ ROTULO_ESTADO[d.estado] }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 5 · Checklist comercial -->
    <form v-else-if="etapa === 5" class="flex flex-col gap-4" novalidate @submit.prevent="emit('salvarFinanceiro', dadosForm)">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label :class="rotuloCampo">
          Valor da venda (R$)
          <input v-model.number="valor" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-valor" />
        </label>
        <label :class="rotuloCampo">
          Valor de avaliação (R$)
          <input v-model.number="avaliacao" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-avaliacao" />
        </label>
        <label :class="rotuloCampo">
          Forma de pagamento
          <select v-model="forma" :disabled="!podeEditar" :class="campo" data-testid="fin-forma">
            <option v-for="f in FORMAS_PAGAMENTO" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label v-if="forma !== 'À vista'" :class="rotuloCampo">
          Valor financiado (R$)
          <input v-model.number="financiado" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-financiado" />
        </label>
        <label :class="rotuloCampo">
          Entrada (R$)
          <input v-model.number="entrada" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-entrada" />
        </label>
        <label :class="rotuloCampo">
          FGTS na entrada (R$)
          <input v-model.number="fgts" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-fgts" />
        </label>
        <label :class="rotuloCampo">
          Recurso próprio (R$)
          <input v-model.number="proprios" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-proprios" />
        </label>
        <label :class="rotuloCampo">
          Ganho de capital, se houver (R$)
          <input v-model.number="ganhoCapital" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-ganho-capital" />
        </label>
        <label :class="rotuloCampo">
          Bem na entrada (casa, carro…)
          <input v-model="bem" type="text" autocomplete="off" :disabled="!podeEditar" :class="campo" data-testid="fin-bem" />
        </label>
        <label :class="rotuloCampo">
          Valor do bem (R$)
          <input v-model.number="valorBem" type="number" min="0" step="0.01" :disabled="!podeEditar" :class="campo" data-testid="fin-valor-bem" />
        </label>
      </div>
      <!-- Texto + ícone: «Fecha» e «Faltam» não podem depender só de cor. -->
      <p
        class="m-0 rounded-[10px] px-3 py-2 font-bold"
        :class="conferencia.fecha ? 'bg-[#d1fae5] text-[#064e3b]' : 'bg-[#fef3c7] text-[#78350f]'"
        role="status"
        data-testid="fin-conferencia"
      >
        <template v-if="conferencia.fecha">✓ Fecha: as fontes somam o valor da venda.</template>
        <template v-else-if="conferencia.diferenca > 0">⚠ Faltam {{ brl(conferencia.diferenca) }} para fechar o valor.</template>
        <template v-else>⚠ As fontes passam {{ brl(-conferencia.diferenca) }} do valor da venda.</template>
      </p>
      <div>
        <button
          v-if="podeEditar"
          type="submit"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90"
          data-testid="fin-salvar"
        >
          Salvar checklist comercial
        </button>
      </div>
    </form>

    <!-- 6 · 7 · Conferência da recepção e análise jurídica -->
    <div v-else-if="etapa === 6 || etapa === 7" class="flex flex-col gap-2">
      <p v-if="!podeChecklist" class="m-0 rounded-[10px] bg-[var(--surface)] px-3 py-2 text-[var(--ink-soft)]">
        {{ etapa === 6 ? 'Só a recepção e o dono conferem esta etapa.' : 'Só o jurídico e o dono analisam esta etapa.' }}
      </p>
      <label v-for="item in itens" :key="item" :class="linhaCheck">
        <input
          v-model="marcados[`${etapa}:${item}`]"
          type="checkbox"
          class="size-5 accent-[var(--brand)]"
          :disabled="!podeChecklist || !podeEditar"
        />
        <span>{{ item }}</span>
      </label>
    </div>

    <!-- 8 · Conferência final + conclusão -->
    <div v-else class="flex flex-col gap-4">
      <form
        class="flex flex-col gap-3"
        novalidate
        @submit.prevent="emit('salvarConferencia', { ...conf })"
      >
        <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
          <legend class="mb-1 p-0 text-[length:var(--fs-body)] font-bold">Conferência final</legend>
          <label :class="linhaCheck">
            <input v-model="conf.documentacao" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeConcluirVenda" data-testid="conf-documentacao" />
            <span>Documentação conferida</span>
          </label>
          <label :class="linhaCheck">
            <input v-model="conf.valores" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeConcluirVenda" data-testid="conf-valores" />
            <span>Valores conferidos</span>
          </label>
          <label :class="linhaCheck">
            <input v-model="conf.comissao" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeConcluirVenda" data-testid="conf-comissao" />
            <span>Comissão conferida</span>
          </label>
          <label :class="linhaCheck">
            <input v-model="conf.encaminhado" type="checkbox" class="size-5 accent-[var(--brand)]" :disabled="!podeConcluirVenda" data-testid="conf-encaminhado" />
            <span>Processo encaminhado para finalização</span>
          </label>
        </fieldset>
        <div class="grid gap-3 sm:grid-cols-2">
          <label :class="rotuloCampo">
            Responsável pela conferência
            <input v-model="conf.responsavel" type="text" :disabled="!podeConcluirVenda" :class="campo" data-testid="conf-responsavel" />
          </label>
          <label :class="rotuloCampo">
            Data
            <input v-model="conf.data" type="date" :disabled="!podeConcluirVenda" :class="campo" data-testid="conf-data" />
          </label>
        </div>
        <div v-if="podeConcluirVenda">
          <button type="submit" :class="btnSec" data-testid="conf-salvar">Salvar conferência final</button>
        </div>
      </form>

      <p class="m-0 text-[var(--ink-soft)]">
        Concluir a venda encerra o processo: ele passa a aceitar só consulta.
      </p>
      <div>
        <button
          type="button"
          class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--brand)] bg-[var(--brand)] px-4 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!podeConcluirVenda"
          data-testid="concluir-venda"
          @click="emit('concluirVenda')"
        >
          Concluir venda
        </button>
      </div>
    </div>
  </section>
</template>
