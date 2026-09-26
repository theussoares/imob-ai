<script setup lang="ts">
import type { ContractPartyRole, PortalUser, PortalUserInput } from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS } from '~~/shared/models/portal'
import { formatarDocumento, tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { formatWhatsapp } from '~~/shared/utils/phone'

/**
 * Clientes da imobiliária: inquilinos, proprietários e fiadores.
 *
 * Cadastrar NÃO é mais convidar (0050). A pessoa existe para a imobiliária
 * com nome e WhatsApp; o acesso à Área do Cliente é uma escolha à parte, que
 * exige e-mail. Antes, e-mail era obrigatório e o convite saía na hora — o
 * fiador que nunca vai entrar e o dono que só usa WhatsApp não cabiam.
 */
definePageMeta({ layout: 'admin', middleware: ['admin', 'area-cliente'] })

interface ContratoDoCliente {
  id: string
  code: string
  addressLabel: string | null
  status: 'ativo' | 'encerrado'
  role: ContractPartyRole
}
type Cliente = PortalUser & { contratos: ContratoDoCliente[] }

const toast = useToast()
const { askConfirm } = useConfirm()

const {
  data: clientes,
  refresh,
  pending,
  error: loadError,
} = useLazyAsyncData('admin:portal-users', () => adminFetch<Cliente[]>('/api/admin/portal-users'), {
  server: false,
  default: () => [] as Cliente[],
})

// ---- Cadastro ----
const vazio = (): PortalUserInput & { email: string; doc: string; phone: string } => ({
  name: '',
  email: '',
  doc: '',
  phone: '',
  convidar: false,
})
const form = reactive(vazio())
const salvando = ref(false)
const error = ref('')
const { display: phoneDisplay, onInput: onPhoneInput, isValid: phoneValid } = usePhoneInput(
  toRef(form, 'phone'),
  'whatsapp',
)
const docInvalido = computed(() => !!form.doc.trim() && !tipoDeDocumento(form.doc))
// O aviso do formulário é sobre o que estava digitado: mudou, ele sai. Senão
// "CPF inválido" seguia na tela com o CPF já corrigido.
watch(
  () => ({ ...form }),
  () => (error.value = ''),
)
// Convidar sem e-mail não é opção: a caixa desmarca sozinha se o e-mail sumir.
watch(
  () => form.email,
  (e) => {
    if (!e.trim()) form.convidar = false
  },
)

/**
 * As frases do convite são diferentes de propósito: "convite enviado" quando
 * o e-mail não saiu faria a imobiliária esperar um cliente que nunca foi
 * avisado. E o caso de configuração diz de quem é o problema — tentar de novo
 * nunca resolve, e a imobiliária não pode achar que errou.
 */
const FALHA_DE_ENVIO: Record<'nao_configurado' | 'provedor', string> = {
  nao_configurado:
    'O envio de e-mail da plataforma não está configurado. Tentar de novo não resolve: é problema nosso, não do seu cadastro. Avise o suporte.',
  provedor: 'O provedor de e-mail recusou o envio. Tente de novo em alguns minutos.',
}
interface RespostaConvite {
  jaEraCliente: boolean
  contaPreexistente: boolean
  semToken: boolean
  emailEnviado: boolean
  motivoFalha: 'nao_configurado' | 'provedor' | null
}
function avisarConvite(r: RespostaConvite, nome: string) {
  if (!r.emailEnviado) toast.error(`${nome} está cadastrado, mas o convite NÃO saiu. ${FALHA_DE_ENVIO[r.motivoFalha ?? 'provedor']}`)
  else if (r.semToken)
    // Não é falha: o e-mail já tinha conta na plataforma, então o aviso vai sem
    // link de senha. Dizer evita a ligação "meu cliente não recebeu o link".
    toast.success(`Acesso liberado para ${nome}. O e-mail já tinha conta, então ele entra com a senha que já usa.`)
  else toast.success(`Convite enviado para ${nome}.`)
}

async function cadastrar() {
  error.value = ''
  if (!form.name.trim()) return (error.value = 'Informe o nome do cliente.')
  if (!phoneValid.value) return (error.value = 'WhatsApp inválido (com DDD).')
  if (docInvalido.value) return (error.value = 'CPF/CNPJ inválido. Confira os números.')
  salvando.value = true
  try {
    const r = await adminFetch<{ convidado: boolean } & Partial<RespostaConvite>>('/api/admin/portal-users', {
      method: 'POST',
      body: { ...form, email: form.email.trim() || null, doc: form.doc.trim() || null },
    })
    toast.clearErrors()
    if (r.convidado) avisarConvite(r as RespostaConvite, form.name.trim())
    else toast.success(`${form.name.trim()} cadastrado.`)
    Object.assign(form, vazio())
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível cadastrar.'
  } finally {
    salvando.value = false
  }
}

// ---- Lista ----
const busca = ref('')
const lista = computed(() => {
  const q = busca.value.trim().toLowerCase()
  const digitos = q.replace(/\D/g, '')
  if (!q) return clientes.value
  return clientes.value.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').includes(q) ||
      (digitos.length >= 3 && ((c.doc ?? '').includes(digitos) || (c.phone ?? '').includes(digitos))) ||
      c.contratos.some((k) => k.code.toLowerCase().includes(q)),
  )
})

type EstadoAcesso = 'sem_acesso' | 'convidado' | 'com_acesso' | 'desativado'
function estado(c: Cliente): EstadoAcesso {
  if (!c.userId) return 'sem_acesso'
  if (!c.active) return 'desativado'
  // "Acessa" só depois de entrar de fato. Antes, o rótulo não afirma que o
  // e-mail chegou: o convite pode ter falhado, e dizer "enviado" faria a
  // imobiliária esperar um cliente que nunca foi avisado.
  return c.hasLoggedIn ? 'com_acesso' : 'convidado'
}
const ESTADO_LABEL: Record<EstadoAcesso, string> = {
  sem_acesso: 'Sem acesso ao portal',
  convidado: 'Convidado, ainda não entrou',
  com_acesso: 'Acessa o portal',
  desativado: 'Acesso desativado',
}

/** Um envio por vez: dois convites em voo deixariam dois toasts brigando. */
const enviandoId = ref<string | null>(null)
async function darAcesso(c: Cliente) {
  if (enviandoId.value) return
  enviandoId.value = c.id
  try {
    const r = await adminFetch<RespostaConvite>(`/api/admin/portal-users/${c.id}/acesso`, { method: 'POST' })
    avisarConvite(r, c.name)
    await refresh()
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível enviar.')
  } finally {
    enviandoId.value = null
  }
}

async function alternarAcesso(c: Cliente) {
  const desativando = c.active
  if (desativando) {
    const ok = await askConfirm({
      title: 'Desativar acesso?',
      // Dizer o que NÃO acontece é o que evita a pergunta seguinte ao suporte.
      description: `${c.name} deixa de entrar na Área do Cliente. O cadastro, os contratos e o histórico de downloads continuam guardados, e o acesso pode ser religado.`,
      confirmLabel: 'Desativar',
      danger: true,
    })
    if (!ok) return
  }
  try {
    await adminFetch(`/api/admin/portal-users/${c.id}`, { method: 'PATCH', body: { active: !c.active } })
    toast.success(desativando ? 'Acesso desativado.' : 'Acesso reativado.')
    await refresh()
  } catch {
    toast.error('Não foi possível alterar o acesso.')
  }
}

// ---- Edição inline ----
const editandoId = ref<string | null>(null)
const edicao = reactive({ name: '', phone: '', doc: '', email: '' })
const salvandoEdicao = ref(false)
const { display: phoneEdDisplay, onInput: onPhoneEdInput, isValid: phoneEdValid } = usePhoneInput(
  toRef(edicao, 'phone'),
  'whatsapp',
)
function editar(c: Cliente) {
  editandoId.value = editandoId.value === c.id ? null : c.id
  Object.assign(edicao, { name: c.name, phone: c.phone ?? '', doc: formatarDocumento(c.doc), email: c.email ?? '' })
}
async function salvarEdicao(c: Cliente) {
  if (!edicao.name.trim()) return toast.error('Informe o nome.')
  if (!phoneEdValid.value) return toast.error('WhatsApp inválido (com DDD).')
  if (edicao.doc.trim() && !tipoDeDocumento(edicao.doc)) return toast.error('CPF/CNPJ inválido. Confira os números.')
  salvandoEdicao.value = true
  try {
    await adminFetch(`/api/admin/portal-users/${c.id}`, {
      method: 'PUT',
      body: {
        name: edicao.name,
        phone: edicao.phone || null,
        doc: edicao.doc.replace(/\D/g, '') || null,
        // Com acesso, o e-mail é o login: o servidor recusa a troca, e a tela nem oferece.
        ...(c.userId ? {} : { email: edicao.email.trim() || null }),
      },
    })
    toast.clearErrors()
    toast.success('Cadastro atualizado.')
    editandoId.value = null
    await refresh()
  } catch (e: unknown) {
    toast.error((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Não foi possível salvar.')
  } finally {
    salvandoEdicao.value = false
  }
}

useHead({ title: 'Clientes · Painel' })
</script>

<template>
  <div>
    <h1 class="admin-h1">Clientes</h1>
    <p class="admin-sub">
      Inquilinos, proprietários e fiadores. Cadastre só com nome e WhatsApp; o acesso à Área do Cliente é opcional.
    </p>

    <section class="admin-card">
      <h2 class="admin-h2">Novo cliente</h2>
      <form class="grid" @submit.prevent="cadastrar">
        <div>
          <label class="admin-label" for="nome">Nome *</label>
          <input id="nome" v-model="form.name" class="admin-input" type="text" autocomplete="off" required />
        </div>
        <div>
          <label class="admin-label" for="fone">WhatsApp</label>
          <input
            id="fone"
            class="admin-input"
            type="tel"
            inputmode="tel"
            placeholder="+55 (67) 99123-4567"
            :value="phoneDisplay"
            @input="onPhoneInput"
          />
        </div>
        <div>
          <label class="admin-label" for="doc">CPF/CNPJ</label>
          <input
            id="doc"
            v-model="form.doc"
            class="admin-input"
            type="text"
            inputmode="numeric"
            :aria-invalid="docInvalido"
            aria-describedby="doc-ajuda"
            @blur="form.doc = formatarDocumento(form.doc)"
          />
          <p id="doc-ajuda" class="campo-ajuda" :class="{ erro: docInvalido }">
            {{ docInvalido ? 'Os números não fecham. Confira.' : 'Obrigatório para o inquilino: o boleto exige.' }}
          </p>
        </div>
        <div>
          <label class="admin-label" for="email">E-mail</label>
          <input id="email" v-model="form.email" class="admin-input" type="email" autocomplete="off" />
        </div>
        <label class="convite" :class="{ desligado: !form.email.trim() }">
          <input v-model="form.convidar" type="checkbox" :disabled="!form.email.trim()" />
          <span>
            <b>Dar acesso à Área do Cliente</b>
            <small>{{
              form.email.trim()
                ? 'Enviamos um convite por e-mail para ele criar a senha e ver contratos, boletos e documentos.'
                : 'Precisa de e-mail. Dá para liberar depois, na lista abaixo.'
            }}</small>
          </span>
        </label>
        <div class="acoes-form">
          <p v-if="error" class="erro" role="alert">{{ error }}</p>
          <button class="admin-btn" type="submit" :disabled="salvando">
            {{ salvando ? 'Salvando…' : form.convidar ? 'Cadastrar e convidar' : 'Cadastrar cliente' }}
          </button>
        </div>
      </form>
    </section>

    <section class="admin-card lista-card">
      <div class="lista-topo">
        <h2 class="admin-h2">Cadastrados <span v-if="clientes.length" class="conta">{{ clientes.length }}</span></h2>
        <input
          v-if="clientes.length > 4"
          v-model="busca"
          class="admin-input busca"
          type="search"
          placeholder="Buscar por nome, e-mail, CPF ou contrato"
          aria-label="Buscar cliente"
        />
      </div>

      <p v-if="pending && !clientes.length" class="dica">Carregando…</p>
      <AdminLoadError v-else-if="loadError" what="os clientes" @retry="refresh()" />
      <p v-else-if="!clientes.length" class="dica">
        Nenhum cliente ainda. Eles também podem ser criados direto no cadastro do contrato.
      </p>
      <p v-else-if="!lista.length" class="dica">Ninguém com "{{ busca }}".</p>

      <ul v-else class="lista">
        <li v-for="c in lista" :key="c.id" :class="{ inativo: estado(c) === 'desativado' }">
          <div class="linha">
            <div class="quem">
              <b>{{ c.name }}</b>
              <small class="meta">
                <span v-if="c.phone">{{ formatWhatsapp(c.phone) }}</span>
                <span v-if="c.email">{{ c.email }}</span>
                <span v-if="c.doc">{{ formatarDocumento(c.doc) }}</span>
                <span v-if="!c.phone && !c.email && !c.doc" class="falta">Sem contato cadastrado</span>
              </small>
              <div v-if="c.contratos.length" class="contratos">
                <NuxtLink v-for="k in c.contratos" :key="`${k.id}-${k.role}`" :to="`/admin/contratos/${k.id}`" class="chip">
                  <span class="chip-papel">{{ CONTRACT_PARTY_LABELS[k.role] }}</span> {{ k.code }}
                </NuxtLink>
              </div>
            </div>
            <span class="estado" :class="`e-${estado(c)}`">{{ ESTADO_LABEL[estado(c)] }}</span>
            <div class="acoes">
              <!-- Sem e-mail não há acesso: em vez de um botão desabilitado que não
                   explica nada, o caminho para resolver. -->
              <button
                v-if="estado(c) === 'sem_acesso' && !c.email"
                class="admin-btn ghost sm"
                type="button"
                @click="editar(c)"
              >
                Adicionar e-mail
              </button>
              <button
                v-else-if="estado(c) === 'sem_acesso' || estado(c) === 'convidado'"
                class="admin-btn ghost sm"
                type="button"
                :disabled="!!enviandoId"
                @click="darAcesso(c)"
              >
                {{ enviandoId === c.id ? 'Enviando…' : estado(c) === 'sem_acesso' ? 'Dar acesso' : 'Reenviar convite' }}
              </button>
              <button
                v-if="estado(c) === 'com_acesso' || estado(c) === 'convidado' || estado(c) === 'desativado'"
                class="admin-btn sm"
                :class="c.active ? 'danger-ghost' : 'ghost'"
                type="button"
                @click="alternarAcesso(c)"
              >
                {{ c.active ? 'Desativar acesso' : 'Reativar acesso' }}
              </button>
              <button class="admin-btn ghost sm" type="button" :aria-expanded="editandoId === c.id" @click="editar(c)">
                {{ editandoId === c.id ? 'Fechar' : 'Editar' }}
              </button>
            </div>
          </div>

          <form v-if="editandoId === c.id" class="edicao" @submit.prevent="salvarEdicao(c)">
            <div>
              <label class="admin-label" :for="`ed-n-${c.id}`">Nome</label>
              <input :id="`ed-n-${c.id}`" v-model="edicao.name" class="admin-input" />
            </div>
            <div>
              <label class="admin-label" :for="`ed-f-${c.id}`">WhatsApp</label>
              <input :id="`ed-f-${c.id}`" class="admin-input" type="tel" :value="phoneEdDisplay" @input="onPhoneEdInput" />
            </div>
            <div>
              <label class="admin-label" :for="`ed-d-${c.id}`">CPF/CNPJ</label>
              <input :id="`ed-d-${c.id}`" v-model="edicao.doc" class="admin-input" inputmode="numeric" @blur="edicao.doc = formatarDocumento(edicao.doc)" />
            </div>
            <div>
              <label class="admin-label" :for="`ed-e-${c.id}`">E-mail</label>
              <input :id="`ed-e-${c.id}`" v-model="edicao.email" class="admin-input" type="email" :disabled="!!c.userId" />
              <p v-if="c.userId" class="campo-ajuda">É o login dele no portal; não muda por aqui.</p>
            </div>
            <div class="acoes-form">
              <button class="admin-btn sm" type="submit" :disabled="salvandoEdicao">{{ salvandoEdicao ? 'Salvando…' : 'Salvar' }}</button>
            </div>
          </form>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}
.campo-ajuda {
  margin: 6px 0 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.campo-ajuda.erro,
.erro {
  color: #b91c1c;
}
.erro {
  font-size: var(--fs-label);
  margin: 0;
}
.convite {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
}
.convite input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--brand);
  flex: none;
}
.convite span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.convite small {
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.convite.desligado {
  cursor: default;
}
.convite.desligado b {
  color: var(--ink-soft);
}
.acoes-form {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.dica {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin: 12px 0;
}

.lista-card {
  margin-top: 18px;
}
.lista-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.lista-topo .admin-h2 {
  margin: 0;
}
.conta {
  margin-left: 6px;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.busca {
  width: min(320px, 100%);
  padding: 8px 12px;
  font-size: var(--fs-ui);
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
}
.lista > li {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.lista > li:first-child {
  border-top: none;
  padding-top: 4px;
}
.lista > li.inativo .quem {
  opacity: 0.65;
}
.linha {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px 16px;
}
.quem {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.falta {
  color: #9a5b00;
}
.contratos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--brand-ghost);
  color: var(--brand);
  font-size: var(--fs-caption);
  font-weight: 700;
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}
.chip:hover {
  background: color-mix(in srgb, var(--brand) 16%, white);
}
.chip-papel {
  font-weight: 600;
  text-transform: capitalize;
}
.estado {
  font-size: var(--fs-caption);
  font-weight: 700;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  white-space: nowrap;
  background: var(--surface);
  color: var(--ink-soft);
}
.e-com_acesso {
  background: #e8f4ec;
  color: #17683a;
}
.e-convidado {
  background: #fff6e0;
  color: #8a5a00;
}
.acoes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.edicao {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--surface);
}
@media (max-width: 720px) {
  .linha {
    grid-template-columns: 1fr;
  }
  .estado {
    justify-self: start;
  }
  .acoes {
    justify-content: flex-start;
  }
}
</style>
