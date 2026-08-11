<script setup lang="ts">
definePageMeta({ layout: false })

const { user, init, signIn } = useAdminAuth()
const tenant = useTenant()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

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
      <div class="brand" style="margin-bottom: 6px">
        <span class="mark"><AppIcon name="home" /></span>
        <span><b>{{ tenant?.name || 'Painel' }}</b><small>Área administrativa</small></span>
      </div>
      <h1 style="font-size: 22px; margin: 6px 0 14px">Entrar no painel</h1>

      <label class="admin-label" for="email">E-mail</label>
      <input id="email" v-model="email" class="admin-input" type="email" autocomplete="email" required />

      <label class="admin-label" for="pass" style="margin-top: 12px">Senha</label>
      <input id="pass" v-model="password" class="admin-input" type="password" autocomplete="current-password" required />

      <p v-if="error" style="color: #b91c1c; font-size: 13px; margin: 10px 0 0">{{ error }}</p>

      <button class="admin-btn" type="submit" style="margin-top: 16px; width: 100%" :disabled="loading">
        {{ loading ? 'Entrando...' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 18px;
  background: var(--surface);
}
.login-card {
  width: 100%;
  max-width: 380px;
}
</style>
