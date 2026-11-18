<script setup lang="ts">
import { statusConvite, type Convite } from '../../../domain/auth'
import { ORDEM_PERFIS, PERFIS } from '../../../domain/permissions'
import type { Perfil } from '../../../domain/types'

// Rota estática: vence `[secao].vue`, que segue cobrindo as seções ainda «em breve».
definePageMeta({ layout: 'gestao', middleware: 'gestao' })
useHead({ title: 'Usuários e permissões · Gestão' })

const store = useGestaoStore()
const { sessao } = useGestaoSessao()
const auth = useGestaoAuth()
const toast = useToast()
const { askConfirm } = useConfirm()

await auth.carregar()

const caps = computed(() => store.caps())
const ehDono = computed(() => sessao.value?.perfil === 'dono')
// Jurídico não vê «Dono» na lista: a regra de verdade está em `criarConvite`, isto
// só evita oferecer uma opção que o domínio vai recusar.
const perfisConvidaveis = computed(() => ORDEM_PERFIS.filter((p) => p !== 'dono' || ehDono.value))

const email = ref('')
const perfil = ref<Perfil | ''>('')
const erro = ref('')
const criando = ref(false)
const ultimo = ref<Convite | null>(null)
const emailEnviado = ref(true)
const brokerId = ref('')

const agora = ref(Date.now())
onMounted(() => {
  // Atualiza o «expira em» e esconde convites que venceram com a tela aberta.
  const t = setInterval(() => (agora.value = Date.now()), 30_000)
  onBeforeUnmount(() => clearInterval(t))
})

const pendentes = computed(() =>
  auth.estado.value.convites.filter((c) => statusConvite(c, agora.value) === 'pendente'),
)
const contas = computed(() => auth.estado.value.contas)

const linkDe = (c: Convite) => `${window.location.origin}/gestao/convite/${c.token}`
const quando = (ms: number) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

async function criar() {
  if (!sessao.value || !perfil.value || !email.value.trim()) return
  criando.value = true
  erro.value = ''
  if (auth.http && perfil.value === 'corretor' && !brokerId.value) {
    erro.value = 'Escolha o corretor cadastrado desta pessoa.'
    criando.value = false
    return
  }
  const r = await auth.convidar(email.value, perfil.value, { nome: sessao.value.nome, perfil: sessao.value.perfil }, brokerId.value || undefined)
  criando.value = false
  if (!r.ok) {
    erro.value = r.erro
    return
  }
  ultimo.value = r.convite
  emailEnviado.value = !('emailEnviado' in r) || r.emailEnviado
  email.value = ''
  perfil.value = ''
  brokerId.value = ''
}

async function copiar(c: Convite) {
  try {
    await navigator.clipboard.writeText(linkDe(c))
    toast.success('Link do convite copiado.')
  } catch {
    // Clipboard exige contexto seguro e permissão; o link segue visível para copiar à mão.
    toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
  }
}

async function revogar(c: Convite) {
  const ok = await askConfirm({
    title: `Cancelar o convite de ${c.email}?`,
    description: 'O link deixa de funcionar na hora. Você pode enviar um convite novo depois.',
    confirmLabel: 'Cancelar convite',
    cancelLabel: 'Manter',
    danger: true,
  })
  if (!ok) return
  const r = await auth.revogar(c.token)
  if (!r.ok) return toast.error(r.erro)
  if (ultimo.value?.token === c.token) ultimo.value = null
  toast.success('Convite cancelado.')
}

const campo =
  'min-h-12 w-full rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 text-[length:var(--fs-body)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'
const card = 'rounded-[var(--r)] border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[var(--shadow)] md:p-5'
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="m-0 text-[length:var(--fs-title)] font-extrabold">Usuários e permissões</h1>

    <p v-if="!caps?.convidar" role="alert" class="m-0 font-semibold text-[var(--danger)]">
      Seu perfil não pode convidar usuários.
    </p>

    <template v-else>
      <section :class="card" aria-labelledby="convidar-titulo">
        <h2 id="convidar-titulo" class="m-0 mb-1 text-[length:var(--fs-title-sm)] font-extrabold">Convidar por e-mail</h2>
        <p class="m-0 mb-3 text-[var(--ink-soft)]">
          A pessoa recebe um link de uso único, válido por 72 horas, e cria a própria senha. O perfil é definido aqui e não
          pode ser mudado por quem aceita.
        </p>
        <p
          v-if="auth.http"
          class="m-0 mb-3 text-[length:var(--fs-label)] text-[var(--ink-soft)]"
          data-testid="convite-por-email"
        >
          O link vai só por e-mail, direto para quem foi convidado — ele não aparece aqui.
        </p>
        <p
          v-if="auth.demo"
          class="m-0 mb-3 rounded-xl border-2 border-dashed border-[var(--accent)] p-3 text-[length:var(--fs-label)]"
          data-testid="faixa-demo"
        >
          <strong class="text-[var(--accent)]">Demonstração:</strong> não há envio de e-mail. Copie o link gerado e abra-o
          numa janela anônima para aceitar o convite.
        </p>

        <form class="[display:grid] grid-cols-1 gap-3 md:grid-cols-[1fr_14rem_auto] md:items-end" novalidate @submit.prevent="criar">
          <div class="flex flex-col gap-1.5">
            <label for="convite-email" class="font-bold">E-mail</label>
            <input
              id="convite-email"
              v-model="email"
              type="email"
              inputmode="email"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :class="campo"
              :aria-describedby="erro ? 'convite-erro' : undefined"
              :aria-invalid="!!erro"
              data-testid="convite-email"
            />
          </div>
          <div v-if="auth.http && perfil === 'corretor'" class="flex flex-col gap-1.5 md:col-span-3">
            <label for="convite-corretor" class="font-bold">Corretor cadastrado</label>
            <select id="convite-corretor" v-model="brokerId" :class="campo" data-testid="convite-corretor">
              <option value="" disabled>Escolha…</option>
              <option v-for="c in store.corretores.value" :key="c.id" :value="c.id">{{ c.nome }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="convite-perfil" class="font-bold">Perfil</label>
            <select id="convite-perfil" v-model="perfil" :class="campo" data-testid="convite-perfil">
              <option value="" disabled>Escolha…</option>
              <option v-for="p in perfisConvidaveis" :key="p" :value="p">{{ PERFIS[p].nome }}</option>
            </select>
          </div>
          <button
            type="submit"
            class="min-h-12 rounded-xl bg-[var(--gestao-amarelo)] px-5 font-extrabold text-[var(--brand)] enabled:cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--line-2)] disabled:text-[var(--ink-soft)]"
            :disabled="!email.trim() || !perfil || criando"
            data-testid="convite-criar"
          >
            {{ criando ? 'Criando…' : 'Criar convite' }}
          </button>
        </form>
        <p v-if="erro" id="convite-erro" role="alert" class="m-0 mt-3 font-semibold text-[var(--danger)]">{{ erro }}</p>

        <p v-if="ultimo && auth.http" class="m-0 mt-4 rounded-xl bg-[var(--brand-ghost)] p-3.5 font-bold" role="status" data-testid="convite-enviado">
          {{ emailEnviado ? `Convite enviado por e-mail para ${ultimo.email}.` : `Convite criado para ${ultimo.email}, mas o e-mail não saiu. Cancele e convide de novo.` }}
        </p>
        <div v-else-if="ultimo" class="mt-4 flex flex-col gap-2 rounded-xl bg-[var(--brand-ghost)] p-3.5" role="status">
          <p class="m-0 font-bold">Convite criado para {{ ultimo.email }}. Envie este link:</p>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input
              :value="linkDe(ultimo)"
              readonly
              aria-label="Link do convite"
              class="min-h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-mono text-[length:var(--fs-label)]"
              data-testid="convite-link"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button
              type="button"
              class="min-h-12 cursor-pointer rounded-xl border-[1.5px] border-[var(--brand)] bg-[var(--paper)] px-5 font-extrabold text-[var(--brand)] hover:bg-[var(--brand-ghost)]"
              data-testid="convite-copiar"
              @click="copiar(ultimo)"
            >
              Copiar link
            </button>
          </div>
        </div>
      </section>

      <section :class="card" aria-labelledby="pendentes-titulo">
        <h2 id="pendentes-titulo" class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-extrabold">
          Convites pendentes ({{ pendentes.length }})
        </h2>
        <p v-if="!pendentes.length" class="m-0 text-[var(--ink-soft)]">Nenhum convite aguardando resposta.</p>
        <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="c in pendentes"
            :key="c.token"
            class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] p-3"
            data-testid="convite-pendente"
          >
            <div class="min-w-0">
              <strong class="break-all">{{ c.email }}</strong>
              <div class="text-[length:var(--fs-label)] text-[var(--ink-soft)]">
                {{ PERFIS[c.perfil].nome }} · convidado por {{ c.criadoPor }} · expira em {{ quando(c.expiraEm) }}
              </div>
            </div>
            <div class="flex gap-2">
              <button
                v-if="!auth.http"
                type="button"
                class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--line-2)] bg-[var(--paper)] px-3.5 font-bold hover:bg-[var(--brand-ghost)]"
                @click="copiar(c)"
              >
                Copiar link
              </button>
              <button
                type="button"
                class="min-h-11 cursor-pointer rounded-[10px] border border-[var(--danger-line)] bg-[var(--paper)] px-3.5 font-bold text-[var(--danger)] hover:bg-[var(--danger-ghost)]"
                :aria-label="`Cancelar convite de ${c.email}`"
                data-testid="convite-revogar"
                @click="revogar(c)"
              >
                Cancelar
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section :class="card" aria-labelledby="usuarios-titulo">
        <h2 id="usuarios-titulo" class="m-0 mb-3 text-[length:var(--fs-title-sm)] font-extrabold">
          Usuários ({{ contas.length }})
        </h2>
        <p v-if="!contas.length" class="m-0 text-[var(--ink-soft)]">Nenhuma conta criada ainda.</p>
        <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="u in contas"
            :key="u.email"
            class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] p-3"
          >
            <div class="min-w-0">
              <strong>{{ u.nome }}</strong>
              <div class="text-[length:var(--fs-label)] break-all text-[var(--ink-soft)]">{{ u.email }}</div>
            </div>
            <span
              class="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[length:var(--fs-caption)] font-bold text-[var(--ink-soft)]"
            >
              {{ PERFIS[u.perfil].nome }}
            </span>
          </li>
        </ul>
      </section>

      <GestaoMatrizPermissoes v-if="caps?.admin" />
    </template>
  </div>
</template>
