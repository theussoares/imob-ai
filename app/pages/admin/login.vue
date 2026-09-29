<script setup lang="ts">
definePageMeta({ layout: false })

const { user, init, signIn, signOut } = useAdminAuth()
const tenant = useTenant()
const route = useRoute()
// O painel roda em `painel.<domínio>`, que só serve /admin: o link para a Área
// do Cliente precisa do host público (ver usePublicSiteUrl).
const siteUrl = usePublicSiteUrl()

const email = ref('')
const password = ref('')
const loading = ref(false)
const SEM_ACESSO = 'Esta conta não tem acesso ao painel desta imobiliária — o acesso pode ter sido removido. Fale com o responsável pela imobiliária.'
const error = ref(route.query.erro === 'sem-acesso' ? SEM_ACESSO : '')
// A mesma tela recebe `?erro=sem-acesso` depois de já montada (o middleware
// redireciona para cá): sem o watch, o aviso não aparecia — o usuário removido
// tentava entrar e nada acontecia (teste de 27/09, MELHORIA 10).
watch(() => route.query.erro, (e) => {
  if (e === 'sem-acesso') error.value = SEM_ACESSO
})

onMounted(async () => {
  if (user.value === null) await init()
  if (user.value) navigateTo('/admin')
})

async function login() {
  loading.value = true
  error.value = ''
  try {
    await signIn(email.value.trim(), password.value)
    // Senha certa, mas sem vínculo com esta imobiliária: dizer aqui, em vez de
    // deixar o middleware devolver à mesma tela em silêncio.
    if (tenant.value && !(await isMemberOfTenant(tenant.value.id))) {
      await signOut()
      error.value = SEM_ACESSO
      return
    }
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
  <PainelAuthShell>
    <form @submit.prevent="login">
      <!-- O rótulo separa esta porta da Área do Cliente, que tem a mesma
           moldura: um inquilino que caísse aqui precisa perceber antes de
           digitar a senha. -->
      <span class="pa-rotulo"><AppIcon name="key" /> Acesso da equipe</span>
      <h1>Entrar no painel</h1>
      <p class="pa-sub">Use o e-mail e a senha do seu convite.</p>

      <label class="pa-lbl" for="email">E-mail</label>
      <div class="pa-campo">
        <AppIcon name="mail" class="pa-campo-ic" />
        <input
          id="email"
          v-model="email"
          class="pa-inp"
          type="email"
          inputmode="email"
          autocomplete="username"
          autocapitalize="off"
          placeholder="Digite seu e-mail"
          required
        >
      </div>

      <label class="pa-lbl" for="pass">Senha</label>
      <AuthPasswordField id="pass" v-model="password" autocomplete="current-password" placeholder="Digite sua senha" />

      <div class="pa-linha-direita">
        <NuxtLink to="/admin/recuperar-senha" class="pa-link">Esqueci minha senha</NuxtLink>
      </div>

      <!-- role="alert": o erro aparece junto do botão que a pessoa acabou de
           apertar, e sem o anúncio o leitor de tela não dizia que falhou. -->
      <p v-if="error" class="pa-erro" role="alert">{{ error }}</p>

      <button class="pa-btn" type="submit" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
        <AppIcon v-if="!loading" name="arrow-right" />
      </button>

      <div class="pa-divisor">É inquilino ou proprietário?</div>
      <div class="pa-caixa">
        <p>Seus contratos e documentos ficam na Área do Cliente.</p>
        <a :href="`${siteUrl}area-cliente/login`" class="pa-link">Ir para a Área do Cliente</a>
      </div>
    </form>

    <!-- Aqui, e não só na sidebar: esta é a tela em que a pessoa cai ao digitar
         o endereço do painel no celular, e é o momento em que faz sentido pôr o
         atalho na tela inicial. Na sidebar ele só existiria depois do login. -->
    <template #depois>
      <div class="login-instalar">
        <AdminInstallButton />
      </div>
    </template>
  </PainelAuthShell>
</template>

<style scoped>
/* Discreto de propósito: entrar é o que a pessoa veio fazer; instalar é
   oferta. */
.login-instalar {
  margin-top: 10px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
.login-instalar :deep(.instalar) {
  width: auto;
  margin: 0 auto;
  padding: 6px 10px;
  text-align: center;
  font-weight: 600;
}
</style>
