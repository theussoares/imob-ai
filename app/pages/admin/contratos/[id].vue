<script setup lang="ts">
import type {
  Contract,
  ContractInput,
  ContractInternal,
  ContractInternalInput,
  ContractPartyRole,
  PortalUser,
} from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS, CONTRACT_PARTY_ROLES } from '~~/shared/models/portal'
import type { ParteDoContrato } from '~~/server/repositories/contract.repository'

definePageMeta({ layout: 'admin', middleware: 'admin' })

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
              <button class="admin-btn danger" type="button" @click="desvincular(p)">
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
