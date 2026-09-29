<script setup lang="ts">
/**
 * Porta de entrada do cliente.
 *
 * Sem o middleware `portal`: quem chega aqui normalmente NÃO tem sessão, e
 * proteger a própria tela de login criaria um laço de redirect.
 */
// Sem layout: a moldura é o `PortalAuthShell`, a tela dividida que login,
// recuperar e definir senha compartilham. O topo do layout `portal` (logo e
// "Sair") não tem o que fazer antes de existir sessão.
definePageMeta({ layout: false })

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
  // Sem o nome da imobiliária aqui: o `titleTemplate` do `app.vue` já o
  // acrescenta a TODO título, e somar os dois rendia "Entrar · Área do Cliente
  // · Aurora Imóveis · Aurora Imóveis" — na aba que o cliente vê ao chegar pelo
  // link do convite, que é o primeiro contato dele com a imobiliária online.
  title: 'Entrar · Área do Cliente',
  // A área do cliente não é conteúdo de catálogo e não deve ser indexada.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <PortalAuthShell>
    <form @submit.prevent="entrar">
      <h1>Acesse sua conta</h1>
      <p class="pa-sub">Bem-vindo de volta! Entre para ver seus contratos e documentos.</p>

      <label class="pa-lbl" for="email">E-mail</label>
      <div class="pa-campo">
        <AppIcon name="mail" class="pa-campo-ic" />
        <input
          id="email"
          v-model="email"
          class="pa-inp"
          type="email"
          autocomplete="username"
          inputmode="email"
          autocapitalize="off"
          placeholder="Digite seu e-mail"
          required
        >
      </div>

      <label class="pa-lbl" for="senha">Senha</label>
      <AuthPasswordField id="senha" v-model="password" autocomplete="current-password" placeholder="Digite sua senha" />

      <div class="pa-linha-direita">
        <NuxtLink to="/area-cliente/recuperar-senha" class="pa-link">Esqueci minha senha</NuxtLink>
      </div>

      <p v-if="error" class="pa-erro" role="alert">{{ error }}</p>

      <button class="pa-btn" type="submit" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
        <AppIcon v-if="!loading" name="arrow-right" />
      </button>

      <div class="pa-divisor">Primeiro acesso?</div>
      <!-- Não existe "criar conta": o acesso nasce do convite que a imobiliária
           manda ao cadastrar o contrato. O caminho de quem perdeu o convite é o
           mesmo link de recuperação — o endpoint aceita qualquer cliente ativo
           da imobiliária, com ou sem senha definida. -->
      <div class="pa-caixa">
        <p>
          O acesso é criado pela {{ tenant?.name || 'imobiliária' }}: abra o link do
          convite que chegou no seu e-mail para definir sua senha.
        </p>
        <NuxtLink to="/area-cliente/recuperar-senha" class="pa-link">Não recebeu ou o link venceu? Peça outro</NuxtLink>
      </div>
    </form>
  </PortalAuthShell>
</template>
