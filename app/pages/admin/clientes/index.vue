<script setup lang="ts">
import type { PortalUser, PortalUserInput } from '~~/shared/models/portal'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const toast = useToast()
const { askConfirm } = useConfirm()

const {
  data: clientes,
  refresh,
  pending,
} = useLazyAsyncData(
  'admin:portal-users',
  () => adminFetch<PortalUser[]>('/api/admin/portal-users'),
  { server: false, default: () => [] as PortalUser[] },
)

const vazio = (): PortalUserInput => ({ name: '', email: '', doc: '', phone: '' })
const form = reactive<PortalUserInput>(vazio())
const salvando = ref(false)
const error = ref('')

const { display: phoneDisplay, onInput: onPhoneInput, isValid: phoneValid } = usePhoneInput(
  toRef(form, 'phone'),
  'whatsapp',
)

async function convidar() {
  if (!form.name.trim()) {
    error.value = 'Informe o nome do cliente.'
    return
  }
  if (!form.email.trim()) {
    error.value = 'Informe o e-mail do cliente.'
    return
  }
  if (!phoneValid.value) {
    error.value = 'WhatsApp/telefone inválido (com DDD).'
    return
  }

  salvando.value = true
  error.value = ''
  try {
    const r = await adminFetch<{
      jaEraCliente: boolean
      contaPreexistente: boolean
      semToken: boolean
      emailEnviado: boolean
    }>('/api/admin/portal-users', { method: 'POST', body: form })

    // As três frases são diferentes de propósito: "convite enviado" quando o
    // e-mail não saiu faria a imobiliária esperar um cliente que nunca foi
    // avisado.
    if (!r.emailEnviado) {
      toast.error(
        'Cliente cadastrado, mas o convite NÃO foi enviado. Use "Reenviar convite" em instantes.',
      )
    } else if (r.contaPreexistente) {
      // Não é falha: este e-mail já tinha conta na plataforma, então o aviso vai
      // sem link de senha. Dizer isso evita a chamada "meu cliente não recebeu
      // o link".
      toast.success(
        'Cliente cadastrado. Este e-mail já tinha conta — avisamos que o acesso está liberado, e ele entra com a senha que já usa.',
      )
    } else if (r.jaEraCliente) {
      // Reenvio de um cadastro que nasceu de conta preexistente e que a pessoa
      // ainda não confirmou entrando: o aviso vai sem link de novo. Prometer
      // "convite reenviado" aqui geraria a ligação "ele não recebeu link".
      toast.success(
        r.semToken
          ? 'Aviso reenviado sem link de senha: este e-mail já tinha conta e ainda não entrou na Área do Cliente. Ele entra com a senha que já usa.'
          : 'Convite reenviado.',
      )
    } else {
      toast.success('Cliente cadastrado e convite enviado.')
    }

    Object.assign(form, vazio())
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível cadastrar o cliente.'
  } finally {
    salvando.value = false
  }
}

async function reenviar(c: PortalUser) {
  try {
    const r = await adminFetch<{ emailEnviado: boolean; semToken: boolean }>(
      '/api/admin/portal-users',
      {
        method: 'POST',
        // O reenvio manda o cadastro que já existe: o servidor reconhece pelo
        // e-mail e não cria linha nova.
        body: { name: c.name, email: c.email, doc: c.doc, phone: c.phone },
      },
    )
    if (r.emailEnviado && r.semToken)
      toast.success(
        `Aviso reenviado para ${c.email} sem link de senha: a conta já existia na plataforma e ainda não entrou aqui.`,
      )
    else if (r.emailEnviado) toast.success(`Convite reenviado para ${c.email}.`)
    else toast.error('Não foi possível enviar o convite agora. Tente de novo em instantes.')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    toast.error(err?.data?.statusMessage || 'Não foi possível reenviar.')
  }
}

async function alternarAcesso(c: PortalUser) {
  const desativando = c.active
  if (desativando) {
    const ok = await askConfirm({
      title: 'Desativar acesso?',
      // Dizer o que NÃO acontece é o que evita a pergunta seguinte ao suporte.
      description: `${c.name} deixa de entrar na Área do Cliente. O cadastro e o histórico de downloads continuam guardados, e o acesso pode ser religado quando quiser.`,
      confirmLabel: 'Desativar',
      danger: true,
    })
    if (!ok) return
  }

  try {
    await adminFetch(`/api/admin/portal-users/${c.id}`, {
      method: 'PATCH',
      body: { active: !c.active },
    })
    toast.success(desativando ? 'Acesso desativado.' : 'Acesso reativado.')
    await refresh()
  } catch {
    toast.error('Não foi possível alterar o acesso.')
  }
}

useHead({ title: 'Clientes · Painel' })
</script>

<template>
  <div>
    <h1 class="admin-h1">Clientes da Área do Cliente</h1>
    <p class="admin-sub">
      Inquilinos, proprietários e fiadores que acessam contratos e documentos.
    </p>

    <section class="admin-card">
      <h2 class="admin-h2">Cadastrar e convidar</h2>

      <div class="grid">
        <div>
          <label class="admin-label" for="nome">Nome</label>
          <input id="nome" v-model="form.name" class="admin-input" type="text" >
        </div>
        <div>
          <label class="admin-label" for="email">E-mail</label>
          <input id="email" v-model="form.email" class="admin-input" type="email" >
        </div>
        <div>
          <label class="admin-label" for="doc">CPF/CNPJ</label>
          <input id="doc" v-model="form.doc" class="admin-input" type="text" >
        </div>
        <div>
          <label class="admin-label" for="fone">WhatsApp</label>
          <input
            id="fone"
            class="admin-input"
            type="tel"
            inputmode="tel"
            :value="phoneDisplay"
            @input="onPhoneInput"
          >
        </div>
      </div>

      <p class="dica">
        O convite vai por e-mail em nome da imobiliária, com um link para o
        cliente criar a própria senha.
      </p>

      <p v-if="error" class="erro" role="alert">{{ error }}</p>

      <button class="admin-btn" type="button" :disabled="salvando" @click="convidar">
        {{ salvando ? 'Enviando…' : 'Cadastrar e enviar convite' }}
      </button>
    </section>

    <section class="admin-card" style="margin-top: 18px">
      <h2 class="admin-h2">Cadastrados</h2>

      <p v-if="pending" class="dica">Carregando…</p>
      <p v-else-if="!clientes.length" class="dica">
        Nenhum cliente cadastrado ainda. Use o formulário acima para convidar o
        primeiro.
      </p>

      <ul v-else class="lista">
        <li v-for="c in clientes" :key="c.id" :class="{ inativo: !c.active }">
          <div class="quem">
            <b>{{ c.name }}</b>
            <small>{{ c.email }}</small>
            <span v-if="!c.active" class="tag">Acesso desativado</span>
          </div>
          <div class="acoes">
            <button class="admin-btn ghost" type="button" @click="reenviar(c)">
              Reenviar convite
            </button>
            <button
              class="admin-btn"
              :class="c.active ? 'danger' : 'ghost'"
              type="button"
              @click="alternarAcesso(c)"
            >
              {{ c.active ? 'Desativar' : 'Reativar' }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}
.dica {
  font-size: 13px;
  color: #6b7280;
  margin: 12px 0;
}
.erro {
  color: #b91c1c;
  font-size: 13px;
  margin: 0 0 10px;
}
.lista {
  list-style: none;
  margin: 0;
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
  padding: 12px 14px;
}
.lista li.inativo {
  opacity: 0.7;
  background: #fafafa;
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
.tag {
  align-self: flex-start;
  margin-top: 4px;
  font-size: 11px;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 2px 9px;
  color: #4b5563;
}
.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
