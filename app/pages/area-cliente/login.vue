<script setup lang="ts">
/**
 * Porta de entrada do cliente.
 *
 * Sem o middleware `portal`: quem chega aqui normalmente NÃO tem sessão, e
 * proteger a própria tela de login criaria um laço de redirect.
 */
definePageMeta({ layout: 'portal' })

const { user, init, signIn, signOut } = usePortalAuth()
const tenant = useTenant()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)

/**
 * As mensagens dizem o que FAZER, não o que falhou.
 *
 * "Erro ao autenticar" depois de uma senha que estava certa é o que faz o
 * inquilino ligar para a imobiliária — e a imobiliária ligar para nós. Os dois
 * casos abaixo vêm do middleware, que já sabe qual é qual.
 */
type MotivoLogin = 'nao-e-cliente' | 'desativado' | 'sessao'

const MENSAGENS: Record<MotivoLogin, string> = {
  'nao-e-cliente':
    'Esta conta não tem área do cliente nesta imobiliária. Se você é da equipe, entre pelo painel administrativo.',
  desativado:
    'Seu acesso está desativado. Fale com a imobiliária para reativar.',
  sessao:
    'Sua sessão expirou. Entre novamente para continuar.',
}
const error = ref(MENSAGENS[String(route.query.erro || '') as MotivoLogin] || '')

onMounted(async () => {
  if (user.value === null) await init()
  if (user.value) navigateTo('/area-cliente')
})

async function entrar() {
  loading.value = true
  error.value = ''
  try {
    await signIn(email.value.trim(), password.value)

    // Entrar no Auth não é entrar no portal: a conta pode ser de um membro do
    // painel, de outra imobiliária, ou estar desativada. Conferir AQUI é o que
    // permite dizer o motivo — se deixássemos para o middleware, a pessoa veria
    // a tela piscar e voltar sem explicação.
    const negado = tenant.value ? await portalAccessDenial(tenant.value.id) : null
    if (negado) {
      await signOut()
      error.value = MENSAGENS[negado]
      return
    }

    await navigateTo('/area-cliente')
  } catch {
    error.value = 'E-mail ou senha incorretos. Confira e tente de novo.'
  } finally {
    loading.value = false
  }
}

useHead({
  title: `Entrar · Área do Cliente${tenant.value?.name ? ' · ' + tenant.value.name : ''}`,
  // A área do cliente não é conteúdo de catálogo e não deve ser indexada.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="entrar-wrap">
    <form class="entrar-card" @submit.prevent="entrar">
      <h1>Entrar</h1>
      <p class="sub">Acesse seus contratos e documentos.</p>

      <label class="lbl" for="email">E-mail</label>
      <input
        id="email"
        v-model="email"
        class="inp"
        type="email"
        autocomplete="email"
        inputmode="email"
        required
      >

      <label class="lbl" for="senha">Senha</label>
      <input
        id="senha"
        v-model="password"
        class="inp"
        type="password"
        autocomplete="current-password"
        required
      >

      <p v-if="error" class="erro" role="alert">{{ error }}</p>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>

      <NuxtLink to="/area-cliente/recuperar-senha" class="link">Esqueci minha senha</NuxtLink>
    </form>
  </div>
</template>

<style scoped>
.entrar-wrap {
  display: grid;
  place-items: center;
  padding: 18px 0 40px;
}
.entrar-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 22px 20px;
}
h1 {
  font-size: 21px;
  margin: 0;
}
.sub {
  margin: 5px 0 18px;
  font-size: 13px;
  color: #6b7280;
}
.lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
}
.inp {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  /* 16px evita o zoom automático do iOS ao focar o campo — o portal é usado
     majoritariamente no celular. */
  font-size: 16px;
  padding: 11px 12px;
  margin-bottom: 14px;
  background: #fff;
}
.inp:focus {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
.erro {
  color: #b91c1c;
  font-size: 13px;
  margin: 0 0 12px;
}
.btn {
  width: 100%;
  border: 0;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.link {
  display: block;
  text-align: center;
  margin-top: 14px;
  font-size: 13px;
  color: #4b5563;
}
</style>
