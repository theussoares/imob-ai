<script setup lang="ts">
/**
 * Entrada da Área do Cliente.
 *
 * Tela funcional, com as cores do tenant. O acabamento (logo, estados vazios,
 * mobile fino) é o card 2.1 — aqui o que importa é o fluxo funcionar de ponta a
 * ponta.
 */
definePageMeta({ layout: false });

const tenant = useTenant();
const route = useRoute();
const { signIn, init, user, loadMe } = usePortalAuth();

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");
const modo = ref<"login" | "recuperar">("login");
const enviado = ref(false);

// Quem chega com ?erro=sem-acesso foi recusado pelo servidor. A mensagem não
// especula o motivo (não é cliente, está desativado, plano suspenso) porque o
// motivo é assunto da imobiliária, não de quem está na tela.
if (route.query.erro === "sem-acesso") {
  error.value =
    "Esta conta não tem acesso à área do cliente desta imobiliária. Fale com a imobiliária.";
}

onMounted(async () => {
  await init();
  // Já logado e com acesso: não faz sentido mostrar o formulário.
  if (user.value && (await loadMe())) await navigateTo("/area-cliente");
});

async function entrar() {
  error.value = "";
  loading.value = true;
  try {
    await signIn(email.value.trim(), password.value);
    const me = await loadMe();
    if (!me) {
      error.value =
        "Esta conta não tem acesso à área do cliente desta imobiliária. Fale com a imobiliária.";
      return;
    }
    await navigateTo("/area-cliente");
  } catch {
    // Mensagem única para senha errada e e-mail inexistente, de propósito:
    // diferenciar os dois diz a um estranho quais e-mails existem na base.
    error.value = "E-mail ou senha incorretos.";
  } finally {
    loading.value = false;
  }
}

async function recuperar() {
  error.value = "";
  loading.value = true;
  try {
    const { resetPassword } = usePortalAuth();
    await resetPassword(email.value);
    enviado.value = true;
  } catch {
    // Também não revela se o e-mail existe.
    enviado.value = true;
  } finally {
    loading.value = false;
  }
}

useSeoMeta({
  title: () => `Área do cliente — ${tenant.value?.name || ""}`,
  robots: "noindex, nofollow",
});
</script>

<template>
  <main class="pc-wrap">
    <section class="pc-card">
      <h1>Área do cliente</h1>
      <p class="pc-sub">{{ tenant?.name }}</p>

      <template v-if="modo === 'login'">
        <form @submit.prevent="entrar">
          <label for="pc-email">E-mail</label>
          <input
            id="pc-email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
          />

          <label for="pc-senha">Senha</label>
          <input
            id="pc-senha"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />

          <p v-if="error" class="pc-erro">{{ error }}</p>

          <button type="submit" :disabled="loading">
            {{ loading ? "Entrando…" : "Entrar" }}
          </button>
        </form>
        <button
          type="button"
          class="pc-link"
          @click="
            modo = 'recuperar';
            error = '';
          "
        >
          Esqueci minha senha
        </button>
      </template>

      <template v-else>
        <p v-if="enviado" class="pc-ok">
          Se este e-mail estiver cadastrado, você vai receber um link para criar
          uma nova senha.
        </p>
        <form v-else @submit.prevent="recuperar">
          <label for="pc-email-rec">E-mail</label>
          <input
            id="pc-email-rec"
            v-model="email"
            type="email"
            autocomplete="username"
            required
          />
          <button type="submit" :disabled="loading">
            {{ loading ? "Enviando…" : "Enviar link" }}
          </button>
        </form>
        <button
          type="button"
          class="pc-link"
          @click="
            modo = 'login';
            enviado = false;
          "
        >
          Voltar para o login
        </button>
      </template>
    </section>
  </main>
</template>

<style scoped>
.pc-wrap {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--brand) 6%, white);
}
.pc-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
h1 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--brand);
}
.pc-sub {
  margin: 4px 0 22px;
  color: #5c6b67;
  font-size: 0.95rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
label {
  font-size: 0.85rem;
  font-weight: 600;
}
input {
  padding: 11px 12px;
  border: 1px solid #d8e0dc;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 10px;
}
input:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
button[type="submit"] {
  margin-top: 8px;
  padding: 12px;
  border: 0;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: default;
}
.pc-link {
  margin-top: 14px;
  background: none;
  border: 0;
  padding: 0;
  color: var(--brand);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}
.pc-erro {
  margin: 4px 0 0;
  color: #b03d0c;
  font-size: 0.9rem;
}
.pc-ok {
  color: #2f6f4f;
  font-size: 0.95rem;
}
</style>
