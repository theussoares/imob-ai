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
definePageMeta({ layout: 'portal' })

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
  <div class="rec-wrap">
    <div class="rec-card">
      <h1>Recuperar senha</h1>

      <div v-if="enviado">
        <p class="muted">
          Se houver uma conta com esse e-mail, enviamos um link para criar
          uma nova senha. Verifique também a caixa de spam.
        </p>
        <NuxtLink to="/area-cliente/login" class="link">Voltar para o login</NuxtLink>
      </div>

      <form v-else @submit.prevent="enviar">
        <p class="muted">
          Informe o e-mail cadastrado e enviaremos um link para criar uma nova
          senha.
        </p>

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

        <p v-if="error" class="erro" role="alert">{{ error }}</p>

        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? 'Enviando…' : 'Enviar link' }}
        </button>

        <NuxtLink to="/area-cliente/login" class="link">Voltar para o login</NuxtLink>
      </form>
    </div>
  </div>
</template>

<style scoped>
.rec-wrap {
  display: grid;
  place-items: center;
  padding: 18px 0 40px;
}
.rec-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: var(--r-md);
  padding: 22px 20px;
}
h1 {
  font-size: var(--fs-title);
  margin: 0 0 12px;
}
.muted {
  font-size: var(--fs-label);
  color: #6b7280;
  margin: 0 0 14px;
}
.lbl {
  display: block;
  font-size: var(--fs-label);
  font-weight: 600;
  margin-bottom: 5px;
}
.inp {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: var(--r-sm);
  font-size: var(--fs-body);
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
  font-size: var(--fs-label);
  margin: 0 0 12px;
}
.btn {
  width: 100%;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--brand);
  color: #fff;
  font-size: var(--fs-body);
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
  font-size: var(--fs-label);
  color: #4b5563;
}
</style>
