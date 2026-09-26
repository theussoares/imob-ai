<script setup lang="ts">
import type { Contract, PortalUser } from '~~/shared/models/portal'
import type { Property } from '~~/shared/models/property'
import type {
  FireInsurancePayer,
  GuaranteeType,
  LeaseCreateInput,
  PayoutDestinationInput,
  PessoaDoContrato,
} from '~~/shared/models/lease'
import {
  ADJUSTMENT_INDICES,
  FIRE_INSURANCE_LABELS,
  GUARANTEE_HINTS,
  GUARANTEE_LABELS,
  GUARANTEE_TYPES,
  LEASE_DEFAULTS,
  MAX_CAUCAO_ALUGUEIS,
  MAX_FINE_PERCENT,
  MAX_INTEREST_MONTHLY_PERCENT,
  contratoQueOcupa,
  fimDoPrazo,
} from '~~/shared/models/lease'
import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { EXEMPLO_CHAVE_PIX, ROTULO_CHAVE_PIX, chavePixValida } from '~~/shared/utils/pix'

/**
 * Novo contrato de locação em 4 etapas.
 *
 * Etapas, e não uma página, porque são ~25 campos: acima de ~10, dividir em
 * passos curtos reduz o esforço percebido (NN/g). A EDIÇÃO é uma página só,
 * com as mesmas seções — quem edita procura um campo, não percorre um fluxo.
 *
 * Só o essencial trava o "Continuar": imóvel (ou endereço), inquilino,
 * aluguel, vencimento e início. O resto vira pendência na ficha, como no Kenlo.
 * Base legal e de mercado de cada padrão: spec 2026-09-25, seção 4B.
 */
definePageMeta({ layout: 'admin', middleware: ['admin', 'area-cliente'] })
useHead({ title: 'Novo contrato · Painel' })

const toast = useToast()
const router = useRouter()

const { data: clientes } = useLazyAsyncData('admin:novo-contrato:clientes', () => adminFetch<PortalUser[]>('/api/admin/portal-users'), {
  server: false,
  default: () => [] as PortalUser[],
})
const { data: imoveis } = useLazyAsyncData('admin:novo-contrato:imoveis', () => adminFetch<Property[]>('/api/admin/properties'), {
  server: false,
  default: () => [] as Property[],
})

// Só para avisar do imóvel ocupado já no passo 2; quem decide é o servidor.
const { data: contratos } = useLazyAsyncData('admin:novo-contrato:contratos', () => adminFetch<Contract[]>('/api/admin/contracts'), {
  server: false,
  default: () => [] as Contract[],
})

const ETAPAS = ['Imóvel e pessoas', 'Valores e prazo', 'Garantia e seguro', 'Administração'] as const
const etapa = ref(0)

const hoje = new Date()
const proximoDia1 = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const f = reactive({
  propertyId: null as string | null,
  foraDoCatalogo: false,
  addressLabel: '',
  inquilino: null as PessoaDoContrato | null,
  proprietario: null as PessoaDoContrato | null,
  fiador: null as PessoaDoContrato | null,
  rentAmount: null as number | null,
  dueDay: 10 as number | null,
  startedOn: iso(proximoDia1),
  termMonths: LEASE_DEFAULTS.termMonths as number | null,
  adjustmentIndex: 'IGP-M' as string,
  finePercent: LEASE_DEFAULTS.finePercent as number | null,
  interestMonthlyPercent: LEASE_DEFAULTS.interestMonthlyPercent as number | null,
  guaranteeType: null as GuaranteeType | null,
  guaranteeAmount: null as number | null,
  guaranteeDetails: '',
  fireInsurancePayer: LEASE_DEFAULTS.fireInsurancePayer as FireInsurancePayer | null,
  adminFeePercent: LEASE_DEFAULTS.adminFeePercent as number | null,
  rentFeePercent: LEASE_DEFAULTS.rentFeePercent as number | null,
  payoutBusinessDays: LEASE_DEFAULTS.payoutBusinessDays as number | null,
  repasseTipo: 'pix' as 'pix' | 'conta_bancaria' | 'depois',
  pixKeyType: 'cpf' as 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria',
  pixKey: '',
  bankCode: '',
  branch: '',
  account: '',
  accountDigit: '',
  accountType: 'corrente' as 'corrente' | 'poupanca' | 'pagamento',
  holderName: '',
  holderDoc: '',
  marcarImovelAlugado: true,
  convidarPartes: false,
})

// ---- Etapa 1: imóvel ----
const buscaImovel = ref('')
/** Aluguel primeiro: é o que se loca. Venda aparece, mas depois. */
const imoveisFiltrados = computed(() => {
  const q = buscaImovel.value.trim().toLowerCase()
  return [...(imoveis.value ?? [])]
    .filter((p) => !q || p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || (p.neighborhood ?? '').toLowerCase().includes(q))
    .sort((a, b) => Number(b.purpose === 'aluguel') - Number(a.purpose === 'aluguel') || Number(a.status === 'rented') - Number(b.status === 'rented'))
    .slice(0, 8)
})
const imovel = computed(() => imoveis.value?.find((p) => p.id === f.propertyId) ?? null)
/**
 * O aluguel que veio do imóvel, para saber se o campo ainda é "do imóvel" ou
 * já foi digitado. Sem isto, trocar o NC-0267 (R$ 1.850) pelo NC-0275
 * (R$ 1.250) mantinha R$ 1.850 no passo 2, e o resumo seguia mostrando aluguel
 * e repasse do imóvel anterior. Valor digitado à mão é respeitado na troca.
 */
const aluguelDoImovel = ref<number | null>(null)
function escolherImovel(p: Property) {
  f.propertyId = p.id
  f.foraDoCatalogo = false
  if (!f.addressLabel) f.addressLabel = p.location || [p.title, p.neighborhood].filter(Boolean).join(' · ')
  // O preço de um imóvel de aluguel É o aluguel; de venda, não diz nada.
  const novo = p.purpose === 'aluguel' ? p.price : null
  if (!f.rentAmount || f.rentAmount === aluguelDoImovel.value) f.rentAmount = novo
  aluguelDoImovel.value = novo
}
function limparImovel() {
  f.propertyId = null
  f.addressLabel = ''
}
/** Contrato ativo que já ocupa o imóvel escolhido nas datas digitadas. */
const ocupante = computed(() =>
  contratoQueOcupa(contratos.value ?? [], { propertyId: f.propertyId, startedOn: f.startedOn, endsOn: termino.value }),
)

const idsUsados = computed(() =>
  [f.inquilino, f.proprietario, f.fiador].flatMap((p) => (p && 'id' in p ? [p.id] : [])),
)
const nomeDe = (p: PessoaDoContrato | null) =>
  !p ? '' : 'id' in p ? (clientes.value?.find((c) => c.id === p.id)?.name ?? '') : p.nova.name
const docDe = (p: PessoaDoContrato | null) =>
  !p ? '' : 'id' in p ? (clientes.value?.find((c) => c.id === p.id)?.doc ?? '') : (p.nova.doc ?? '')

// O titular do repasse é o proprietário por padrão (Imobzi faz igual); a conta
// do cônjuge ou do espólio é exceção, e o campo continua editável.
watch(
  () => f.proprietario,
  (p) => {
    f.holderName = nomeDe(p)
    f.holderDoc = formatarDocumento(docDe(p))
  },
)

// ---- Etapa 2: prazo ----
const PRAZOS = [12, 24, 30, 36]
const termino = computed(() => (f.startedOn && f.termMonths ? fimDoPrazo(f.startedOn, f.termMonths) : null))
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '')
const brl = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ---- Etapa 3: garantia ----
const maxCaucao = computed(() => (f.rentAmount ? f.rentAmount * MAX_CAUCAO_ALUGUEIS : null))
// Caução sugerida (3 aluguéis) acompanha o aluguel; digitada, fica.
watch(
  () => f.rentAmount,
  (novo, antigo) => {
    if (f.guaranteeType === 'caucao' && antigo && novo && f.guaranteeAmount === antigo * MAX_CAUCAO_ALUGUEIS) {
      f.guaranteeAmount = novo * MAX_CAUCAO_ALUGUEIS
    }
  },
)
watch(
  () => f.guaranteeType,
  (g) => {
    if (g !== 'fiador') f.fiador = null
    if (g === 'caucao' && !f.guaranteeAmount && f.rentAmount) f.guaranteeAmount = f.rentAmount * MAX_CAUCAO_ALUGUEIS
  },
)

// ---- Etapa 4: administração ----
const recebeProprietario = computed(() =>
  f.rentAmount != null && f.adminFeePercent != null ? f.rentAmount * (1 - f.adminFeePercent / 100) : null,
)
const taxaLocacaoValor = computed(() =>
  f.rentAmount != null && f.rentFeePercent != null ? (f.rentAmount * f.rentFeePercent) / 100 : null,
)
/**
 * Quem pode receber o convite, separado de quem tem e-mail. Eram uma conta só,
 * e a frase "ninguém aqui tem e-mail" aparecia quando as três pessoas tinham —
 * só que todas já com acesso.
 */
const situacaoDoConvite = computed<'pode' | 'todos_com_acesso' | 'sem_email'>(() => {
  let comEmail = 0
  let pendentes = 0
  for (const p of [f.inquilino, f.proprietario, f.guaranteeType === 'fiador' ? f.fiador : null]) {
    if (!p) continue
    const c = 'nova' in p ? { email: p.nova.email, userId: null } : clientes.value?.find((x) => x.id === p.id)
    if (!c?.email) continue
    comEmail++
    if (!c.userId) pendentes++
  }
  if (pendentes) return 'pode'
  return comEmail ? 'todos_com_acesso' : 'sem_email'
})
const temEmail = computed(() => situacaoDoConvite.value === 'pode')
const AJUDA_CONVITE = {
  pode: 'Para quem tem e-mail e ainda não acessa: eles veem o contrato, os boletos e os documentos.',
  todos_com_acesso: 'Todos com e-mail aqui já foram convidados para a Área do Cliente: o contrato aparece lá para eles. Para reenviar o convite, use a tela de Clientes.',
  sem_email: 'Ninguém aqui tem e-mail cadastrado. Dá para convidar depois, em Clientes.',
} as const

// ---- Validação por etapa ----
const erros = ref<string[]>([])
function errosDaEtapa(n: number): string[] {
  const e: string[] = []
  if (n === 0) {
    if (!f.propertyId && !f.addressLabel.trim()) e.push('Escolha o imóvel ou escreva o endereço.')
    if (!f.inquilino) e.push('Escolha ou cadastre o inquilino.')
  }
  if (n === 1) {
    if (!(Number(f.rentAmount) > 0)) e.push('Informe o valor do aluguel.')
    if (!f.dueDay || f.dueDay < 1 || f.dueDay > 31) e.push('Dia do vencimento entre 1 e 31.')
    if (!f.startedOn) e.push('Informe a data de início.')
    // O servidor já recusava 0, mas só no último passo, depois de a pessoa
    // preencher garantia e repasse em cima de um prazo que não existe.
    if (f.termMonths != null && (!Number.isInteger(f.termMonths) || f.termMonths < 1 || f.termMonths > 600))
      e.push('Prazo em meses, entre 1 e 600 (ou deixe em branco se não houver).')
    if (ocupante.value) e.push(`O imóvel já está alugado no contrato ${ocupante.value.code}, ativo nesse período. Encerre aquele contrato ou mude as datas.`)
    if (f.finePercent != null && (f.finePercent < 0 || f.finePercent > MAX_FINE_PERCENT)) e.push(`Multa: no máximo ${MAX_FINE_PERCENT}%.`)
    if (f.interestMonthlyPercent != null && (f.interestMonthlyPercent < 0 || f.interestMonthlyPercent > MAX_INTEREST_MONTHLY_PERCENT))
      e.push(`Juros: no máximo ${MAX_INTEREST_MONTHLY_PERCENT}% ao mês.`)
  }
  if (n === 2) {
    if (f.guaranteeType === 'caucao' && maxCaucao.value && (f.guaranteeAmount ?? 0) > maxCaucao.value)
      e.push(`Caução até ${MAX_CAUCAO_ALUGUEIS} aluguéis (${brl(maxCaucao.value)}), pela Lei 8.245, art. 38.`)
    if (f.guaranteeType === 'fiador' && !f.fiador) e.push('Escolha ou cadastre o fiador, ou troque a garantia.')
  }
  if (n === 3 && f.proprietario && f.repasseTipo !== 'depois') {
    if (!f.holderName.trim()) e.push('Repasse: informe o titular.')
    if (!tipoDeDocumento(f.holderDoc)) e.push('Repasse: CPF/CNPJ do titular inválido.')
    if (f.repasseTipo === 'pix' && !f.pixKey.trim()) e.push('Repasse: informe a chave Pix.')
    else if (f.repasseTipo === 'pix' && !chavePixValida(f.pixKeyType, f.pixKey)) e.push(`Repasse: a chave Pix não é um ${ROTULO_CHAVE_PIX[f.pixKeyType]} válido.`)
    if (f.repasseTipo === 'conta_bancaria') {
      if (!/^\d{3}$/.test(f.bankCode)) e.push('Repasse: código do banco com 3 dígitos (ex.: 001, 237, 341).')
      if (!f.branch.trim() || !f.account.trim()) e.push('Repasse: agência e conta.')
    }
  }
  return e
}
// Corrigiu o campo, o aviso da etapa se atualiza — antes ficava na tela
// dizendo "CPF inválido" até a pessoa clicar em Continuar de novo.
watch(
  () => ({ ...f }),
  () => {
    if (erros.value.length) erros.value = errosDaEtapa(etapa.value)
  },
  { deep: true },
)
function irPara(n: number) {
  // Pode voltar sempre; avançar só com a etapa atual (e as anteriores) em ordem.
  if (n <= etapa.value) {
    etapa.value = n
    erros.value = []
    return
  }
  for (let i = etapa.value; i < n; i++) {
    const e = errosDaEtapa(i)
    if (e.length) {
      etapa.value = i
      erros.value = e
      nextTick(() => document.getElementById('erros-etapa')?.focus())
      return
    }
  }
  etapa.value = n
  erros.value = []
  nextTick(() => document.getElementById('etapa-titulo')?.focus())
}

// ---- Criar ----
const criando = ref(false)
function repasse(): PayoutDestinationInput | null {
  if (!f.proprietario || f.repasseTipo === 'depois') return null
  const titular = { holderName: f.holderName.trim(), holderDoc: f.holderDoc.replace(/\D/g, '') }
  return f.repasseTipo === 'pix'
    ? { kind: 'pix', pixKeyType: f.pixKeyType, pixKey: f.pixKey.trim(), ...titular }
    : {
        kind: 'conta_bancaria',
        bankCode: f.bankCode,
        branch: f.branch.replace(/\D/g, ''),
        account: f.account.replace(/\D/g, ''),
        accountDigit: f.accountDigit.trim() || null,
        accountType: f.accountType,
        ...titular,
      }
}
async function criar() {
  for (let i = 0; i < ETAPAS.length; i++) {
    const e = errosDaEtapa(i)
    if (e.length) {
      etapa.value = i
      erros.value = e
      return
    }
  }
  criando.value = true
  try {
    const body: LeaseCreateInput = {
      propertyId: f.propertyId,
      addressLabel: f.addressLabel.trim() || null,
      marcarImovelAlugado: !!f.propertyId && f.marcarImovelAlugado,
      inquilino: f.inquilino!,
      proprietario: f.proprietario,
      fiador: f.guaranteeType === 'fiador' ? f.fiador : null,
      rentAmount: Number(f.rentAmount),
      dueDay: Number(f.dueDay),
      startedOn: f.startedOn,
      termMonths: f.termMonths,
      adjustmentIndex: f.adjustmentIndex || null,
      finePercent: f.finePercent,
      interestMonthlyPercent: f.interestMonthlyPercent,
      guaranteeType: f.guaranteeType,
      guaranteeAmount: f.guaranteeType === 'caucao' ? f.guaranteeAmount : null,
      guaranteeDetails: f.guaranteeDetails.trim() || null,
      fireInsurancePayer: f.fireInsurancePayer,
      adminFeePercent: f.adminFeePercent,
      rentFeePercent: f.rentFeePercent,
      payoutBusinessDays: f.payoutBusinessDays,
      repasse: repasse(),
      convidarPartes: f.convidarPartes && temEmail.value,
    }
    const r = await adminFetch<{ contrato: { id: string; code: string }; convites: { nome: string; enviado: boolean }[] }>(
      '/api/admin/contracts/locacao',
      { method: 'POST', body },
    )
    const falhos = r.convites.filter((c) => !c.enviado)
    // Navega ANTES de avisar: a troca de página limpa os erros (Toasts.vue), e
    // o do convite falho sumiria antes de ser lido.
    await router.push(`/admin/contratos/${r.contrato.id}`)
    toast.success(`Contrato ${r.contrato.code} criado.`)
    if (falhos.length) toast.error(`O convite não saiu para ${falhos.map((c) => c.nome).join(', ')}. Reenvie pela tela de Clientes.`)
  } catch (e: unknown) {
    erros.value = [(e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível criar o contrato.']
  } finally {
    criando.value = false
  }
}

useUnsavedGuard(() => !criando.value && (!!f.inquilino || !!f.propertyId || !!f.addressLabel.trim()))
</script>

<template>
  <div class="novo">
    <NuxtLink to="/admin/contratos" class="voltar">← Contratos</NuxtLink>
    <h1 class="admin-h1">Novo contrato de locação</h1>

    <ol class="passos" aria-label="Etapas">
      <li v-for="(nome, i) in ETAPAS" :key="nome" :class="{ atual: i === etapa, feito: i < etapa }">
        <button type="button" :aria-current="i === etapa ? 'step' : undefined" @click="irPara(i)">
          <span class="passo-n" aria-hidden="true">
            <AppIcon v-if="i < etapa" name="check" /><template v-else>{{ i + 1 }}</template>
          </span>
          <span class="passo-nome">{{ nome }}</span>
        </button>
      </li>
    </ol>

    <div class="corpo">
      <section class="admin-card etapa" :aria-labelledby="'etapa-titulo'">
        <h2 id="etapa-titulo" class="etapa-titulo" tabindex="-1">{{ ETAPAS[etapa] }}</h2>

        <div v-if="erros.length" id="erros-etapa" class="erros" role="alert" tabindex="-1">
          <p v-for="e in erros" :key="e">{{ e }}</p>
        </div>

        <!-- 1. Imóvel e pessoas -->
        <template v-if="etapa === 0">
          <fieldset class="bloco">
            <legend class="admin-label">Imóvel</legend>
            <div v-if="imovel" class="escolhido">
              <div>
                <b>{{ imovel.code }} · {{ imovel.title }}</b>
                <small>{{ imovel.purpose === 'aluguel' ? `Aluguel ${brl(imovel.price)}` : 'Imóvel de venda' }}</small>
                <small v-if="ocupante" class="ocupado" role="status">
                  Já alugado no contrato {{ ocupante.code }}, ativo até {{ dataBR(ocupante.endsOn) || 'sem data de fim' }}. Só dá para seguir com início depois disso.
                </small>
              </div>
              <button type="button" class="link-btn" @click="limparImovel">Trocar</button>
            </div>
            <template v-else-if="!f.foraDoCatalogo">
              <input v-model="buscaImovel" class="admin-input" type="search" placeholder="Buscar por código, título ou bairro" aria-label="Buscar imóvel" />
              <ul class="opcoes">
                <li v-for="p in imoveisFiltrados" :key="p.id">
                  <button type="button" @click="escolherImovel(p)">
                    <span class="op-cod">{{ p.code }}</span>
                    <span class="op-tit">{{ p.title }}</span>
                    <span class="op-meta">
                      {{ p.purpose === 'aluguel' ? brl(p.price) : 'Venda' }}<template v-if="p.status === 'rented'"> · já alugado</template>
                    </span>
                  </button>
                </li>
              </ul>
              <button type="button" class="link-btn" @click="f.foraDoCatalogo = true">O imóvel não está no catálogo</button>
            </template>
            <div class="campo" v-if="imovel || f.foraDoCatalogo">
              <label class="admin-label" for="endereco">Endereço completo {{ f.foraDoCatalogo ? '*' : '' }}</label>
              <input id="endereco" v-model="f.addressLabel" class="admin-input" placeholder="Rua, número, complemento, bairro" />
              <p class="ajuda">É o que o cliente vê na Área do Cliente e o que sai no boleto.</p>
              <button v-if="f.foraDoCatalogo" type="button" class="link-btn" @click="f.foraDoCatalogo = false">Escolher do catálogo</button>
            </div>
          </fieldset>

          <AdminPessoaPicker v-model="f.inquilino" :clientes="clientes" rotulo="Inquilino *" documento-importante :excluir-ids="idsUsados" />
          <AdminPessoaPicker v-model="f.proprietario" :clientes="clientes" rotulo="Proprietário" :excluir-ids="idsUsados" />
        </template>

        <!-- 2. Valores e prazo -->
        <template v-else-if="etapa === 1">
          <div class="grade">
            <div>
              <label class="admin-label" for="aluguel">Aluguel mensal *</label>
              <div class="prefixo"><span>R$</span><input id="aluguel" v-model.number="f.rentAmount" class="admin-input" type="number" min="0" step="0.01" inputmode="decimal" /></div>
            </div>
            <div>
              <label class="admin-label" for="venc">Dia do vencimento *</label>
              <input id="venc" v-model.number="f.dueDay" class="admin-input" type="number" min="1" max="31" />
              <p class="ajuda" v-if="(f.dueDay ?? 0) > 28">Em meses mais curtos vence no último dia.</p>
            </div>
            <div>
              <label class="admin-label" for="inicio">Início *</label>
              <input id="inicio" v-model="f.startedOn" class="admin-input" type="date" />
            </div>
          </div>

          <fieldset class="bloco">
            <legend class="admin-label">Prazo</legend>
            <div class="chips" role="radiogroup" aria-label="Prazo em meses">
              <button v-for="m in PRAZOS" :key="m" type="button" role="radio" :aria-checked="f.termMonths === m" :class="{ on: f.termMonths === m }" @click="f.termMonths = m">
                {{ m }} meses
              </button>
              <label class="chip-outro">
                <span class="sr-only">Outro prazo em meses</span>
                <input v-model.number="f.termMonths" class="admin-input" type="number" min="1" max="600" aria-label="Prazo em meses" />
                meses
              </label>
            </div>
            <p class="ajuda">
              <template v-if="termino">Termina em <b>{{ dataBR(termino) }}</b>. </template>
              <template v-if="(f.termMonths ?? 0) >= 30">Com 30 meses ou mais, o proprietário retoma o imóvel no fim do prazo sem precisar justificar (Lei 8.245, art. 46).</template>
              <template v-else-if="f.termMonths">Abaixo de 30 meses, a retomada no fim do prazo tem mais restrições (Lei 8.245, art. 47).</template>
            </p>
          </fieldset>

          <fieldset class="bloco">
            <legend class="admin-label">Reajuste anual pelo índice</legend>
            <div class="chips" role="radiogroup" aria-label="Índice de reajuste">
              <button v-for="i in ADJUSTMENT_INDICES" :key="i" type="button" role="radio" :aria-checked="f.adjustmentIndex === i" :class="{ on: f.adjustmentIndex === i }" @click="f.adjustmentIndex = i">
                {{ i }}
              </button>
            </div>
            <p class="ajuda">Uma vez por ano, no aniversário do contrato. Reajuste em prazo menor é nulo (Lei 10.192/2001).</p>
          </fieldset>

          <div class="grade">
            <div>
              <label class="admin-label" for="multa">Multa por atraso</label>
              <div class="sufixo"><input id="multa" v-model.number="f.finePercent" class="admin-input" type="number" min="0" :max="MAX_FINE_PERCENT" step="0.5" /><span>%</span></div>
              <p class="ajuda">Até {{ MAX_FINE_PERCENT }}%. Vai impressa no boleto.</p>
            </div>
            <div>
              <label class="admin-label" for="juros">Juros de mora</label>
              <div class="sufixo"><input id="juros" v-model.number="f.interestMonthlyPercent" class="admin-input" type="number" min="0" :max="MAX_INTEREST_MONTHLY_PERCENT" step="0.1" /><span>% ao mês</span></div>
              <p class="ajuda">Até {{ MAX_INTEREST_MONTHLY_PERCENT }}% ao mês, proporcional aos dias.</p>
            </div>
          </div>
        </template>

        <!-- 3. Garantia e seguro -->
        <template v-else-if="etapa === 2">
          <fieldset class="bloco">
            <legend class="admin-label">Garantia</legend>
            <p class="ajuda topo">A lei permite <b>uma</b> garantia por contrato (Lei 8.245, art. 37).</p>
            <div class="cartoes" role="radiogroup" aria-label="Garantia">
              <button v-for="g in GUARANTEE_TYPES" :key="g" type="button" role="radio" :aria-checked="f.guaranteeType === g" class="cartao" :class="{ on: f.guaranteeType === g }" @click="f.guaranteeType = g">
                <b>{{ GUARANTEE_LABELS[g] }}</b>
                <small>{{ GUARANTEE_HINTS[g] }}</small>
              </button>
            </div>
            <button v-if="f.guaranteeType" type="button" class="link-btn" @click="f.guaranteeType = null">Informar depois</button>
          </fieldset>

          <AdminPessoaPicker v-if="f.guaranteeType === 'fiador'" v-model="f.fiador" :clientes="clientes" rotulo="Fiador *" documento-importante :excluir-ids="idsUsados" />

          <div v-if="f.guaranteeType === 'caucao'" class="grade">
            <div>
              <label class="admin-label" for="caucao">Valor da caução</label>
              <div class="prefixo"><span>R$</span><input id="caucao" v-model.number="f.guaranteeAmount" class="admin-input" type="number" min="0" step="0.01" /></div>
              <p class="ajuda" v-if="maxCaucao">Máximo: {{ brl(maxCaucao) }} ({{ MAX_CAUCAO_ALUGUEIS }} aluguéis).</p>
            </div>
          </div>
          <div v-if="f.guaranteeType && !['nenhuma', 'fiador'].includes(f.guaranteeType)" class="campo">
            <label class="admin-label" for="gdet">{{ f.guaranteeType === 'caucao' ? 'Onde está depositada' : 'Seguradora, apólice e validade' }}</label>
            <input id="gdet" v-model="f.guaranteeDetails" class="admin-input" maxlength="1000" />
          </div>

          <fieldset class="bloco">
            <legend class="admin-label">Seguro contra incêndio</legend>
            <div class="chips" role="radiogroup" aria-label="Seguro contra incêndio">
              <button v-for="(rot, v) in FIRE_INSURANCE_LABELS" :key="v" type="button" role="radio" :aria-checked="f.fireInsurancePayer === v" :class="{ on: f.fireInsurancePayer === v }" @click="f.fireInsurancePayer = v as FireInsurancePayer">
                {{ rot }}
              </button>
            </div>
            <p class="ajuda">A lei põe o seguro por conta do proprietário, salvo cláusula em contrário (art. 22, VIII).</p>
          </fieldset>
        </template>

        <!-- 4. Administração -->
        <template v-else>
          <div class="grade">
            <div>
              <label class="admin-label" for="tadm">Taxa de administração</label>
              <div class="sufixo"><input id="tadm" v-model.number="f.adminFeePercent" class="admin-input" type="number" min="0" max="100" step="0.5" /><span>%</span></div>
              <p class="ajuda">Referência do CRECI: 8% a 10%.</p>
            </div>
            <div>
              <label class="admin-label" for="tloc">Taxa de locação</label>
              <div class="sufixo"><input id="tloc" v-model.number="f.rentFeePercent" class="admin-input" type="number" min="0" max="100" step="5" /><span>%</span></div>
              <p class="ajuda">Do 1º aluguel, uma vez só<template v-if="taxaLocacaoValor != null">: {{ brl(taxaLocacaoValor) }}</template>.</p>
            </div>
            <div>
              <label class="admin-label" for="rep">Repasse ao proprietário</label>
              <div class="sufixo"><input id="rep" v-model.number="f.payoutBusinessDays" class="admin-input" type="number" min="0" max="30" /><span>dias úteis</span></div>
              <p class="ajuda">Depois do pagamento do inquilino. O mercado pratica de 3 a 7.</p>
            </div>
          </div>

          <fieldset v-if="f.proprietario" class="bloco">
            <legend class="admin-label">Para onde vai o repasse de {{ nomeDe(f.proprietario) }}</legend>
            <div class="chips" role="radiogroup" aria-label="Forma do repasse">
              <button type="button" role="radio" :aria-checked="f.repasseTipo === 'pix'" :class="{ on: f.repasseTipo === 'pix' }" @click="f.repasseTipo = 'pix'">Pix</button>
              <button type="button" role="radio" :aria-checked="f.repasseTipo === 'conta_bancaria'" :class="{ on: f.repasseTipo === 'conta_bancaria' }" @click="f.repasseTipo = 'conta_bancaria'">Conta bancária</button>
              <button type="button" role="radio" :aria-checked="f.repasseTipo === 'depois'" :class="{ on: f.repasseTipo === 'depois' }" @click="f.repasseTipo = 'depois'">Informar depois</button>
            </div>
            <div v-if="f.repasseTipo !== 'depois'" class="grade">
              <template v-if="f.repasseTipo === 'pix'">
                <div>
                  <label class="admin-label" for="pixt">Tipo de chave</label>
                  <select id="pixt" v-model="f.pixKeyType" class="admin-input">
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone</option>
                    <option value="aleatoria">Chave aleatória</option>
                  </select>
                </div>
                <div class="span2">
                  <label class="admin-label" for="pix">Chave Pix</label>
                  <input id="pix" v-model="f.pixKey" class="admin-input" autocomplete="off" :placeholder="EXEMPLO_CHAVE_PIX[f.pixKeyType]" />
                </div>
              </template>
              <template v-else>
                <div>
                  <label class="admin-label" for="banco">Banco (código)</label>
                  <input id="banco" v-model="f.bankCode" class="admin-input" inputmode="numeric" maxlength="3" placeholder="001, 237, 341…" />
                </div>
                <div>
                  <label class="admin-label" for="ag">Agência</label>
                  <input id="ag" v-model="f.branch" class="admin-input" inputmode="numeric" />
                </div>
                <div>
                  <label class="admin-label" for="cc">Conta</label>
                  <div class="conta"><input id="cc" v-model="f.account" class="admin-input" inputmode="numeric" /><input v-model="f.accountDigit" class="admin-input dv" aria-label="Dígito da conta" maxlength="2" /></div>
                </div>
                <div>
                  <label class="admin-label" for="ctipo">Tipo</label>
                  <select id="ctipo" v-model="f.accountType" class="admin-input">
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="pagamento">Pagamento</option>
                  </select>
                </div>
              </template>
              <div>
                <label class="admin-label" for="tit">Titular</label>
                <input id="tit" v-model="f.holderName" class="admin-input" />
              </div>
              <div>
                <label class="admin-label" for="titdoc">CPF/CNPJ do titular</label>
                <input id="titdoc" v-model="f.holderDoc" class="admin-input" inputmode="numeric" @blur="f.holderDoc = formatarDocumento(f.holderDoc)" />
              </div>
            </div>
            <p class="ajuda">Pode ser a conta do cônjuge ou do espólio: por isso titular e documento são editáveis.</p>
          </fieldset>
          <p v-else class="ajuda">Sem proprietário no contrato, não há para quem repassar. Dá para vincular depois na ficha.</p>

          <label v-if="f.propertyId" class="opcao">
            <input v-model="f.marcarImovelAlugado" type="checkbox" />
            <span><b>Marcar o imóvel como "Alugado" no site</b><small>Ele sai da lista de disponíveis. Dá para desfazer no cadastro do imóvel.</small></span>
          </label>
          <label class="opcao" :class="{ desligado: !temEmail }">
            <input v-model="f.convidarPartes" type="checkbox" :disabled="!temEmail" />
            <span>
              <b>Enviar convite da Área do Cliente</b>
              <small>{{ AJUDA_CONVITE[situacaoDoConvite] }}</small>
            </span>
          </label>
        </template>

        <div class="navegacao">
          <button v-if="etapa > 0" type="button" class="admin-btn ghost" @click="irPara(etapa - 1)">Voltar</button>
          <button v-if="etapa < ETAPAS.length - 1" type="button" class="admin-btn" @click="irPara(etapa + 1)">Continuar</button>
          <button v-else type="button" class="admin-btn" :disabled="criando" @click="criar">{{ criando ? 'Criando…' : 'Criar contrato' }}</button>
        </div>
      </section>

      <aside class="resumo" aria-label="Resumo do contrato">
        <h2 class="resumo-t">Resumo</h2>
        <dl>
          <div><dt>Imóvel</dt><dd>{{ imovel ? `${imovel.code} · ${imovel.title}` : f.addressLabel || '—' }}</dd></div>
          <div><dt>Inquilino</dt><dd>{{ nomeDe(f.inquilino) || '—' }}</dd></div>
          <div><dt>Proprietário</dt><dd>{{ nomeDe(f.proprietario) || '—' }}</dd></div>
          <div><dt>Aluguel</dt><dd>{{ f.rentAmount ? `${brl(f.rentAmount)}, todo dia ${f.dueDay}` : '—' }}</dd></div>
          <div><dt>Vigência</dt><dd>{{ f.startedOn ? `${dataBR(f.startedOn)} a ${dataBR(termino) || '?'}` : '—' }}</dd></div>
          <div><dt>Reajuste</dt><dd>{{ f.adjustmentIndex }}, anual</dd></div>
          <div><dt>Garantia</dt><dd>{{ f.guaranteeType ? GUARANTEE_LABELS[f.guaranteeType] : 'a informar' }}</dd></div>
        </dl>
        <div v-if="recebeProprietario != null" class="resumo-destaque">
          <small>Proprietário recebe por mês</small>
          <b>{{ brl(recebeProprietario) }}</b>
          <small>aluguel menos {{ f.adminFeePercent }}% de administração</small>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.voltar {
  display: inline-block;
  margin-bottom: 8px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  text-decoration: none;
}
.passos {
  display: flex;
  gap: 6px;
  list-style: none;
  margin: 14px 0 18px;
  padding: 0;
  overflow-x: auto;
}
.passos li {
  flex: 1 1 0;
  min-width: max-content;
}
.passos button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-bottom: 3px solid var(--line);
  background: none;
  font: inherit;
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  text-align: left;
}
.passos .atual button {
  color: var(--brand);
  border-bottom-color: var(--brand);
}
.passos .feito button {
  color: var(--ink);
  border-bottom-color: color-mix(in srgb, var(--brand) 40%, var(--line));
}
.passos button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.passo-n {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  font-variant-numeric: tabular-nums;
}
.atual .passo-n {
  background: var(--brand);
  color: #fff;
}
.feito .passo-n {
  background: var(--brand-ghost);
  color: var(--brand);
}
.passo-n :deep(svg) {
  width: 14px;
  height: 14px;
}

.corpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
  align-items: start;
}
.etapa {
  display: grid;
  gap: 18px;
}
.etapa-titulo {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-title-sm);
}
.etapa-titulo:focus {
  outline: none;
}
.erros {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: #fbf0ef;
  color: #9f2d2d;
  font-size: var(--fs-label);
}
.erros p {
  margin: 2px 0;
}
.erros:focus {
  outline: 2px solid #9f2d2d;
  outline-offset: 2px;
}
.bloco {
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.bloco > .link-btn {
  justify-self: start;
}
.bloco legend {
  padding: 0;
  margin-bottom: 6px;
}
.campo {
  display: grid;
  gap: 2px;
}
.ajuda {
  margin: 4px 0 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  line-height: 1.5;
  max-width: 70ch;
}
.ajuda.topo {
  margin: -4px 0 4px;
}
.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.span2 {
  grid-column: span 2;
}
.escolhido {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1.5px solid color-mix(in srgb, var(--brand) 35%, var(--line-2));
  border-radius: var(--r-md);
  background: var(--brand-ghost);
}
.escolhido > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.escolhido small {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.escolhido .ocupado {
  color: var(--danger);
  font-weight: 600;
}
.opcoes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
}
.opcoes button {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--paper);
  font: inherit;
  font-size: var(--fs-ui);
  text-align: left;
  cursor: pointer;
}
.opcoes button:hover,
.opcoes button:focus-visible {
  border-color: var(--brand);
  outline: none;
}
.op-cod {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.op-tit {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-meta {
  color: var(--ink-soft);
  font-size: var(--fs-label);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.prefixo,
.sufixo {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  overflow: hidden;
}
.prefixo:focus-within,
.sufixo:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 40%, transparent);
}
.prefixo span,
.sufixo span {
  padding: 0 10px;
  color: var(--ink-soft);
  font-size: var(--fs-label);
  white-space: nowrap;
}
.prefixo .admin-input,
.sufixo .admin-input {
  border: none;
  box-shadow: none;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chips button {
  padding: 8px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--paper);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.chips button.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
  color: var(--brand);
}
.chips button:focus-visible,
.cartao:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.chip-outro {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.chip-outro .admin-input {
  width: 84px;
  padding: 7px 10px;
  font-size: var(--fs-ui);
}
.cartoes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.cartao {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cartao small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
  line-height: 1.45;
}
.cartao.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.cartao.on b {
  color: var(--brand);
}
.conta {
  display: flex;
  gap: 6px;
}
.conta .dv {
  width: 56px;
  flex: none;
}
.opcao {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
}
.opcao input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  flex: none;
  accent-color: var(--brand);
}
.opcao span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.opcao small {
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.opcao.desligado {
  cursor: default;
}
.opcao.desligado b {
  color: var(--ink-soft);
}
.navegacao {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.navegacao .admin-btn:only-child {
  margin-left: auto;
}
.navegacao .admin-btn:last-child:not(:only-child) {
  margin-left: auto;
}

.resumo {
  position: sticky;
  top: 16px;
  padding: 18px;
  border-radius: var(--r-md);
  background: var(--paper);
  border: 1px solid var(--line-2);
}
.resumo-t {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: var(--fs-ui);
}
.resumo dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
.resumo dl div {
  display: grid;
  gap: 1px;
}
.resumo dt {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.resumo dd {
  margin: 0;
  font-size: var(--fs-label);
  font-weight: 600;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.resumo-destaque {
  display: grid;
  gap: 2px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.resumo-destaque b {
  font-family: var(--font-display);
  font-size: var(--fs-title);
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.resumo-destaque small {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 960px) {
  .corpo {
    grid-template-columns: 1fr;
  }
  .resumo {
    position: static;
    order: 2;
  }
}
@media (max-width: 560px) {
  .passo-nome {
    display: none;
  }
  .passos .atual .passo-nome {
    display: inline;
  }
  .span2 {
    grid-column: auto;
  }
  .opcoes button {
    grid-template-columns: 70px 1fr;
  }
  .op-meta {
    grid-column: 2;
  }
}
</style>
