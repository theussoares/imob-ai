<script setup lang="ts">
import type {
  Contract,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
  PortalUser,
} from '~~/shared/models/portal'
import type { PortalDocCategory, PortalDocument } from '~~/shared/models/portal'
import {
  CONTRACT_PARTY_LABELS,
  CONTRACT_PARTY_ROLES,
  PORTAL_DOC_CATEGORIES,
  PORTAL_DOC_HINTS,
  PORTAL_DOC_LABELS,
} from '~~/shared/models/portal'
import { defaultAudienceFor, describeAudience } from '~~/shared/utils/portal-access'
import type { ParteDoContrato } from '~~/server/repositories/contract.repository'

definePageMeta({ layout: 'admin', middleware: ['admin', 'area-cliente'] })

const route = useRoute()
const toast = useToast()
const { askConfirm } = useConfirm()

/** `novo` é rota de criação, não um id. */
const id = computed(() => String(route.params.id || ''))
const criando = computed(() => id.value === 'novo')

const vazio = (): ContractInput => ({
  code: '',
  addressLabel: '',
  propertyId: null,
  status: 'ativo',
  startedOn: null,
  endsOn: null,
  rentAmount: null,
  dueDay: null,
  adjustmentIndex: '',
})

const form = reactive<ContractInput>(vazio())
const internal = reactive<ContractInternalInput>({ notes: '', adminFeePercent: null, externalId: '' })
const partes = ref<ParteDoContrato[]>([])
const carregando = ref(!criando.value)
const salvando = ref(false)
const error = ref('')

// Clientes do portal, para vincular como parte. Carregado junto porque a tela
// sem eles mostraria um select vazio sem explicação.
const { data: clientes } = useLazyAsyncData(
  'admin:portal-users-select',
  () => adminFetch<PortalUser[]>('/api/admin/portal-users'),
  { server: false, default: () => [] as PortalUser[] },
)

const novaParte = reactive<{ portalUserId: string; role: ContractPartyRole }>({
  portalUserId: '',
  role: 'inquilino',
})

// --- documentos ---
const documentos = ref<PortalDocument[]>([])
const enviando = ref(false)
const arquivo = ref<File | null>(null)
const doc = reactive<{
  category: PortalDocCategory
  title: string
  competence: string
  dueOn: string
  amount: number | null
}>({ category: 'contrato', title: '', competence: '', dueOn: '', amount: null })

/**
 * Quem vai ver, derivado da categoria escolhida — a mesma função que o servidor
 * usa como default. A frase aparece ANTES de enviar porque é no momento da
 * escolha que a consequência importa: classificar errado é o que entrega o
 * extrato do proprietário ao inquilino.
 */
const quemVe = computed(() => describeAudience(defaultAudienceFor(doc.category)))

async function carregarDocumentos() {
  documentos.value = await adminFetch<PortalDocument[]>(
    `/api/admin/contracts/${id.value}/documentos`,
  )
}

function escolherArquivo(e: Event) {
  arquivo.value = (e.target as HTMLInputElement).files?.[0] ?? null
  // Título em branco ganha o nome do arquivo: é o que a pessoa ia digitar.
  if (arquivo.value && !doc.title.trim()) {
    doc.title = arquivo.value.name.replace(/\.[^.]+$/, '')
  }
}

async function enviarDocumento() {
  if (!arquivo.value) {
    toast.error('Escolha o arquivo.')
    return
  }
  const slug = useTenant().value?.slug
  if (!slug) {
    toast.error('Não foi possível identificar a imobiliária. Recarregue a página.')
    return
  }

  enviando.value = true
  try {
    const client = await getAdminSupabase()
    // `<slug>/<contract_id>/<uuid>` — o primeiro nível é o slug porque é o que
    // as policies de storage da 0028 autorizam. O uuid evita colisão de nome
    // sem precisar consultar o bucket antes.
    const ext = arquivo.value.name.split('.').pop() || 'pdf'
    const caminho = `${slug}/${id.value}/${crypto.randomUUID()}.${ext}`

    const { error: erroUpload } = await client.storage
      .from('portal-docs')
      .upload(caminho, arquivo.value, {
        upsert: false,
        contentType: arquivo.value.type || 'application/pdf',
      })
    if (erroUpload) throw erroUpload

    await adminFetch('/api/admin/portal-documents', {
      method: 'POST',
      body: {
        contractId: id.value,
        category: doc.category,
        title: doc.title.trim(),
        competence: doc.competence || null,
        dueOn: doc.dueOn || null,
        amount: doc.amount,
        storagePath: caminho,
        mime: arquivo.value.type || null,
        sizeBytes: arquivo.value.size,
      },
    })

    Object.assign(doc, { title: '', competence: '', dueOn: '', amount: null })
    arquivo.value = null
    await carregarDocumentos()
    toast.success('Documento enviado como rascunho. Publique para o cliente ver.')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    toast.error(err?.data?.statusMessage || err?.message || 'Não foi possível enviar.')
  } finally {
    enviando.value = false
  }
}

async function alternarPublicacao(d: PortalDocument) {
  try {
    await adminFetch(`/api/admin/portal-documents/${d.id}`, {
      method: 'PATCH',
      body: { published: !d.publishedAt },
    })
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

async function carregar() {
  if (criando.value) return
  carregando.value = true
  try {
    const r = await adminFetch<{
      contrato: Contract
      internal: ContractInternal | null
      partes: ParteDoContrato[]
    }>(`/api/admin/contracts/${id.value}`)

    Object.assign(form, {
      code: r.contrato.code,
      addressLabel: r.contrato.addressLabel || '',
      propertyId: r.contrato.propertyId,
      status: r.contrato.status,
      startedOn: r.contrato.startedOn,
      endsOn: r.contrato.endsOn,
      rentAmount: r.contrato.rentAmount,
      dueDay: r.contrato.dueDay,
      adjustmentIndex: r.contrato.adjustmentIndex || '',
    })
    Object.assign(internal, {
      notes: r.internal?.notes || '',
      adminFeePercent: r.internal?.adminFeePercent ?? null,
      externalId: r.internal?.externalId || '',
    })
    partes.value = r.partes
    await carregarDocumentos()
  } catch {
    error.value = 'Não foi possível carregar este contrato.'
  } finally {
    carregando.value = false
  }
}

onMounted(carregar)

async function salvar() {
  salvando.value = true
  error.value = ''
  try {
    if (criando.value) {
      const criado = await adminFetch<Contract>('/api/admin/contracts', {
        method: 'POST',
        body: form,
      })
      toast.success('Contrato cadastrado.')
      // Vai para a tela do contrato: é lá que se vinculam as partes, e sem isso
      // a pessoa cadastraria o contrato e ficaria sem saber o próximo passo.
      await navigateTo(`/admin/contratos/${criado.id}`)
    } else {
      await adminFetch(`/api/admin/contracts/${id.value}`, {
        method: 'PUT',
        body: { ...form, internal },
      })
      toast.success('Contrato salvo.')
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível salvar o contrato.'
  } finally {
    salvando.value = false
  }
}

async function vincular() {
  if (!novaParte.portalUserId) {
    toast.error('Escolha o cliente.')
    return
  }
  try {
    await adminFetch(`/api/admin/contracts/${id.value}/partes`, {
      method: 'POST',
      body: { portalUserId: novaParte.portalUserId, role: novaParte.role },
    })
    novaParte.portalUserId = ''
    await carregar()
    toast.success('Parte vinculada.')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    toast.error(err?.data?.statusMessage || 'Não foi possível vincular.')
  }
}

async function desvincular(parte: ParteDoContrato) {
  const ok = await askConfirm({
    title: 'Remover do contrato?',
    description: `${parte.nome} deixa de ver os documentos deste contrato. O cadastro do cliente continua, e os outros contratos dele não mudam.`,
    confirmLabel: 'Remover',
    danger: true,
  })
  if (!ok) return

  try {
    await adminFetch(`/api/admin/contracts/${id.value}/partes/${parte.id}`, { method: 'DELETE' })
    await carregar()
    toast.success('Parte removida.')
  } catch {
    toast.error('Não foi possível remover.')
  }
}

/** Clientes que ainda não estão neste contrato com o papel escolhido. */
const disponiveis = computed(() =>
  clientes.value.filter(
    (c) => !partes.value.some((p) => p.portalUserId === c.id && p.role === novaParte.role),
  ),
)

useHead({ title: criando.value ? 'Novo contrato · Painel' : 'Contrato · Painel' })
</script>

<template>
  <div>
    <NuxtLink to="/admin/contratos" class="voltar">← Contratos</NuxtLink>
    <h1 class="admin-h1">{{ criando ? 'Novo contrato' : 'Editar contrato' }}</h1>

    <p v-if="carregando" class="dica">Carregando…</p>

    <template v-else>
      <section class="admin-card">
        <h2 class="admin-h2">Dados do contrato</h2>

        <div class="grid">
          <div>
            <label class="admin-label" for="code">Código</label>
            <input id="code" v-model="form.code" class="admin-input" type="text" >
          </div>
          <div>
            <label class="admin-label" for="status">Situação</label>
            <select id="status" v-model="form.status" class="admin-input">
              <option value="ativo">Ativo</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </div>
          <div class="span2">
            <label class="admin-label" for="endereco">Endereço do imóvel</label>
            <input id="endereco" v-model="form.addressLabel" class="admin-input" type="text" >
          </div>
          <div>
            <label class="admin-label" for="inicio">Início</label>
            <input id="inicio" v-model="form.startedOn" class="admin-input" type="date" >
          </div>
          <div>
            <label class="admin-label" for="fim">Término</label>
            <input id="fim" v-model="form.endsOn" class="admin-input" type="date" >
          </div>
          <div>
            <label class="admin-label" for="aluguel">Aluguel (R$)</label>
            <input id="aluguel" v-model.number="form.rentAmount" class="admin-input" type="number" step="0.01" min="0" >
          </div>
          <div>
            <label class="admin-label" for="venc">Dia do vencimento</label>
            <input id="venc" v-model.number="form.dueDay" class="admin-input" type="number" min="1" max="31" >
          </div>
          <div>
            <label class="admin-label" for="indice">Índice de reajuste</label>
            <input id="indice" v-model="form.adjustmentIndex" class="admin-input" type="text" placeholder="IPCA-E, IGP-M…" >
          </div>
        </div>

        <p v-if="error" class="erro" role="alert">{{ error }}</p>

        <button class="admin-btn" type="button" :disabled="salvando" @click="salvar">
          {{ salvando ? 'Salvando…' : 'Salvar contrato' }}
        </button>
      </section>

      <!--
        Só depois de existir: partes e campos internos precisam de um contrato
        com id. Mostrar os blocos vazios na criação sugeriria que dá para
        preencher agora.
      -->
      <template v-if="!criando">
        <section class="admin-card" style="margin-top: 18px">
          <h2 class="admin-h2">Partes</h2>
          <p class="dica">
            Quem enxerga este contrato na Área do Cliente. O papel vale para
            ESTE contrato — a mesma pessoa pode ser inquilina aqui e
            proprietária em outro.
          </p>

          <ul v-if="partes.length" class="lista">
            <li v-for="p in partes" :key="p.id">
              <div class="quem">
                <b>{{ p.nome }}</b>
                <small>
                  {{ CONTRACT_PARTY_LABELS[p.role] }} · {{ p.email }}
                  <template v-if="!p.ativo"> · acesso desativado</template>
                </small>
              </div>
              <button class="admin-btn danger-ghost" type="button" @click="desvincular(p)">
                Remover
              </button>
            </li>
          </ul>
          <p v-else class="dica">
            Ninguém vinculado ainda — o contrato não aparece para cliente nenhum.
          </p>

          <div class="vincular">
            <select v-model="novaParte.portalUserId" class="admin-input">
              <option value="">Escolha o cliente…</option>
              <option v-for="c in disponiveis" :key="c.id" :value="c.id">
                {{ c.name }} ({{ c.email }})
              </option>
            </select>
            <select v-model="novaParte.role" class="admin-input">
              <option v-for="r in CONTRACT_PARTY_ROLES" :key="r" :value="r">
                {{ CONTRACT_PARTY_LABELS[r] }}
              </option>
            </select>
            <button class="admin-btn" type="button" @click="vincular">Vincular</button>
          </div>

          <p v-if="!clientes.length" class="dica">
            Nenhum cliente cadastrado ainda.
            <NuxtLink to="/admin/clientes">Cadastre um cliente</NuxtLink> antes de
            vincular.
          </p>
        </section>

        <section class="admin-card" style="margin-top: 18px">
          <h2 class="admin-h2">Documentos</h2>
          <p class="dica">
            Arquivos do contrato na Área do Cliente. Tudo entra como rascunho e
            só aparece para o cliente depois de publicado.
          </p>

          <div class="grid">
            <div class="span2">
              <label class="admin-label" for="arq">Arquivo (PDF)</label>
              <input id="arq" class="admin-input" type="file" accept="application/pdf,image/*" @change="escolherArquivo" >
            </div>
            <div>
              <label class="admin-label" for="cat">Tipo</label>
              <select id="cat" v-model="doc.category" class="admin-input">
                <option v-for="c in PORTAL_DOC_CATEGORIES" :key="c" :value="c">
                  {{ PORTAL_DOC_LABELS[c] }}
                </option>
              </select>
            </div>
            <div>
              <label class="admin-label" for="tit">Título</label>
              <input id="tit" v-model="doc.title" class="admin-input" type="text" >
            </div>
            <div>
              <label class="admin-label" for="comp">Competência (mês)</label>
              <input id="comp" v-model="doc.competence" class="admin-input" type="date" >
            </div>
            <div>
              <label class="admin-label" for="venc2">Vencimento</label>
              <input id="venc2" v-model="doc.dueOn" class="admin-input" type="date" >
            </div>
            <div>
              <label class="admin-label" for="val">Valor (R$)</label>
              <input id="val" v-model.number="doc.amount" class="admin-input" type="number" step="0.01" min="0" >
            </div>
          </div>

          <!--
            O que vai aqui e quem enxerga, no momento da escolha. A frase de
            audiência é derivada de defaultAudienceFor, a mesma que o servidor
            aplica — rótulo e comportamento não podem divergir.
          -->
          <p class="regra">
            <b>{{ quemVe }}.</b> {{ PORTAL_DOC_HINTS[doc.category] }}
          </p>

          <button class="admin-btn" type="button" :disabled="enviando" @click="enviarDocumento">
            {{ enviando ? 'Enviando…' : 'Enviar documento' }}
          </button>

          <ul v-if="documentos.length" class="lista" style="margin-top: 16px">
            <li v-for="d in documentos" :key="d.id">
              <div class="quem">
                <b>{{ d.title }}</b>
                <small>
                  {{ PORTAL_DOC_LABELS[d.category] }} ·
                  {{ describeAudience(d.audience) }}
                  <template v-if="!d.publishedAt"> · rascunho</template>
                </small>
              </div>
              <div class="acoes">
                <button class="admin-btn ghost" type="button" @click="alternarPublicacao(d)">
                  {{ d.publishedAt ? 'Despublicar' : 'Publicar' }}
                </button>
                <button class="admin-btn danger-ghost" type="button" @click="apagarDocumento(d)">
                  Apagar
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="dica" style="margin-top: 14px">
            Nenhum documento enviado ainda.
          </p>
        </section>

        <section class="admin-card" style="margin-top: 18px">
          <h2 class="admin-h2">Uso interno</h2>
          <p class="dica">
            Nada daqui aparece para o cliente. A taxa de administração chega ao
            proprietário pelo extrato de repasse, não por esta tela.
          </p>

          <div class="grid">
            <div>
              <label class="admin-label" for="taxa">Taxa de administração (%)</label>
              <input id="taxa" v-model.number="internal.adminFeePercent" class="admin-input" type="number" step="0.01" min="0" max="100" >
            </div>
            <div>
              <label class="admin-label" for="externo">ID no ERP</label>
              <input id="externo" v-model="internal.externalId" class="admin-input" type="text" >
            </div>
            <div class="span2">
              <label class="admin-label" for="notas">Anotações</label>
              <textarea id="notas" v-model="internal.notes" class="admin-input" rows="3" />
            </div>
          </div>

          <button class="admin-btn" type="button" :disabled="salvando" @click="salvar">
            {{ salvando ? 'Salvando…' : 'Salvar' }}
          </button>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.voltar {
  display: inline-block;
  font-size: 13px;
  color: #4b5563;
  text-decoration: none;
  margin-bottom: 10px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.span2 {
  grid-column: 1 / -1;
}
.dica {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 12px;
}
.erro {
  color: #b91c1c;
  font-size: 13px;
  margin: 0 0 10px;
}
.lista {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: grid;
  gap: 8px;
}
.lista li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 11px 13px;
}
.quem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.quem small {
  font-size: 12px;
  color: #6b7280;
}
.regra {
  font-size: 13px;
  color: #374151;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  padding: 10px 12px;
  margin: 0 0 14px;
}
.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.vincular {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.vincular .admin-input {
  flex: 1 1 180px;
  margin: 0;
}
</style>
