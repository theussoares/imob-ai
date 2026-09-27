<script setup lang="ts">
/**
 * "Esqueci minha senha" do painel (MELHORIA 03).
 *
 * Passa pelo servidor (`/api/painel/recuperar-senha`), e não por
 * `resetPasswordForEmail` no navegador, pelo mesmo motivo do portal: o SMTP do
 * Supabase tem um remetente global, e o e-mail precisa sair com o nome da
 * imobiliária — é o que a pessoa reconhece na caixa de entrada.
 */
definePageMeta({ layout: false })

const tenant = useTenant()
const email = ref('')
const loading = ref(false)
const enviado = ref(false)

async function enviar() {
  loading.value = true
  try {
    await $fetch('/api/painel/recuperar-senha', { method: 'POST', body: { email: email.value.trim() } })
  } catch {
    // Silêncio proposital: a resposta é a mesma exista ou não a conta.
  } finally {
    // Dizer "este e-mail não é da equipe" faria desta tela um verificador de
    // quem trabalha na imobiliária.
    enviado.value = true
    loading.value = false
  }
}

useHead({
  title: 'Recuperar senha · Painel',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div class="rec-wrap">
    <form class="admin-card rec-card" @submit.prevent="enviar">
      <div class="brand sem-logo" style="margin-bottom: 6px">
        <span class="mark"><AppIcon name="home" /></span>
        <span><b>{{ tenant?.name || 'Painel' }}</b><small>Área administrativa</small></span>
      </div>
      <h1 style="font-size: 22px; margin: 22px 0 12px">Recuperar senha do painel</h1>

      <template v-if="enviado">
        <p class="muted" role="status">
          Se esse e-mail tiver acesso ao painel, enviamos um link para criar uma
          nova senha. Confira também o spam. O link vale uma vez só e por pouco
          tempo.
        </p>
        <NuxtLink to="/admin/login" class="voltar">Voltar para o login</NuxtLink>
      </template>

      <template v-else>
        <p class="muted">Informe o e-mail que você usa para entrar no painel.</p>
        <label class="admin-label" for="email">E-mail</label>
        <input id="email" v-model="email" class="admin-input" type="email" inputmode="email" autocomplete="username" autocapitalize="off" required />
        <button class="admin-btn" type="submit" style="margin-top: 16px; width: 100%" :disabled="loading">
          {{ loading ? 'Enviando...' : 'Enviar link' }}
        </button>
        <NuxtLink to="/admin/login" class="voltar">Voltar para o login</NuxtLink>
      </template>
    </form>
  </div>
</template>

<style scoped>
.rec-wrap {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 18px;
  background: var(--surface);
}
.rec-card {
  width: 100%;
  max-width: 380px;
}
.muted {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin: 0 0 14px;
}
.voltar {
  display: block;
  margin-top: 12px;
  text-align: center;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
</style>
