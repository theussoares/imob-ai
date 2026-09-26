<script setup lang="ts">
import type {
  Charge,
  ChargeItemKind,
  ChargeStatus,
  OwnerPayout,
  PaymentAccountView,
  SettlementMethod,
} from '~~/shared/models/cobranca'
import {
  CHARGE_ITEM_KINDS_MANUAIS,
  CHARGE_ITEM_LABELS,
  CHARGE_STATUS_LABELS,
  MANUAL_SETTLEMENT_METHODS,
  SETTLEMENT_METHOD_LABELS,
  aMaiorSeMarcarFeito,
  competenciaForaDaVigencia,
  hojeEmSaoPaulo,
  proximaCompetenciaLivre,
  repassesAMaior,
  somar,
  vencimentoPadrao,
} from '~~/shared/models/cobranca'

/**
 * Cobranças e repasses de um contrato (spec 25/09, B3).
 *
 * O ciclo que a tela conta, na ordem em que acontece: gerar o rascunho do
 * mês → conferir o total → emitir (boleto + Pix) → o pagamento baixa sozinho
 * pelo webhook, ou à mão → nasce o repasse pendente ao proprietário.
 *
 * Estado é derivado no servidor e só exibido aqui: a tela nunca decide se
 * uma cobrança está paga.
 */
const props = defineProps<{
  contractId: string
  rentAmount: number | null
  dueDay: number | null
  startedOn: string | null
  endsOn: string | null
  ativo: boolean
}>()

const toast = useToast()
const { askConfirm } = useConfirm()

const cobrancas = ref<Charge[]>([])
const repasses = ref<OwnerPayout[]>([])
const conta = ref<PaymentAccountView | null>(null)
const carregando = ref(true)
const erroCarga = ref('')

async function carregar() {
  erroCarga.value = ''
  try {
    const r = await adminFetch<{ cobrancas: Charge[]; repasses: OwnerPayout[]; conta: PaymentAccountView | null }>(
      `/api/admin/contracts/${props.contractId}/cobrancas`,
    )
    cobrancas.value = r.cobrancas
    repasses.value = r.repasses
    conta.value = r.conta
  } catch {
    erroCarga.value = 'Não foi possível carregar as cobranças.'
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

const msg = (e: unknown, padrao: string) => (e as { data?: { statusMessage?: string } })?.data?.statusMessage || padrao
const brl = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dataBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesExtenso = (competencia: string) => {
  const [a, m] = competencia.split('-')
  return `${MESES[Number(m) - 1]} de ${a}`
}
const sandbox = computed(() => conta.value?.environment === 'sandbox')

// ---------------------------------------------------------------------------
// Gerar
// ---------------------------------------------------------------------------
const gerando = ref(false)
const salvandoNova = ref(false)
const nova = reactive<{ competence: string; dueOn: string; rentAmount: number | null; extras: { kind: ChargeItemKind; description: string; amount: number | null }[] }>({
  competence: '',
  dueOn: '',
  rentAmount: null,
  extras: [],
})

/**
 * Próximo mês ainda sem cobrança mensal ativa, a partir do mês corrente ou do
 * início do contrato — o que vier depois. Sem o início na conta, contrato que
 * começa em outubro sugeria "setembro" e cobrava um mês em que o inquilino
 * ainda não morava lá.
 */
function proximaCompetencia(): string {
  const ocupadas = new Set(cobrancas.value.filter((c) => c.kind === 'mensal' && c.status !== 'cancelada').map((c) => c.competence.slice(0, 7)))
  return proximaCompetenciaLivre(ocupadas, vigencia.value) ?? hojeEmSaoPaulo().slice(0, 7)
}
const vigencia = computed(() => ({ startedOn: props.startedOn, endsOn: props.endsOn }))
const competenciaFora = computed(() => (nova.competence ? competenciaForaDaVigencia(nova.competence, vigencia.value) : null))

function abrirGerar() {
  nova.competence = proximaCompetencia()
  nova.dueOn = vencimentoPadrao(`${nova.competence}-01`, props.dueDay ?? 10)
  nova.rentAmount = props.rentAmount
  nova.extras = []
  gerando.value = true
}
// Mudou o mês → o vencimento acompanha, salvo se a pessoa já tinha mexido.
watch(
  () => nova.competence,
  (c, antes) => {
    if (!c || !antes) return
    if (nova.dueOn === vencimentoPadrao(`${antes}-01`, props.dueDay ?? 10)) nova.dueOn = vencimentoPadrao(`${c}-01`, props.dueDay ?? 10)
  },
)
function addExtra() {
  nova.extras.push({ kind: 'condominio', description: '', amount: null })
}
/** Desconto é digitado positivo e gravado negativo — ninguém digita "-200". */
const valorComSinal = (x: { kind: ChargeItemKind; amount: number | null }) => (x.kind === 'desconto' ? -Math.abs(x.amount ?? 0) : x.amount ?? 0)
const totalNova = computed(() => somar([nova.rentAmount ?? 0, ...nova.extras.map(valorComSinal)]))

async function salvarNova(emitirJunto: boolean) {
  if (!nova.rentAmount || nova.rentAmount <= 0) return toast.error('Informe o aluguel do mês.')
  if (nova.extras.some((x) => !x.amount || x.amount <= 0)) return toast.error('Preencha o valor de cada item (ou remova a linha).')
  if (nova.dueOn < hojeEmSaoPaulo()) return toast.error('O vencimento não pode estar no passado.')
  if (competenciaFora.value) return toast.error(competenciaFora.value === 'antes' ? 'Este mês é anterior ao início do contrato.' : 'Este mês é posterior ao fim do contrato.')
  salvandoNova.value = true
  try {
    const c = await adminFetch<Charge>(`/api/admin/contracts/${props.contractId}/cobrancas`, {
      method: 'POST',
      body: {
        competence: nova.competence,
        dueOn: nova.dueOn,
        rentAmount: nova.rentAmount,
        extras: nova.extras.map((x) => ({ kind: x.kind, description: x.description.trim() || null, amount: valorComSinal(x) })),
      },
    })
    gerando.value = false
    if (emitirJunto) await emitir(c)
    else {
      toast.success('Rascunho criado. Confira e emita quando quiser.')
      await carregar()
    }
  } catch (e) {
    toast.error(msg(e, 'Não foi possível gerar a cobrança.'))
  } finally {
    salvandoNova.value = false
  }
}

// ---------------------------------------------------------------------------
// Ações por cobrança
// ---------------------------------------------------------------------------
const ocupado = ref<string | null>(null)

async function emitir(c: Charge) {
  ocupado.value = c.id
  try {
    await adminFetch(`/api/admin/cobrancas/${c.id}/emitir`, { method: 'POST' })
    toast.success('Boleto emitido. O inquilino já vê na Área do Cliente.')
    aberta.value = c.id
  } catch (e) {
    toast.error(msg(e, 'Não foi possível emitir.'))
  } finally {
    ocupado.value = null
    await carregar()
  }
}

async function cancelar(c: Charge) {
  const ok = await askConfirm({
    title: `Cancelar a cobrança de ${mesExtenso(c.competence)}?`,
    description: c.externalId
      ? 'O boleto é cancelado no Asaas e deixa de poder ser pago. Não dá para desfazer; se precisar, gere outra cobrança.'
      : 'A cobrança sai do contrato. Não dá para desfazer.',
    confirmLabel: 'Cancelar cobrança',
    danger: true,
  })
  if (!ok) return
  ocupado.value = c.id
  try {
    await adminFetch(`/api/admin/cobrancas/${c.id}/cancelar`, { method: 'POST', body: {} })
    toast.success('Cobrança cancelada.')
  } catch (e) {
    toast.error(msg(e, 'Não foi possível cancelar.'))
  } finally {
    ocupado.value = null
    await carregar()
  }
}

async function apagar(c: Charge) {
  ocupado.value = c.id
  try {
    await adminFetch(`/api/admin/cobrancas/${c.id}`, { method: 'DELETE' })
    toast.success('Rascunho apagado.')
  } catch (e) {
    toast.error(msg(e, 'Não foi possível apagar.'))
  } finally {
    ocupado.value = null
    await carregar()
  }
}

async function simular(c: Charge) {
  ocupado.value = c.id
  try {
    const r = await adminFetch<{ aguardandoWebhook: boolean }>(`/api/admin/cobrancas/${c.id}/simular-pagamento`, { method: 'POST' })
    if (r.aguardandoWebhook) {
      toast.success('Pagamento confirmado no sandbox do Asaas. A baixa chega pelo webhook em instantes.')
      // O webhook costuma chegar em segundos; duas releituras cobrem o caso
      // comum sem deixar a tela consultando para sempre.
      setTimeout(carregar, 3000)
      setTimeout(carregar, 8000)
    } else {
      toast.success('Pagamento simulado. Veja o repasse gerado abaixo.')
    }
  } catch (e) {
    toast.error(msg(e, 'Não foi possível simular o pagamento.'))
  } finally {
    ocupado.value = null
    await carregar()
  }
}

const baixando = ref<string | null>(null)
const baixa = reactive<{ amount: number | null; settledOn: string; method: SettlementMethod }>({ amount: null, settledOn: '', method: 'pix' })
function abrirBaixa(c: Charge) {
  baixando.value = c.id
  baixa.amount = Math.max(0, somar([c.total, -c.settledTotal]))
  baixa.settledOn = hojeEmSaoPaulo()
  baixa.method = 'pix'
}
async function registrarBaixa(c: Charge) {
  if (!baixa.amount || baixa.amount <= 0) return toast.error('Informe o valor recebido.')
  ocupado.value = c.id
  try {
    await adminFetch(`/api/admin/cobrancas/${c.id}/baixa`, { method: 'POST', body: { ...baixa } })
    toast.success('Pagamento registrado.')
    baixando.value = null
  } catch (e) {
    toast.error(msg(e, 'Não foi possível registrar o pagamento.'))
  } finally {
    ocupado.value = null
    await carregar()
  }
}

async function copiar(texto: string, oque: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast.success(`${oque} copiado.`)
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie à mão.')
  }
}

async function repassePago(p: OwnerPayout) {
  const aMaior = aMaiorSeMarcarFeito(cobrancas.value, repasses.value, p.id)
  const ok = await askConfirm(
    aMaior > 0
      ? {
          title: `O proprietário já recebeu por ${mesExtenso(p.competence)}`,
          description: `Um repasse desta competência foi feito antes de o pagamento ser estornado. Se transferir ${brl(p.net)} agora, ${brl(aMaior)} terão saído a mais. Só marque como feito se descontou esse valor.`,
          confirmLabel: 'Marcar mesmo assim',
          cancelLabel: 'Não transferir',
          danger: true,
        }
      : {
          title: `Marcar o repasse de ${mesExtenso(p.competence)} como feito?`,
          description: `Confirme que ${brl(p.net)} já foi transferido ao proprietário.`,
          confirmLabel: 'Marcar como feito',
        },
  )
  if (!ok) return
  try {
    await adminFetch(`/api/admin/repasses/${p.id}/pago`, { method: 'POST' })
    toast.success('Repasse marcado como feito.')
  } catch (e) {
    toast.error(msg(e, 'Não foi possível marcar o repasse.'))
  } finally {
    await carregar()
  }
}

const aberta = ref<string | null>(null)
const emAberto = (s: ChargeStatus) => s === 'emitida' || s === 'vencida' || s === 'parcial'
const pagamentoResumo = (c: Charge) => {
  const u = c.settlements.filter((s) => s.amount > 0).at(-1)
  return u ? `Pago em ${dataBR(u.settledOn)} por ${u.method === 'pix' ? 'Pix' : SETTLEMENT_METHOD_LABELS[u.method].toLowerCase()}` : ''
}
const aReceber = computed(() => somar(cobrancas.value.filter((c) => emAberto(c.status)).map((c) => c.total - c.settledTotal)))
const repassesPendentes = computed(() => repasses.value.filter((p) => p.status === 'pendente'))
const aRecuperar = computed(() => repassesAMaior(cobrancas.value, repasses.value))
const estornadoDepois = (p: OwnerPayout) => p.status === 'pago' && aRecuperar.value.some((a) => a.chargeId === p.sourceChargeId)
</script>

<template>
  <section class="admin-card secao cob" aria-labelledby="cob-t">
    <div class="cob-topo">
      <div>
        <h2 id="cob-t" class="admin-h2">Cobranças</h2>
        <p v-if="aReceber > 0" class="cob-sub">{{ brl(aReceber) }} em aberto</p>
      </div>
      <button v-if="ativo && !gerando" type="button" class="admin-btn sm" @click="abrirGerar"><AppIcon name="plus" /> Gerar cobrança</button>
    </div>

    <p v-if="!carregando && !conta" class="cob-aviso">
      Para emitir boleto e Pix, conecte a conta de cobrança em
      <NuxtLink to="/admin/config">Configurações</NuxtLink>. Enquanto isso, dá para gerar a cobrança e registrar
      pagamentos recebidos por fora.
    </p>
    <p v-else-if="conta && sandbox" class="cob-aviso teste">
      Conta de <b>{{ conta.provider === 'simulado' ? 'demonstração' : 'testes (sandbox)' }}</b>: os boletos não valem
      dinheiro.
    </p>

    <!-- Gerar -->
    <form v-if="gerando" class="cob-nova" @submit.prevent="salvarNova(false)">
      <div class="cob-grade">
        <div>
          <label class="admin-label" for="cob-comp">Mês de referência</label>
          <input
            id="cob-comp"
            v-model="nova.competence"
            class="admin-input"
            type="month"
            :min="startedOn?.slice(0, 7)"
            :max="endsOn?.slice(0, 7)"
            :aria-invalid="!!competenciaFora"
            required
          />
          <small v-if="competenciaFora" class="hint-text cob-fora" role="alert">
            {{ competenciaFora === 'antes' ? 'Antes do início do contrato: o inquilino ainda não morava lá.' : 'Depois do fim do contrato.' }}
          </small>
          <small v-else class="hint-text">O mês em que o inquilino morou.</small>
        </div>
        <div>
          <label class="admin-label" for="cob-venc">Vencimento</label>
          <input id="cob-venc" v-model="nova.dueOn" class="admin-input" type="date" :min="hojeEmSaoPaulo()" required />
          <small class="hint-text">Aluguel vence no mês seguinte ao de uso (Lei 8.245).</small>
        </div>
        <div>
          <label class="admin-label" for="cob-alug">Aluguel</label>
          <div class="cob-prefixo"><span>R$</span><input id="cob-alug" v-model.number="nova.rentAmount" class="admin-input" type="number" min="0" step="0.01" required /></div>
        </div>
      </div>

      <div v-for="(x, i) in nova.extras" :key="i" class="cob-extra">
        <select v-model="x.kind" class="admin-input" :aria-label="`Tipo do item ${i + 1}`">
          <option v-for="k in CHARGE_ITEM_KINDS_MANUAIS" :key="k" :value="k">{{ CHARGE_ITEM_LABELS[k] }}</option>
        </select>
        <input v-model="x.description" class="admin-input" placeholder="Descrição (opcional)" :aria-label="`Descrição do item ${i + 1}`" maxlength="120" />
        <div class="cob-prefixo">
          <span>{{ x.kind === 'desconto' ? '− R$' : 'R$' }}</span>
          <input v-model.number="x.amount" class="admin-input" type="number" min="0" step="0.01" :aria-label="`Valor do item ${i + 1}`" />
        </div>
        <button type="button" class="admin-btn ghost sm" :aria-label="`Remover item ${i + 1}`" @click="nova.extras.splice(i, 1)"><AppIcon name="close" /></button>
      </div>
      <button type="button" class="link-btn cob-add" @click="addExtra"><AppIcon name="plus" /> Condomínio, IPTU, seguro ou desconto</button>

      <div class="cob-rodape">
        <p class="cob-total">Total <b>{{ brl(totalNova) }}</b></p>
        <div class="cob-acoes">
          <button v-if="conta" type="button" class="admin-btn sm" :disabled="salvandoNova" @click="salvarNova(true)">
            {{ salvandoNova ? 'Emitindo…' : 'Gerar e emitir boleto' }}
          </button>
          <button type="submit" class="admin-btn sm" :class="{ ghost: !!conta }" :disabled="salvandoNova">Salvar rascunho</button>
          <button type="button" class="admin-btn ghost sm" @click="gerando = false">Cancelar</button>
        </div>
      </div>
    </form>

    <p v-if="carregando" class="hint-text">Carregando…</p>
    <p v-else-if="erroCarga" role="alert" class="cob-erro">{{ erroCarga }} <button type="button" class="link-btn" @click="carregar">Tentar de novo</button></p>
    <p v-else-if="!cobrancas.length && !gerando" class="hint-text">Nenhuma cobrança ainda. Gere a do primeiro mês.</p>

    <ul v-else class="cob-lista">
      <li v-for="c in cobrancas" :key="c.id" class="cob-item" :class="`st-${c.status}`">
        <button type="button" class="cob-linha" :aria-expanded="aberta === c.id" @click="aberta = aberta === c.id ? null : c.id">
          <span class="cob-mes">
            <b>{{ c.kind === 'avulsa' ? 'Avulsa' : 'Aluguel' }} de {{ mesExtenso(c.competence) }}</b>
            <small>{{ c.status === 'paga' ? pagamentoResumo(c) : `vence ${dataBR(c.dueOn)}` }}</small>
          </span>
          <span class="cob-valor">{{ brl(c.issuedAmount ?? c.total) }}</span>
          <span class="cob-st">{{ CHARGE_STATUS_LABELS[c.status] }}</span>
          <AppIcon name="chevron-down" class="cob-seta" />
        </button>

        <div v-if="aberta === c.id" class="cob-det">
          <ul class="cob-itens">
            <li v-for="it in c.items" :key="it.id">
              <span>{{ CHARGE_ITEM_LABELS[it.kind] }}<small v-if="it.description"> · {{ it.description }}</small></span>
              <span>{{ brl(it.amount) }}</span>
            </li>
            <li v-for="s in c.settlements" :key="s.id" class="pago">
              <span>{{ s.amount < 0 ? 'Estorno' : 'Recebido' }} em {{ dataBR(s.settledOn) }} · {{ SETTLEMENT_METHOD_LABELS[s.method] }}{{ s.createdBy ? ' (registrado à mão)' : '' }}</span>
              <span>{{ brl(s.amount) }}</span>
            </li>
          </ul>
          <p v-if="c.finePercent || c.interestMonthlyPercent" class="hint-text">
            Depois do vencimento: multa de {{ c.finePercent ?? 0 }}% e juros de {{ c.interestMonthlyPercent ?? 0 }}% ao mês, calculados no boleto.
          </p>
          <p v-if="c.cancelReason" class="hint-text">Motivo do cancelamento: {{ c.cancelReason }}</p>

          <div v-if="emAberto(c.status) && (c.digitableLine || c.pixCopyPaste || c.paymentUrl)" class="cob-pagar">
            <div v-if="c.digitableLine">
              <span class="admin-label">Linha digitável</span>
              <code>{{ c.digitableLine }}</code>
              <button type="button" class="link-btn" @click="copiar(c.digitableLine, 'Linha digitável')">Copiar</button>
            </div>
            <div v-if="c.pixCopyPaste">
              <span class="admin-label">Pix copia e cola</span>
              <code class="corta">{{ c.pixCopyPaste }}</code>
              <button type="button" class="link-btn" @click="copiar(c.pixCopyPaste, 'Pix')">Copiar</button>
            </div>
            <a v-if="c.paymentUrl" :href="c.paymentUrl" target="_blank" rel="noopener" class="link-btn">Abrir fatura do boleto</a>
          </div>

          <form v-if="baixando === c.id" class="cob-baixa" @submit.prevent="registrarBaixa(c)">
            <div>
              <label class="admin-label" :for="`bx-v-${c.id}`">Valor recebido</label>
              <div class="cob-prefixo"><span>R$</span><input :id="`bx-v-${c.id}`" v-model.number="baixa.amount" class="admin-input" type="number" min="0" step="0.01" /></div>
            </div>
            <div>
              <label class="admin-label" :for="`bx-d-${c.id}`">Data</label>
              <input :id="`bx-d-${c.id}`" v-model="baixa.settledOn" class="admin-input" type="date" :max="hojeEmSaoPaulo()" />
            </div>
            <div>
              <label class="admin-label" :for="`bx-m-${c.id}`">Como pagou</label>
              <select :id="`bx-m-${c.id}`" v-model="baixa.method" class="admin-input">
                <option v-for="m in MANUAL_SETTLEMENT_METHODS" :key="m" :value="m">{{ SETTLEMENT_METHOD_LABELS[m] }}</option>
              </select>
            </div>
            <div class="cob-acoes">
              <button type="submit" class="admin-btn sm" :disabled="ocupado === c.id">Registrar</button>
              <button type="button" class="admin-btn ghost sm" @click="baixando = null">Voltar</button>
            </div>
            <p v-if="c.externalId" class="hint-text cob-span">O boleto é baixado no Asaas junto, para não poder ser pago de novo.</p>
          </form>

          <div v-else class="cob-acoes">
            <template v-if="c.status === 'rascunho'">
              <button v-if="conta" type="button" class="admin-btn sm" :disabled="ocupado === c.id" @click="emitir(c)">
                {{ ocupado === c.id ? 'Emitindo…' : 'Emitir boleto e Pix' }}
              </button>
              <button type="button" class="admin-btn ghost sm" @click="abrirBaixa(c)">Recebi por fora</button>
              <button type="button" class="admin-btn danger-ghost sm" :disabled="ocupado === c.id" @click="apagar(c)">Apagar rascunho</button>
            </template>
            <template v-else-if="emAberto(c.status)">
              <button v-if="sandbox && c.providerEnvironment === 'sandbox' && c.externalId" type="button" class="admin-btn sm" :disabled="ocupado === c.id" @click="simular(c)">
                Simular pagamento do inquilino
              </button>
              <button type="button" class="admin-btn ghost sm" @click="abrirBaixa(c)">Recebi por fora</button>
              <button v-if="c.status !== 'parcial'" type="button" class="admin-btn danger-ghost sm" :disabled="ocupado === c.id" @click="cancelar(c)">Cancelar</button>
            </template>
            <template v-else-if="c.status === 'emitindo'">
              <button type="button" class="admin-btn ghost sm" @click="carregar">Atualizar</button>
              <button type="button" class="admin-btn danger-ghost sm" @click="cancelar(c)">Cancelar</button>
            </template>
          </div>
        </div>
      </li>
    </ul>

    <template v-if="repasses.length">
      <h3 class="section-t cob-rep-t">Repasses ao proprietário</h3>
      <!-- Fica enquanto o recebido não cobrir o que foi repassado: não há
           botão de "resolvido" porque não há onde registrar a devolução. -->
      <p v-for="a in aRecuperar" :key="a.chargeId" class="cob-aviso alerta" role="alert">
        O pagamento de <b>{{ mesExtenso(a.competence) }}</b> foi estornado depois do repasse:
        <b>{{ brl(a.valor) }}</b> foram transferidos a mais ao proprietário. Peça a devolução ou desconte no
        próximo repasse.
      </p>
      <ul class="cob-rep">
        <li v-for="p in repasses" :key="p.id">
          <span class="cob-mes">
            <b>{{ mesExtenso(p.competence) }}</b>
            <small>
              {{ brl(p.gross) }} recebido<template v-if="p.adminFee"> − {{ brl(p.adminFee) }} de taxa</template>
            </small>
            <small v-if="p.status === 'pendente' && aMaiorSeMarcarFeito(cobrancas, repasses, p.id) > 0" class="cob-rep-ja">
              Já repassado antes do estorno: não transfira de novo
            </small>
          </span>
          <span class="cob-valor">{{ brl(p.net) }}</span>
          <span v-if="estornadoDepois(p)" class="cob-st alerta">Feito · estornado</span>
          <span v-else-if="p.status === 'pago'" class="cob-st ok">Feito</span>
          <span v-else-if="p.status === 'cancelado'" class="cob-st">Cancelado</span>
          <span v-else class="cob-rep-acao">
            <small>até {{ dataBR(p.scheduledFor) }}</small>
            <button type="button" class="admin-btn ghost sm" @click="repassePago(p)">Marcar como feito</button>
          </span>
        </li>
      </ul>
      <p v-if="repassesPendentes.length" class="hint-text">
        A transferência sai da conta da imobiliária. O prazo conta dias úteis bancários a partir do pagamento.
      </p>
    </template>
  </section>
</template>

<style scoped>
.cob-fora {
  color: var(--danger);
}
.cob-topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.cob-topo .admin-h2 {
  margin: 0;
}
.cob-sub {
  margin: 2px 0 0;
  color: var(--ink-soft);
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
}
.cob-aviso {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--surface);
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.cob-aviso a {
  color: var(--brand);
  font-weight: 600;
}
.cob-aviso.teste {
  background: #fef3c7;
  color: #92400e;
}
.cob-mes .cob-rep-ja {
  color: #991b1b;
  font-weight: 600;
}
.cob-aviso.alerta,
.cob-st.alerta {
  background: #fee2e2;
  color: #991b1b;
}
.cob-nova {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.cob-grade {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.cob-grade small {
  display: block;
  margin-top: 4px;
}
.cob-prefixo {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cob-prefixo span {
  color: var(--ink-soft);
  font-size: var(--fs-label);
  white-space: nowrap;
}
.cob-extra {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 150px auto;
  gap: 8px;
  align-items: center;
}
.cob-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
}
.cob-add :deep(svg) {
  width: 16px;
  height: 16px;
}
.cob-topo > .admin-btn {
  flex: none;
  white-space: nowrap;
}
.cob-rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.cob-total {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.cob-total b {
  font-size: 1.15em;
  margin-left: 6px;
}
.cob-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cob-erro {
  color: #b91c1c;
}
.cob-lista,
.cob-rep,
.cob-itens {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cob-item {
  border-top: 1px solid var(--line);
}
.cob-item:first-child {
  border-top: 0;
}
.cob-linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 118px 20px;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 4px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cob-linha:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
.cob-mes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cob-mes b::first-letter {
  text-transform: uppercase;
}
.cob-mes small {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.cob-valor {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: right;
}
.cob-st {
  justify-self: end;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--fs-caption);
  font-weight: 700;
  background: var(--surface);
  color: var(--ink-soft);
}
.st-emitida .cob-st {
  background: #dbeafe;
  color: #1e40af;
}
.st-vencida .cob-st {
  background: #fee2e2;
  color: #991b1b;
}
.st-parcial .cob-st,
.st-emitindo .cob-st {
  background: #fef3c7;
  color: #92400e;
}
.st-paga .cob-st,
.cob-st.ok {
  background: #dcfce7;
  color: #166534;
}
.st-cancelada .cob-valor {
  text-decoration: line-through;
  color: var(--ink-soft);
}
.cob-seta {
  width: 18px;
  height: 18px;
  color: var(--ink-soft);
  transition: transform 0.16s;
}
.cob-linha[aria-expanded='true'] .cob-seta {
  transform: rotate(180deg);
}
.cob-det {
  display: grid;
  gap: 12px;
  padding: 4px 4px 16px;
}
.cob-itens li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
}
.cob-itens small {
  color: var(--ink-soft);
}
.cob-itens li.pago {
  color: #166534;
}
.cob-pagar {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.cob-pagar > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  align-items: center;
}
.cob-pagar .admin-label {
  grid-column: 1 / -1;
  margin: 0;
}
.cob-pagar code {
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.cob-pagar code.corta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cob-pagar > a {
  justify-self: start;
}
.cob-baixa {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  padding: 12px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.cob-baixa .cob-acoes,
.cob-span {
  grid-column: 1 / -1;
}
.cob-rep-t {
  margin-top: 20px;
}
.cob-rep li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-top: 1px solid var(--line);
}
.cob-rep li:first-child {
  border-top: 0;
}
.cob-rep-acao {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cob-rep-acao small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
}
@media (max-width: 720px) {
  .cob-grade,
  .cob-baixa {
    grid-template-columns: 1fr;
  }
  .cob-extra {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }
  .cob-extra > input {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  /* No celular o mês ganha a linha inteira; valor e estado descem juntos. */
  .cob-linha {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 6px;
  }
  .cob-linha .cob-mes {
    grid-column: 1;
    grid-row: 1;
  }
  .cob-linha .cob-seta {
    grid-column: 2;
    grid-row: 1;
  }
  .cob-linha .cob-valor {
    grid-column: 1;
    grid-row: 2;
    text-align: left;
  }
  .cob-linha .cob-st {
    grid-column: 2;
    grid-row: 2;
  }
  .cob-rep li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .cob-rep-acao,
  .cob-rep .cob-st {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
