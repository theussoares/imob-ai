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
  <PainelAuthShell>
    <div v-if="enviado" role="status">
      <span class="pa-rotulo"><AppIcon name="key" /> Acesso da equipe</span>
      <h1>Confira seu e-mail</h1>
      <p class="pa-sub">O link para criar uma nova senha está a caminho.</p>
      <div class="pa-caixa destaque">
        <p>
          Se esse e-mail tiver acesso ao painel, enviamos um link para criar uma
          nova senha. Confira também o spam.
        </p>
        <p style="margin: 0">O link vale uma vez só e por pouco tempo.</p>
      </div>
      <p class="pa-voltar">
        <NuxtLink to="/admin/login" class="pa-link">Voltar para o login</NuxtLink>
      </p>
    </div>

    <form v-else @submit.prevent="enviar">
      <span class="pa-rotulo"><AppIcon name="key" /> Acesso da equipe</span>
      <h1>Recuperar senha do painel</h1>
      <p class="pa-sub">Informe o e-mail que você usa para entrar no painel.</p>

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

      <button class="pa-btn" type="submit" :disabled="loading">
        {{ loading ? 'Enviando…' : 'Enviar link' }}
        <AppIcon v-if="!loading" name="arrow-right" />
      </button>

      <p class="pa-voltar">
        <NuxtLink to="/admin/login" class="pa-link">Voltar para o login</NuxtLink>
      </p>
    </form>
  </PainelAuthShell>
</template>
