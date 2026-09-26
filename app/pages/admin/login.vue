<script setup lang="ts">
definePageMeta({ layout: false })

const { user, init, signIn } = useAdminAuth()
const tenant = useTenant()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref(
  route.query.erro === 'sem-acesso'
    ? 'Sua conta não tem acesso a esta imobiliária. Entre com o usuário desta imobiliária.'
    : '',
)

onMounted(async () => {
  if (user.value === null) await init()
  if (user.value) navigateTo('/admin')
})

async function login() {
  loading.value = true
  error.value = ''
  try {
    await signIn(email.value.trim(), password.value)
    await navigateTo('/admin')
  } catch {
    error.value = 'E-mail ou senha inválidos.'
  } finally {
    loading.value = false
  }
}

useHead({ title: 'Entrar · Painel' })
</script>

<template>
  <div class="login-wrap">
    <form class="admin-card login-card" @submit.prevent="login">
      <!-- `sem-logo`: o selo de 140px com ícone branco sobre fundo transparente
           ficava invisível aqui, o mesmo defeito do cabeçalho do site. -->
      <div class="brand sem-logo" style="margin-bottom: 6px">
        <span class="mark"><AppIcon name="home" /></span>
        <span><b>{{ tenant?.name || 'Painel' }}</b><small>Área administrativa</small></span>
      </div>
      <h1 style="font-size: 22px; margin: 22px 0 16px">Entrar no painel</h1>

      <label class="admin-label" for="email">E-mail</label>
      <input id="email" v-model="email" class="admin-input" type="email" inputmode="email" autocomplete="username" autocapitalize="off" required />

      <label class="admin-label" for="pass" style="margin-top: 12px">Senha</label>
      <AdminPasswordInput id="pass" v-model="password" autocomplete="current-password" />

      <!-- role="alert": o erro aparece abaixo do botão que a pessoa acabou de
           apertar, e sem o anúncio o leitor de tela não dizia que falhou. -->
      <p v-if="error" role="alert" style="color: #b91c1c; font-size: 13px; margin: 10px 0 0">{{ error }}</p>

      <button class="admin-btn" type="submit" style="margin-top: 16px; width: 100%" :disabled="loading">
        {{ loading ? 'Entrando...' : 'Entrar' }}
      </button>
    </form>

    <!-- Aqui, e não só na sidebar: esta é a tela em que a pessoa cai ao digitar
         o endereço do painel no celular, e é o momento em que faz sentido pôr o
         atalho na tela inicial. Na sidebar ele só existiria depois do login. -->
    <div class="login-instalar">
      <AdminInstallButton />
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  /* Flex em coluna, e não grid com `place-items`: o grid dividia a altura em
     duas linhas (cartão e "instalar") e o cartão ficava no alto da tela, não
     no meio. `dvh` para a barra de endereço do celular não empurrar nada. */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 18px;
  background: var(--surface);
}
.login-card {
  width: 100%;
  max-width: 380px;
}
/* Segunda linha do grid, abaixo do cartão. Discreto de propósito: entrar é o
   que a pessoa veio fazer; instalar é oferta. */
.login-instalar {
  width: 100%;
  max-width: 380px;
  margin-top: 14px;
  text-align: center;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
</style>
