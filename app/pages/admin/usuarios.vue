<script setup lang="ts">
import type { MemberView } from "~~/server/repositories/member.repository";

definePageMeta({ layout: "admin", middleware: "admin" });

const toast = useToast();
const { askConfirm } = useConfirm();

const {
  data: members,
  pending,
  refresh,
} = await useAsyncData(
  "admin:members",
  () => adminFetch<MemberView[]>("/api/admin/members"),
  { server: false, default: () => [] as MemberView[] },
);

const email = ref("");
const inviting = ref(false);
const error = ref("");

/**
 * Link do último convite. Fica só na memória desta tela e some ao sair — link de
 * convite é credencial temporária; guardar seria criar uma senha em texto puro
 * com outro nome.
 */
const lastInvite = ref<{ email: string; link: string } | null>(null);
const copied = ref(false);

async function invite() {
  if (!email.value.trim()) {
    error.value = "Informe o e-mail da pessoa.";
    return;
  }
  inviting.value = true;
  error.value = "";
  lastInvite.value = null;
  try {
    const r = await adminFetch<{
      inviteLink: string | null;
      alreadyRegistered: boolean;
      alreadyMember: boolean;
      email: string;
    }>("/api/admin/members", { method: "POST", body: { email: email.value } });

    if (r.alreadyMember) {
      toast.success(`${r.email} já tem acesso a este painel.`);
    } else if (r.alreadyRegistered) {
      // Sem link de propósito: ver a nota de segurança em inviteMember.
      toast.success(
        `${r.email} já tinha conta e foi adicionado. É só entrar pelo login normal, com a senha de sempre.`,
      );
    } else if (r.inviteLink) {
      lastInvite.value = { email: r.email, link: r.inviteLink };
      copied.value = false;
    }
    email.value = "";
    await refresh();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    error.value = err?.data?.statusMessage || "Não foi possível convidar.";
  } finally {
    inviting.value = false;
  }
}

async function copyLink() {
  if (!lastInvite.value) return;
  try {
    await navigator.clipboard.writeText(lastInvite.value.link);
    copied.value = true;
  } catch {
    // Clipboard bloqueado (contexto inseguro, permissão negada): o link está na
    // tela e dá para selecionar à mão — não vale travar o fluxo por isso.
    toast.error("Não consegui copiar. Selecione o link e copie manualmente.");
  }
}

async function revoke(m: MemberView) {
  const ok = await askConfirm({
    title: `Remover o acesso de ${m.email}?`,
    description:
      "A pessoa perde o acesso ao painel imediatamente. Os imóveis e contatos que ela cadastrou continuam.",
    confirmLabel: "Remover acesso",
    danger: true,
  });
  if (!ok) return;
  try {
    await adminFetch(`/api/admin/members/${m.id}`, { method: "DELETE" });
    toast.success("Acesso removido.");
    await refresh();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    toast.error(err?.data?.statusMessage || "Não foi possível remover.");
  }
}

useHead({ title: "Usuários · Painel" });
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Usuários</h1>
        <p class="sub">
          Quem pode entrar no painel da imobiliária. Cada pessoa define a
          própria senha — você nunca precisa saber a senha de ninguém.
        </p>
      </div>
    </div>

    <div class="admin-card">
      <h3 class="section-t">Convidar</h3>
      <div class="invite-row">
        <input
          v-model="email"
          class="admin-input"
          type="email"
          placeholder="email@imobiliaria.com.br"
          @keydown.enter.prevent="invite"
        />
        <button class="admin-btn" :disabled="inviting" @click="invite">
          {{ inviting ? "Gerando..." : "Gerar convite" }}
        </button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>

      <div v-if="lastInvite" class="link-box">
        <p class="link-t">
          Convite de <strong>{{ lastInvite.email }}</strong> — mande este link
          para a pessoa:
        </p>
        <div class="link-row">
          <code class="link">{{ lastInvite.link }}</code>
          <button class="admin-btn sm" @click="copyLink">
            {{ copied ? "Copiado ✓" : "Copiar" }}
          </button>
        </div>
        <p class="link-warn">
          Este link aparece uma única vez e dá acesso ao painel — mande só para
          a pessoa certa. Saindo desta tela ele não volta; se perder, é só gerar
          outro.
        </p>
      </div>
    </div>

    <p v-if="pending" class="admin-card muted-block">Carregando...</p>
    <div v-else class="admin-card list-card">
      <h3 class="section-t">Com acesso ({{ members.length }})</h3>
      <div v-for="m in members" :key="m.id" class="m-row">
        <div class="m-info">
          <strong>{{ m.email }}</strong>
          <span v-if="m.pending" class="badge">Convite pendente</span>
        </div>
        <button class="admin-btn danger sm" @click="revoke(m)">Remover</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.invite-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.invite-row .admin-input {
  flex: 1;
  min-width: 240px;
}
.err {
  color: #b91c1c;
  font-size: 13.5px;
  margin: 8px 0 0;
}
.link-box {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.link-t {
  margin: 0 0 8px;
  font-size: 14px;
  color: #065f46;
}
.link-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.link {
  flex: 1;
  min-width: 220px;
  /* Link longo não pode esticar a página; quebra em qualquer ponto. */
  overflow-wrap: anywhere;
  font-size: 12.5px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
}
.link-warn {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: #92400e;
}
.list-card {
  margin-top: 16px;
}
.m-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid var(--line);
}
.m-row:first-of-type {
  border-top: none;
}
.m-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.m-info strong {
  overflow-wrap: anywhere;
}
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
</style>
