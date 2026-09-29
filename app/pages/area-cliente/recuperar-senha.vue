<script setup lang="ts">
/**
 * Recuperação de senha do cliente.
 *
 * O envio passa pelo servidor (`/api/portal/recuperar-senha`), e não por
 * `resetPasswordForEmail` no navegador, porque o SMTP do Supabase tem um
 * remetente global por projeto — o cliente veria um nome só, igual para todas as
 * imobiliárias. Pelo servidor, o e-mail sai com o nome desta imobiliária e o
 * Reply-To dela.
 */
// Mesma moldura do login (`PortalAuthShell`), sem o layout do portal.
definePageMeta({ layout: false })

const email = ref('')
const loading = ref(false)
const enviado = ref(false)
const error = ref('')

async function enviar() {
  loading.value = true
  error.value = ''
  try {
    // Chama o NOSSO endpoint, não `resetPasswordForEmail` direto: aquele faz o
    // Supabase enviar, com o remetente global do projeto. Pelo servidor o
    // e-mail sai com o nome e o Reply-To desta imobiliária.
    await $fetch('/api/portal/recuperar-senha', {
      method: 'POST',
      body: { email: email.value.trim() },
    })
  } catch {
    // Silêncio proposital sobre a causa — ver a mensagem abaixo.
  } finally {
    // A resposta é a MESMA para e-mail cadastrado e não cadastrado. Dizer "este
    // e-mail não existe" transformaria esta tela num verificador de quem é
    // cliente desta imobiliária, para qualquer um que abrisse a página.
    enviado.value = true
    loading.value = false
  }
}

useHead({
  title: 'Recuperar senha · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <PortalAuthShell>
    <div v-if="enviado" role="status">
      <h1>Confira seu e-mail</h1>
      <p class="pa-sub">O link para criar uma nova senha está a caminho.</p>
      <div class="pa-caixa destaque">
        <p>
          Se houver uma conta com esse e-mail, enviamos um link para criar uma
          nova senha. Verifique também a caixa de spam.
        </p>
        <p style="margin: 0">O link vale uma vez só e por pouco tempo.</p>
      </div>
      <p class="pa-voltar">
        <NuxtLink to="/area-cliente/login" class="pa-link">Voltar para o login</NuxtLink>
      </p>
    </div>

    <form v-else novalidate @submit.prevent="enviar">
      <h1>Recuperar senha</h1>
      <p class="pa-sub">Informe o e-mail cadastrado e enviaremos um link para você criar uma nova senha.</p>

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

      <p v-if="error" class="pa-erro" role="alert">{{ error }}</p>

      <button class="pa-btn" type="submit" :disabled="loading">
        {{ loading ? 'Enviando…' : 'Enviar link' }}
        <AppIcon v-if="!loading" name="arrow-right" />
      </button>

      <p class="pa-voltar">
        <NuxtLink to="/area-cliente/login" class="pa-link">Voltar para o login</NuxtLink>
      </p>
    </form>
  </PortalAuthShell>
</template>
