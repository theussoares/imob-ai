<script setup lang="ts">
import type {
  Contract,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
  PortalDocCategory,
  PortalDocument,
  PortalUser,
} from '~~/shared/models/portal'
import {
  CONTRACT_PARTY_LABELS,
  CONTRACT_PARTY_ROLES,
  PORTAL_DOC_CATEGORIES,
  PORTAL_DOC_HINTS,
  PORTAL_DOC_LABELS,
} from '~~/shared/models/portal'
import type { FireInsurancePayer, GuaranteeType, PessoaDoContrato } from '~~/shared/models/lease'
import {
  ADJUSTMENT_INDICES,
  FIRE_INSURANCE_LABELS,
  GUARANTEE_LABELS,
  GUARANTEE_TYPES,
  MAX_CAUCAO_ALUGUEIS,
  MAX_FINE_PERCENT,
  MAX_INTEREST_MONTHLY_PERCENT,
  fimDoPrazo,
  pendenciasDoContrato,
} from '~~/shared/models/lease'
import { defaultAudienceFor, describeAudience } from '~~/shared/utils/portal-access'
import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { formatWhatsapp } from '~~/shared/utils/phone'
import { ACCEPT_DE_DOCUMENTO, FORMATOS_DE_DOCUMENTO, TAMANHO_MAX_DOCUMENTO } from '~~/shared/utils/arquivo-documento'
import { EXEMPLO_CHAVE_PIX, ROTULO_CHAVE_PIX, chavePixValida } from '~~/shared/utils/pix'
import type { ParteDoContrato } from '~~/server/repositories/contract.repository'

/**
 * Ficha do contrato: as mesmas seções do assistente de criação (novo.vue),
 * numa página só — quem edita procura um campo, não percorre um fluxo.
 *
 * No topo, as PENDÊNCIAS: o que falta para cobrar e repassar. Campo que não
 * foi preenchido na criação não é erro (o Kenlo chegou ao mesmo lugar); é
 * pendência visível, e a cobrança não emite boleto enquanto houver uma que a
 * impede.
 */
definePageMeta({ layout: 'admin', middleware: ['admin', 'area-cliente'] })

const route = useRoute()
const toast = useToast()
const { askConfirm } = useConfirm()
const id = computed(() => String(route.params.id || ''))

const { data: clientes, refresh: refreshClientes } = useLazyAsyncData(
  'admin:portal-users-select',
  () => adminFetch<PortalUser[]>('/api/admin/portal-users'),
  { server: false, default: () => [] as PortalUser[] },
)

// ---- Estado ----
const carregando = ref(true)
const erroCarga = ref('')
const contrato = ref<Contract | null>(null)
const partes = ref<ParteDoContrato[]>([])
const repasseInformado = ref(false)

const form = reactive({
  code: '',
  addressLabel: '',
  propertyId: null as string | null,
  status: 'ativo' as 'ativo' | 'encerrado',
  startedOn: '' as string,
  termMonths: null as number | null,
  endsOn: '' as string,
  rentAmount: null as number | null,
  dueDay: null as number | null,
  adjustmentIndex: '',
  guaranteeType: null as GuaranteeType | null,
})
const internal = reactive({
  notes: '',
  adminFeePercent: null as number | null,
  externalId: '',
  guaranteeAmount: null as number | null,
  guaranteeDetails: '',
  fireInsurancePayer: null as FireInsurancePayer | null,
  finePercent: null as number | null,
  interestMonthlyPercent: null as number | null,
  rentFeePercent: null as number | null,
  payoutBusinessDays: null as number | null,
})
// `salvo` é ref, não `let`: o `computed` só recalcula quando uma dependência
// REATIVA muda. Com `let`, gravar o retrato depois de salvar não invalidava
// `alterado` — a barra ficava na tela e a saída seguia perguntando "Sair sem
// salvar?" sobre um contrato já salvo.
const salvo = ref('')
// `''` conta como `null`: `v-model.number` num campo apagado devolve `''`, e o
// banco devolve `null`. Sem isto, digitar e apagar um valor num campo que
// estava vazio acusava alteração sem haver nenhuma.
const retrato = () => JSON.stringify([form, internal], (_, v) => (v === '' ? null : v))
const alterado = computed(() => !carregando.value && retrato() !== salvo.value)

async function carregar() {
  carregando.value = true
  erroCarga.value = ''
  try {
    const r = await adminFetch<{
      contrato: Contract
      internal: ContractInternal | null
      partes: ParteDoContrato[]
      repasseInformado: boolean
    }>(`/api/admin/contracts/${id.value}`)
    contrato.value = r.contrato
    partes.value = r.partes
    repasseInformado.value = r.repasseInformado
    Object.assign(form, {
      code: r.contrato.code,
      addressLabel: r.contrato.addressLabel || '',
      propertyId: r.contrato.propertyId,
      status: r.contrato.status,
      startedOn: r.contrato.startedOn || '',
      termMonths: r.contrato.termMonths,
      endsOn: r.contrato.endsOn || '',
      rentAmount: r.contrato.rentAmount,
      dueDay: r.contrato.dueDay,
      adjustmentIndex: r.contrato.adjustmentIndex || '',
      guaranteeType: r.contrato.guaranteeType,
    })
    const i = r.internal
    Object.assign(internal, {
      notes: i?.notes || '',
      adminFeePercent: i?.adminFeePercent ?? null,
      externalId: i?.externalId || '',
      guaranteeAmount: i?.guaranteeAmount ?? null,
      guaranteeDetails: i?.guaranteeDetails || '',
      fireInsurancePayer: i?.fireInsurancePayer ?? null,
      finePercent: i?.finePercent ?? null,
      interestMonthlyPercent: i?.interestMonthlyPercent ?? null,
      rentFeePercent: i?.rentFeePercent ?? null,
      payoutBusinessDays: i?.payoutBusinessDays ?? null,
    })
    salvo.value = retrato()
    await carregarDocumentos()
  } catch {
    erroCarga.value = 'Não foi possível carregar este contrato.'
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

// O término acompanha o prazo; sem prazo, é a data digitada.
//
// Só quando QUEM EDITA muda início ou prazo, não quando `carregar` preenche o
// form: o watcher roda depois de o retrato de referência ser gravado, e um
// `endsOn` do banco que não bate com `fimDoPrazo` (contrato importado, ou
// gravado antes da regra da véspera) fazia a ficha abrir já "alterada" — com a
// barra de salvar à vista e a pergunta ao sair, sem a pessoa ter tocado em nada.
// Reescrever o término em silêncio só por abrir a tela também não é papel dela.
// `flush: 'sync'` é o que torna o `carregando` confiável aqui: no flush padrão
// o watcher roda depois, e só pegaria `carregando` ainda verdadeiro enquanto
// houvesse um `await` entre o `Object.assign` e o `finally` de `carregar`.
watch(
  () => [form.startedOn, form.termMonths] as const,
  ([inicio, meses]) => {
    if (carregando.value) return
    if (inicio && meses) form.endsOn = fimDoPrazo(inicio, meses) ?? form.endsOn
  },
  { flush: 'sync' },
)

const pendencias = computed(() =>
  pendenciasDoContrato({
    rentAmount: form.rentAmount,
    dueDay: form.dueDay,
    guaranteeType: form.guaranteeType,
    finePercent: internal.finePercent,
    interestMonthlyPercent: internal.interestMonthlyPercent,
    adminFeePercent: internal.adminFeePercent,
    inquilinos: partes.value.filter((p) => p.role === 'inquilino').map((p) => ({ doc: p.doc })),
    proprietarios: partes.value.filter((p) => p.role === 'proprietario').map(() => ({ temDestinoDeRepasse: repasseInformado.value })),
  }),
)

// ---- Salvar ----
const salvando = ref(false)
const erroSalvar = ref('')
async function salvar() {
  erroSalvar.value = ''
  if (form.guaranteeType === 'caucao' && form.rentAmount && (internal.guaranteeAmount ?? 0) > form.rentAmount * MAX_CAUCAO_ALUGUEIS) {
    erroSalvar.value = `Caução até ${MAX_CAUCAO_ALUGUEIS} aluguéis (Lei 8.245, art. 38).`
    return
  }
  // Trocar a garantia com fiador vinculado tira o fiador do contrato (uma
  // garantia só, art. 37). É a pessoa perdendo acesso aos documentos: pergunta.
  const fiadores = form.guaranteeType && form.guaranteeType !== 'fiador' ? partes.value.filter((p) => p.role === 'fiador') : []
  if (fiadores.length) {
    const nomes = fiadores.map((p) => p.nome).join(', ')
    const ok = await askConfirm({
      title: `Remover ${nomes} do contrato?`,
      description: `A garantia passa a ser ${GUARANTEE_LABELS[form.guaranteeType!]}, e a lei permite uma só (art. 37). ${nomes} deixa de ser fiador e perde o acesso aos documentos deste contrato. O cadastro continua.`,
      confirmLabel: 'Trocar e remover o fiador',
      danger: true,
    })
    if (!ok) return
  }
  salvando.value = true
  try {
    const body: ContractInput & { internal: ContractInternalInput; removerFiador: boolean } = {
      code: form.code,
      addressLabel: form.addressLabel || null,
      propertyId: form.propertyId,
      status: form.status,
      startedOn: form.startedOn || null,
      endsOn: form.endsOn || null,
      rentAmount: form.rentAmount,
      dueDay: form.dueDay,
      adjustmentIndex: form.adjustmentIndex || null,
      termMonths: form.termMonths,
      guaranteeType: form.guaranteeType,
      removerFiador: fiadores.length > 0,
      internal: {
        ...internal,
        guaranteeAmount: form.guaranteeType === 'caucao' ? internal.guaranteeAmount : null,
        guaranteeDetails: internal.guaranteeDetails || null,
        notes: internal.notes || null,
        externalId: internal.externalId || null,
      },
    }
    const c = await adminFetch<Contract>(`/api/admin/contracts/${id.value}`, { method: 'PUT', body })
    contrato.value = c
    if (fiadores.length) {
      partes.value = partes.value.filter((p) => p.role !== 'fiador')
    }
    salvo.value = retrato()
    toast.success(fiadores.length ? 'Contrato salvo. O fiador saiu do contrato.' : 'Contrato salvo.')
  } catch (e: unknown) {
    erroSalvar.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível salvar.'
  } finally {
    salvando.value = false
  }
}
useUnsavedGuard(() => alterado.value)

async function alternarSituacao() {
  const encerrando = form.status === 'ativo'
  if (encerrando) {
    const ok = await askConfirm({
      title: `Encerrar o contrato ${form.code}?`,
      description: 'Ele sai da lista de ativos e para de gerar cobrança. As partes continuam vendo o histórico e os documentos na Área do Cliente.',
      confirmLabel: 'Encerrar',
      danger: true,
    })
    if (!ok) return
  }
  form.status = encerrando ? 'encerrado' : 'ativo'
  await salvar()
}

// ---- Pessoas ----
const adicionando = ref(false)
const novaParte = reactive<{ role: ContractPartyRole; pessoa: PessoaDoContrato | null }>({ role: 'inquilino', pessoa: null })
const vinculando = ref(false)
async function vincular() {
  if (!novaParte.pessoa) return toast.error('Escolha ou cadastre a pessoa.')
  vinculando.value = true
  try {
    let portalUserId: string
    if ('id' in novaParte.pessoa) portalUserId = novaParte.pessoa.id
    else {
      const r = await adminFetch<{ cliente: PortalUser }>('/api/admin/portal-users', {
        method: 'POST',
        body: { ...novaParte.pessoa.nova, convidar: false },
      })
      portalUserId = r.cliente.id
      await refreshClientes()
    }
    await adminFetch(`/api/admin/contracts/${id.value}/partes`, { method: 'POST', body: { portalUserId, role: novaParte.role } })
    Object.assign(novaParte, { pessoa: null })
    adicionando.value = false
    await carregar()
    toast.success('Pessoa vinculada.')
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível vincular.')
  } finally {
    vinculando.value = false
  }
}
async function desvincular(p: ParteDoContrato) {
  const ok = await askConfirm({
    title: 'Remover do contrato?',
    description: `${p.nome} deixa de ver os documentos deste contrato. O cadastro continua, e os outros contratos não mudam.`,
    confirmLabel: 'Remover',
    danger: true,
  })
  if (!ok) return
  try {
    await adminFetch(`/api/admin/contracts/${id.value}/partes/${p.id}`, { method: 'DELETE' })
    await carregar()
    toast.success('Pessoa removida do contrato.')
  } catch {
    toast.error('Não foi possível remover.')
  }
}

// ---- Repasse ----
const editandoRepasse = ref(false)
const rep = reactive({
  tipo: 'pix' as 'pix' | 'conta_bancaria',
  pixKeyType: 'cpf' as 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria',
  pixKey: '',
  bankCode: '',
  branch: '',
  account: '',
  accountDigit: '',
  accountType: 'corrente' as 'corrente' | 'poupanca' | 'pagamento',
  holderName: '',
  holderDoc: '',
})
const dono = computed(() => partes.value.find((p) => p.role === 'proprietario') ?? null)
function abrirRepasse() {
  editandoRepasse.value = true
  rep.holderName = dono.value?.nome ?? ''
  rep.holderDoc = formatarDocumento(dono.value?.doc)
}
const salvandoRepasse = ref(false)
async function salvarRepasse() {
  if (!rep.holderName.trim() || !tipoDeDocumento(rep.holderDoc)) return toast.error('Informe o titular e um CPF/CNPJ válido.')
  if (rep.tipo === 'pix' && !chavePixValida(rep.pixKeyType, rep.pixKey)) {
    return toast.error(`A chave Pix não é um ${ROTULO_CHAVE_PIX[rep.pixKeyType]} válido.`)
  }
  salvandoRepasse.value = true
  try {
    const titular = { holderName: rep.holderName.trim(), holderDoc: rep.holderDoc.replace(/\D/g, '') }
    await adminFetch(`/api/admin/contracts/${id.value}/repasse`, {
      method: 'PUT',
      body:
        rep.tipo === 'pix'
          ? { kind: 'pix', pixKeyType: rep.pixKeyType, pixKey: rep.pixKey.trim(), ...titular }
          : {
              kind: 'conta_bancaria',
              bankCode: rep.bankCode,
              branch: rep.branch.replace(/\D/g, ''),
              account: rep.account.replace(/\D/g, ''),
              accountDigit: rep.accountDigit || null,
              accountType: rep.accountType,
              ...titular,
            },
    })
    repasseInformado.value = true
    editandoRepasse.value = false
    toast.success('Destino do repasse salvo.')
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível salvar o repasse.')
  } finally {
    salvandoRepasse.value = false
  }
}

// ---- Documentos ----
const documentos = ref<PortalDocument[]>([])
const enviandoDoc = ref(false)
const mostrandoEnvio = ref(false)
const arquivo = ref<File | null>(null)
const doc = reactive<{ category: PortalDocCategory; title: string; competence: string; dueOn: string; amount: number | null }>({
  category: 'contrato',
  title: '',
  competence: '',
  dueOn: '',
  amount: null,
})
/**
 * Quem vai ver, derivado da categoria — a mesma função que o servidor usa como
 * default. Aparece ANTES de enviar: classificar errado é o que entrega o
 * extrato do proprietário ao inquilino.
 */
const quemVe = computed(() => describeAudience(defaultAudienceFor(doc.category)))
async function carregarDocumentos() {
  documentos.value = await adminFetch<PortalDocument[]>(`/api/admin/contracts/${id.value}/documentos`)
}
function escolherArquivo(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  // Aviso cedo, para a pessoa não preencher o resto à toa. Quem decide é o
  // servidor, pelo conteúdo: `type` aqui vem só da extensão do nome.
  if (f && !(f.type in FORMATOS_DE_DOCUMENTO)) {
    toast.error(`Formato não aceito. Envie ${Object.values(FORMATOS_DE_DOCUMENTO).join(', ')}.`)
    input.value = ''
    arquivo.value = null
    return
  }
  if (f && f.size > TAMANHO_MAX_DOCUMENTO) {
    toast.error(`Arquivo grande demais (máximo ${TAMANHO_MAX_DOCUMENTO / 1024 / 1024} MB).`)
    input.value = ''
    arquivo.value = null
    return
  }
  arquivo.value = f
  if (arquivo.value && !doc.title.trim()) doc.title = arquivo.value.name.replace(/\.[^.]+$/, '')
}
async function enviarDocumento() {
  if (!arquivo.value) return toast.error('Escolha o arquivo.')
  const slug = useTenant().value?.slug
  if (!slug) return toast.error('Não foi possível identificar a imobiliária. Recarregue a página.')
  enviandoDoc.value = true
  try {
    const client = await getAdminSupabase()
    // `<slug>/<contract_id>/<uuid>`: o slug é o que as policies de storage da
    // 0028 autorizam; o uuid evita colisão sem consultar o bucket.
    const ext = arquivo.value.name.split('.').pop() || 'pdf'
    const caminho = `${slug}/${id.value}/${crypto.randomUUID()}.${ext}`
    const { error: erroUpload } = await client.storage
      .from('portal-docs')
      .upload(caminho, arquivo.value, { upsert: false, contentType: arquivo.value.type })
    if (erroUpload) throw erroUpload
    await adminFetch('/api/admin/portal-documents', {
      method: 'POST',
      body: {
        contractId: id.value,
        category: doc.category,
        title: doc.title.trim(),
        competence: doc.competence ? `${doc.competence}-01` : null,
        dueOn: doc.dueOn || null,
        amount: doc.amount,
        storagePath: caminho,
        mime: arquivo.value.type || null,
        sizeBytes: arquivo.value.size,
      },
    })
    Object.assign(doc, { title: '', competence: '', dueOn: '', amount: null })
    arquivo.value = null
    mostrandoEnvio.value = false
    await carregarDocumentos()
    toast.success('Documento enviado como rascunho. Publique para o cliente ver.')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    toast.error(err?.data?.statusMessage || err?.message || 'Não foi possível enviar.')
  } finally {
    enviandoDoc.value = false
  }
}
/**
 * Abre em outra aba. A aba nasce ANTES do `await`: aberta depois da resposta,
 * o Safari e o Chrome no celular tratam como pop-up e bloqueiam.
 */
async function abrirDocumento(d: PortalDocument, baixar = false) {
  const aba = baixar ? null : window.open('', '_blank')
  try {
    const { url } = await adminFetch<{ url: string }>(`/api/admin/portal-documents/${d.id}/abrir${baixar ? '?baixar=1' : ''}`, { method: 'POST' })
    if (aba) aba.location.href = url
    else location.href = url
  } catch (e: unknown) {
    aba?.close()
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível abrir o documento.')
  }
}
async function alternarPublicacao(d: PortalDocument) {
  try {
    await adminFetch(`/api/admin/portal-documents/${d.id}`, { method: 'PATCH', body: { published: !d.publishedAt } })
    await carregarDocumentos()
    toast.success(d.publishedAt ? 'Documento despublicado.' : 'Documento publicado.')
  } catch {
    toast.error('Não foi possível alterar.')
  }
}
async function apagarDocumento(d: PortalDocument) {
  const ok = await askConfirm({
    title: 'Apagar documento?',
    description: `"${d.title}" some da Área do Cliente, junto com o registro de quem já baixou. Não dá para desfazer.`,
    confirmLabel: 'Apagar',
    danger: true,
  })
  if (!ok) return
  try {
    await adminFetch(`/api/admin/portal-documents/${d.id}`, { method: 'DELETE' })
    await carregarDocumentos()
    toast.success('Documento apagado.')
  } catch {
    toast.error('Não foi possível apagar.')
  }
}

// ---- Formatação ----
const brl = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dataBR = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '')
const indices = computed(() =>
  form.adjustmentIndex && !(ADJUSTMENT_INDICES as readonly string[]).includes(form.adjustmentIndex)
    ? [...ADJUSTMENT_INDICES, form.adjustmentIndex]
    : [...ADJUSTMENT_INDICES],
)
const recebeProprietario = computed(() =>
  form.rentAmount != null && internal.adminFeePercent != null ? form.rentAmount * (1 - internal.adminFeePercent / 100) : null,
)
const idsNoContrato = computed(() => partes.value.filter((p) => p.role === novaParte.role).map((p) => p.portalUserId))

useHead({ title: computed(() => (form.code ? `${form.code} · Contrato` : 'Contrato · Painel')) })
</script>

<template>
  <div class="ficha">
    <NuxtLink to="/admin/contratos" class="voltar">← Contratos</NuxtLink>

    <p v-if="carregando && !contrato" class="dica">Carregando…</p>
    <div v-else-if="erroCarga" class="admin-card" role="alert">
      <p>{{ erroCarga }}</p>
      <button class="admin-btn" type="button" @click="carregar">Tentar de novo</button>
    </div>

    <template v-else-if="contrato">
      <header class="topo">
        <div>
          <h1 class="admin-h1">{{ form.code }} <span class="situacao" :class="`s-${form.status}`">{{ form.status === 'ativo' ? 'Ativo' : 'Encerrado' }}</span></h1>
          <p class="admin-sub">
            {{ form.addressLabel || 'Sem endereço' }}
            <template v-if="form.rentAmount"> · {{ brl(form.rentAmount) }} todo dia {{ form.dueDay }}</template>
            <template v-if="form.startedOn"> · {{ dataBR(form.startedOn) }} a {{ dataBR(form.endsOn) || '?' }}</template>
          </p>
        </div>
        <button type="button" class="admin-btn sm" :class="form.status === 'ativo' ? 'danger-ghost' : 'ghost'" @click="alternarSituacao">
          {{ form.status === 'ativo' ? 'Encerrar contrato' : 'Reativar contrato' }}
        </button>
      </header>

      <!-- Encerrado não gera cobrança nem repasse: "falta para cobrar" ali é
           uma lista de tarefas que ninguém deve fazer. -->
      <section v-if="form.status === 'ativo' && pendencias.length" class="pendencias" aria-labelledby="pend-t">
        <h2 id="pend-t"><AppIcon name="alert" /> Falta para cobrar e repassar</h2>
        <ul>
          <li v-for="p in pendencias" :key="p.codigo">
            {{ p.texto }}
            <span v-if="p.bloqueiaCobranca" class="impede">impede o boleto</span>
          </li>
        </ul>
      </section>
      <p v-else-if="form.status === 'ativo'" class="tudo-certo"><AppIcon name="check" /> Contrato completo: pronto para cobrança e repasse.</p>

      <!-- Cobranças: o que se faz todo mês, por isso logo abaixo das pendências. -->
      <AdminContratoCobrancas :contract-id="contrato.id" :rent-amount="contrato.rentAmount" :due-day="contrato.dueDay" :started-on="contrato.startedOn" :ends-on="contrato.endsOn" :ativo="form.status === 'ativo'" />

      <!-- Pessoas -->
      <section class="admin-card secao">
        <div class="secao-topo">
          <h2 class="admin-h2">Pessoas</h2>
          <button v-if="!adicionando" type="button" class="admin-btn ghost sm" @click="adicionando = true"><AppIcon name="plus" /> Adicionar</button>
        </div>
        <ul v-if="partes.length" class="pessoas">
          <li v-for="p in partes" :key="p.id">
            <span class="papel">{{ CONTRACT_PARTY_LABELS[p.role] }}</span>
            <div class="pessoa">
              <NuxtLink to="/admin/clientes" class="pessoa-nome">{{ p.nome }}</NuxtLink>
              <small>
                {{ [p.telefone && formatWhatsapp(p.telefone), p.doc ? formatarDocumento(p.doc) : 'sem CPF/CNPJ', p.temAcesso ? 'acessa o portal' : 'sem acesso ao portal'].filter(Boolean).join(' · ') }}
              </small>
            </div>
            <button type="button" class="admin-btn danger-ghost sm" @click="desvincular(p)">Remover</button>
          </li>
        </ul>
        <p v-else class="dica">Ninguém vinculado ainda.</p>

        <div v-if="adicionando" class="adicionar">
          <div class="chips" role="radiogroup" aria-label="Papel no contrato">
            <button v-for="r in CONTRACT_PARTY_ROLES" :key="r" type="button" role="radio" :aria-checked="novaParte.role === r" :class="{ on: novaParte.role === r }" @click="novaParte.role = r">
              {{ CONTRACT_PARTY_LABELS[r] }}
            </button>
          </div>
          <AdminPessoaPicker v-model="novaParte.pessoa" :clientes="clientes" :rotulo="`Quem é o ${CONTRACT_PARTY_LABELS[novaParte.role]}`" :documento-importante="novaParte.role !== 'proprietario'" :excluir-ids="idsNoContrato" />
          <div class="linha-acoes">
            <button type="button" class="admin-btn sm" :disabled="vinculando || !novaParte.pessoa" @click="vincular">{{ vinculando ? 'Vinculando…' : 'Vincular ao contrato' }}</button>
            <button type="button" class="admin-btn ghost sm" @click="adicionando = false; novaParte.pessoa = null">Cancelar</button>
          </div>
        </div>
      </section>

      <!-- Valores e prazo -->
      <section class="admin-card secao">
        <h2 class="admin-h2">Valores e prazo</h2>
        <div class="grade">
          <div>
            <label class="admin-label" for="code">Código</label>
            <input id="code" v-model="form.code" class="admin-input" />
          </div>
          <div class="span2">
            <label class="admin-label" for="end">Endereço</label>
            <input id="end" v-model="form.addressLabel" class="admin-input" />
          </div>
          <div>
            <label class="admin-label" for="alug">Aluguel mensal</label>
            <div class="prefixo"><span>R$</span><input id="alug" v-model.number="form.rentAmount" class="admin-input" type="number" min="0" step="0.01" /></div>
          </div>
          <div>
            <label class="admin-label" for="dia">Dia do vencimento</label>
            <input id="dia" v-model.number="form.dueDay" class="admin-input" type="number" min="1" max="31" />
          </div>
          <div>
            <label class="admin-label" for="ini">Início</label>
            <input id="ini" v-model="form.startedOn" class="admin-input" type="date" />
          </div>
          <div>
            <label class="admin-label" for="prazo">Prazo</label>
            <div class="sufixo"><input id="prazo" v-model.number="form.termMonths" class="admin-input" type="number" min="1" max="600" /><span>meses</span></div>
          </div>
          <div>
            <label class="admin-label" for="fim">Término</label>
            <input id="fim" v-model="form.endsOn" class="admin-input" type="date" :readonly="!!form.termMonths" />
            <p v-if="form.termMonths" class="ajuda">Calculado pelo prazo.</p>
          </div>
          <div>
            <label class="admin-label" for="ind">Reajuste anual</label>
            <select id="ind" v-model="form.adjustmentIndex" class="admin-input">
              <option value="">Não definido</option>
              <option v-for="i in indices" :key="i" :value="i">{{ i }}</option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="mul">Multa por atraso</label>
            <div class="sufixo"><input id="mul" v-model.number="internal.finePercent" class="admin-input" type="number" min="0" :max="MAX_FINE_PERCENT" step="0.5" /><span>%</span></div>
          </div>
          <div>
            <label class="admin-label" for="jur">Juros de mora</label>
            <div class="sufixo"><input id="jur" v-model.number="internal.interestMonthlyPercent" class="admin-input" type="number" min="0" :max="MAX_INTEREST_MONTHLY_PERCENT" step="0.1" /><span>% a.m.</span></div>
          </div>
        </div>
      </section>

      <!-- Garantia e seguro -->
      <section class="admin-card secao">
        <h2 class="admin-h2">Garantia e seguro</h2>
        <div class="grade">
          <div>
            <label class="admin-label" for="gar">Garantia (uma só, pela Lei 8.245, art. 37)</label>
            <select id="gar" v-model="form.guaranteeType" class="admin-input">
              <option :value="null">Não informada</option>
              <option v-for="g in GUARANTEE_TYPES" :key="g" :value="g">{{ GUARANTEE_LABELS[g] }}</option>
            </select>
          </div>
          <div v-if="form.guaranteeType === 'caucao'">
            <label class="admin-label" for="cau">Valor da caução</label>
            <div class="prefixo"><span>R$</span><input id="cau" v-model.number="internal.guaranteeAmount" class="admin-input" type="number" min="0" step="0.01" /></div>
            <p v-if="form.rentAmount" class="ajuda">Máximo {{ brl(form.rentAmount * MAX_CAUCAO_ALUGUEIS) }}.</p>
          </div>
          <div v-if="form.guaranteeType && form.guaranteeType !== 'nenhuma'" class="span2">
            <label class="admin-label" for="gdet">Detalhes</label>
            <input id="gdet" v-model="internal.guaranteeDetails" class="admin-input" maxlength="1000" :placeholder="form.guaranteeType === 'fiador' ? 'O fiador fica em Pessoas' : 'Seguradora, apólice, validade'" />
          </div>
          <div>
            <label class="admin-label" for="seg">Seguro contra incêndio</label>
            <select id="seg" v-model="internal.fireInsurancePayer" class="admin-input">
              <option :value="null">Não informado</option>
              <option v-for="(rot, v) in FIRE_INSURANCE_LABELS" :key="v" :value="v">{{ rot }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Administração e repasse -->
      <section class="admin-card secao">
        <h2 class="admin-h2">Administração e repasse</h2>
        <p class="admin-sub-secao">Uso interno: nada daqui aparece para o cliente.</p>
        <div class="grade">
          <div>
            <label class="admin-label" for="tadm">Taxa de administração</label>
            <div class="sufixo"><input id="tadm" v-model.number="internal.adminFeePercent" class="admin-input" type="number" min="0" max="100" step="0.5" /><span>%</span></div>
            <p v-if="recebeProprietario != null" class="ajuda">Proprietário recebe {{ brl(recebeProprietario) }} por mês.</p>
          </div>
          <div>
            <label class="admin-label" for="tloc">Taxa de locação</label>
            <div class="sufixo"><input id="tloc" v-model.number="internal.rentFeePercent" class="admin-input" type="number" min="0" max="100" step="5" /><span>%</span></div>
            <p class="ajuda">Do 1º aluguel, uma vez só.</p>
          </div>
          <div>
            <label class="admin-label" for="dias">Repasse em</label>
            <div class="sufixo"><input id="dias" v-model.number="internal.payoutBusinessDays" class="admin-input" type="number" min="0" max="30" /><span>dias úteis</span></div>
          </div>
        </div>

        <div class="repasse">
          <template v-if="!dono">
            <p class="dica">Vincule o proprietário em Pessoas para informar o destino do repasse.</p>
          </template>
          <template v-else-if="!editandoRepasse">
            <p class="repasse-estado" :class="{ ok: repasseInformado }">
              <AppIcon :name="repasseInformado ? 'check' : 'alert'" />
              {{ repasseInformado ? `Pix ou conta de ${dono.nome} cadastrado.` : `Falta o Pix ou a conta de ${dono.nome}.` }}
            </p>
            <button type="button" class="admin-btn ghost sm" @click="abrirRepasse">{{ repasseInformado ? 'Trocar destino' : 'Informar destino' }}</button>
          </template>
          <form v-else class="repasse-form" @submit.prevent="salvarRepasse">
            <div class="chips" role="radiogroup" aria-label="Forma do repasse">
              <button type="button" role="radio" :aria-checked="rep.tipo === 'pix'" :class="{ on: rep.tipo === 'pix' }" @click="rep.tipo = 'pix'">Pix</button>
              <button type="button" role="radio" :aria-checked="rep.tipo === 'conta_bancaria'" :class="{ on: rep.tipo === 'conta_bancaria' }" @click="rep.tipo = 'conta_bancaria'">Conta bancária</button>
            </div>
            <div class="grade">
              <template v-if="rep.tipo === 'pix'">
                <div>
                  <label class="admin-label" for="r-pt">Tipo de chave</label>
                  <select id="r-pt" v-model="rep.pixKeyType" class="admin-input">
                    <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Chave aleatória</option>
                  </select>
                </div>
                <div class="span2"><label class="admin-label" for="r-pk">Chave Pix</label><input id="r-pk" v-model="rep.pixKey" class="admin-input" autocomplete="off" :placeholder="EXEMPLO_CHAVE_PIX[rep.pixKeyType]" /></div>
              </template>
              <template v-else>
                <div><label class="admin-label" for="r-b">Banco (código)</label><input id="r-b" v-model="rep.bankCode" class="admin-input" maxlength="3" inputmode="numeric" placeholder="001, 237…" /></div>
                <div><label class="admin-label" for="r-ag">Agência</label><input id="r-ag" v-model="rep.branch" class="admin-input" inputmode="numeric" /></div>
                <div><label class="admin-label" for="r-cc">Conta e dígito</label><div class="conta"><input id="r-cc" v-model="rep.account" class="admin-input" inputmode="numeric" /><input v-model="rep.accountDigit" class="admin-input dv" maxlength="2" aria-label="Dígito" /></div></div>
                <div>
                  <label class="admin-label" for="r-ct">Tipo</label>
                  <select id="r-ct" v-model="rep.accountType" class="admin-input"><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pagamento">Pagamento</option></select>
                </div>
              </template>
              <div><label class="admin-label" for="r-t">Titular</label><input id="r-t" v-model="rep.holderName" class="admin-input" /></div>
              <div><label class="admin-label" for="r-td">CPF/CNPJ do titular</label><input id="r-td" v-model="rep.holderDoc" class="admin-input" inputmode="numeric" @blur="rep.holderDoc = formatarDocumento(rep.holderDoc)" /></div>
            </div>
            <div class="linha-acoes">
              <button type="submit" class="admin-btn sm" :disabled="salvandoRepasse">{{ salvandoRepasse ? 'Salvando…' : 'Salvar destino' }}</button>
              <button type="button" class="admin-btn ghost sm" @click="editandoRepasse = false">Cancelar</button>
            </div>
            <p class="ajuda">O destino anterior fica guardado: repasses já feitos continuam apontando para a conta que usaram.</p>
          </form>
        </div>

        <details class="mais">
          <summary>Anotações e integração</summary>
          <div class="grade">
            <div class="span2"><label class="admin-label" for="notas">Anotações da imobiliária</label><textarea id="notas" v-model="internal.notes" class="admin-textarea" rows="3" /></div>
            <div><label class="admin-label" for="erp">ID no ERP</label><input id="erp" v-model="internal.externalId" class="admin-input" /></div>
          </div>
        </details>
      </section>

      <!-- Documentos -->
      <section class="admin-card secao">
        <div class="secao-topo">
          <h2 class="admin-h2">Documentos na Área do Cliente</h2>
          <button v-if="!mostrandoEnvio" type="button" class="admin-btn ghost sm" @click="mostrandoEnvio = true"><AppIcon name="plus" /> Enviar documento</button>
        </div>
        <ul v-if="documentos.length" class="docs">
          <li v-for="d in documentos" :key="d.id">
            <div class="pessoa">
              <b>{{ d.title }}</b>
              <small>{{ PORTAL_DOC_LABELS[d.category] }} · {{ describeAudience(d.audience) }}<template v-if="!d.publishedAt"> · <span class="rascunho">rascunho</span></template></small>
            </div>
            <div class="linha-acoes">
              <button class="admin-btn ghost sm" type="button" @click="abrirDocumento(d)">Abrir</button>
              <button class="admin-btn ghost sm" type="button" @click="abrirDocumento(d, true)">Baixar</button>
              <button class="admin-btn ghost sm" type="button" @click="alternarPublicacao(d)">{{ d.publishedAt ? 'Despublicar' : 'Publicar' }}</button>
              <button class="admin-btn danger-ghost sm" type="button" @click="apagarDocumento(d)">Apagar</button>
            </div>
          </li>
        </ul>
        <p v-else-if="!mostrandoEnvio" class="dica">Nenhum documento ainda. Tudo entra como rascunho e só aparece para o cliente depois de publicado.</p>

        <div v-if="mostrandoEnvio" class="envio">
          <div class="grade">
            <div class="span2"><label class="admin-label" for="arq">Arquivo ({{ Object.values(FORMATOS_DE_DOCUMENTO).join(', ') }}, até {{ TAMANHO_MAX_DOCUMENTO / 1024 / 1024 }} MB)</label><input id="arq" class="admin-input" type="file" :accept="ACCEPT_DE_DOCUMENTO" @change="escolherArquivo" /></div>
            <div>
              <label class="admin-label" for="cat">Tipo</label>
              <select id="cat" v-model="doc.category" class="admin-input"><option v-for="c in PORTAL_DOC_CATEGORIES" :key="c" :value="c">{{ PORTAL_DOC_LABELS[c] }}</option></select>
            </div>
            <div><label class="admin-label" for="dtit">Título</label><input id="dtit" v-model="doc.title" class="admin-input" /></div>
            <template v-if="['boleto', 'recibo', 'extrato'].includes(doc.category)">
              <div><label class="admin-label" for="comp">Mês de referência</label><input id="comp" v-model="doc.competence" class="admin-input" type="month" /></div>
              <div><label class="admin-label" for="dven">Vencimento</label><input id="dven" v-model="doc.dueOn" class="admin-input" type="date" /></div>
              <div><label class="admin-label" for="dval">Valor</label><div class="prefixo"><span>R$</span><input id="dval" v-model.number="doc.amount" class="admin-input" type="number" step="0.01" min="0" /></div></div>
            </template>
          </div>
          <p class="regra"><b>{{ quemVe }}.</b> {{ PORTAL_DOC_HINTS[doc.category] }}</p>
          <div class="linha-acoes">
            <button class="admin-btn sm" type="button" :disabled="enviandoDoc" @click="enviarDocumento">{{ enviandoDoc ? 'Enviando…' : 'Enviar como rascunho' }}</button>
            <button class="admin-btn ghost sm" type="button" @click="mostrandoEnvio = false">Cancelar</button>
          </div>
        </div>
      </section>

      <!-- Barra de salvar: aparece só com alteração, e fica à vista. -->
      <Transition name="barra">
        <div v-if="alterado || erroSalvar" class="barra-salvar" role="region" aria-label="Alterações não salvas">
          <p v-if="erroSalvar" class="erro" role="alert">{{ erroSalvar }}</p>
          <p v-else>Alterações não salvas.</p>
          <button type="button" class="admin-btn" :disabled="salvando" @click="salvar">{{ salvando ? 'Salvando…' : 'Salvar alterações' }}</button>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.ficha {
  padding-bottom: 90px;
}
.voltar {
  display: inline-block;
  margin-bottom: 8px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  text-decoration: none;
}
.dica {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin: 0;
}
.topo {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.topo .admin-h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.situacao {
  font-family: var(--font-body);
  font-size: var(--fs-caption);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--r-pill);
  letter-spacing: 0;
}
.s-ativo {
  background: #e8f4ec;
  color: #17683a;
}
.s-encerrado {
  background: var(--surface);
  color: var(--ink-soft);
}
.pendencias {
  margin-bottom: 16px;
  padding: 14px 18px;
  border-radius: var(--r-md);
  background: #fff8e6;
  border: 1px solid #f1d38a;
}
.pendencias h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: var(--fs-ui);
  color: #6b4700;
}
.pendencias h2 :deep(svg) {
  width: 18px;
  height: 18px;
}
.pendencias ul {
  margin: 0;
  padding-left: 22px;
  display: grid;
  gap: 4px;
  font-size: var(--fs-ui);
  color: #4a3500;
}
.impede {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: var(--r-pill);
  background: #fbe3e1;
  color: #9f2d2d;
  font-size: var(--fs-caption);
  font-weight: 700;
}
.tudo-certo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font-size: var(--fs-ui);
  font-weight: 600;
  color: #17683a;
}
.tudo-certo :deep(svg),
.repasse-estado :deep(svg) {
  width: 18px;
  height: 18px;
}
.secao {
  margin-bottom: 16px;
}
.secao > .admin-h2:has(+ .admin-sub-secao) {
  margin-bottom: 4px;
}
.secao-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.secao-topo .admin-h2 {
  margin: 0;
}
.admin-sub-secao {
  margin: 0 0 14px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.span2 {
  grid-column: span 2;
}
.ajuda {
  margin: 5px 0 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.pessoas,
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pessoas li,
.docs li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.pessoas li:first-child,
.docs li:first-child {
  border-top: none;
  padding-top: 2px;
}
.papel {
  flex: none;
  width: 96px;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--brand);
  text-transform: capitalize;
}
.pessoa {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pessoa-nome {
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}
.pessoa-nome:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pessoa small {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.rascunho {
  color: #8a5a00;
  font-weight: 600;
}
.adicionar,
.envio {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.linha-acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips button {
  padding: 7px 13px;
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--paper);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  text-transform: capitalize;
}
.chips button.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
  color: var(--brand);
}
.chips button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
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
.conta {
  display: flex;
  gap: 6px;
}
.conta .dv {
  width: 56px;
  flex: none;
}
.repasse {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.repasse-estado {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--fs-ui);
  font-weight: 600;
  color: #8a5a00;
}
.repasse-estado.ok {
  color: #17683a;
}
.repasse-form {
  flex: 1;
  display: grid;
  gap: 12px;
}
.mais {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.mais summary {
  cursor: pointer;
  font-size: var(--fs-label);
  font-weight: 700;
  color: var(--ink-soft);
  margin-bottom: 12px;
}
.regra {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--paper);
  font-size: var(--fs-label);
}
.barra-salvar {
  position: fixed;
  z-index: 50;
  left: 50%;
  bottom: calc(16px + var(--admin-bottom-nav, 0px));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  width: min(640px, calc(100vw - 32px));
  padding: 12px 12px 12px 18px;
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  box-shadow: var(--shadow-lg);
}
.barra-salvar p {
  flex: 1;
  margin: 0;
  font-size: var(--fs-ui);
}
.barra-salvar .erro {
  color: #fecaca;
}
.barra-salvar .admin-btn {
  background: #fff;
  color: var(--ink);
}
.barra-enter-active,
.barra-leave-active {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out;
}
.barra-enter-from,
.barra-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
@media (prefers-reduced-motion: reduce) {
  .barra-enter-active,
  .barra-leave-active {
    transition: none;
  }
}
@media (max-width: 560px) {
  .span2 {
    grid-column: auto;
  }
  .papel {
    width: 100%;
  }
}
</style>
