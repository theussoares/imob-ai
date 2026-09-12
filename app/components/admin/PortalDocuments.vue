<script setup lang="ts">
import type {
  ContractPartyRole,
  PortalDocCategory,
  PortalDocument,
} from "~~/shared/models/portal";
import {
  CONTRACT_PARTY_ROLES,
  CONTRACT_ROLE_LABELS,
  PORTAL_DOC_CATEGORIES,
  PORTAL_DOC_LABELS,
} from "~~/shared/models/portal";
import { defaultAudienceFor } from "~~/shared/utils/portal-access";
import {
  extensionOf,
  isAllowedDocExtension,
  portalDocPath,
} from "~~/shared/utils/portal-doc-path";
import { formatBRL, formatDateBR } from "~~/shared/utils/portal-format";

const props = defineProps<{ contractId: string }>();

const tenant = useTenant();
const toast = useToast();
const { askConfirm } = useConfirm();

const {
  data: documents,
  pending,
  refresh,
} = useLazyAsyncData(
  `admin:contract:${props.contractId}:documents`,
  () =>
    adminFetch<PortalDocument[]>(
      `/api/admin/contracts/${props.contractId}/documents`,
    ),
  { server: false, default: () => [] as PortalDocument[] },
);

const form = reactive({
  category: "contrato" as PortalDocCategory,
  title: "",
  competence: "",
  dueOn: "",
  amount: 0,
  audience: [...defaultAudienceFor("contrato")] as ContractPartyRole[],
  publish: false,
});
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const error = ref("");

const { display: amountDisplay, onInput: onAmountInput } = useMoneyInput(
  toRef(form, "amount"),
);

/**
 * Trocar a categoria reescreve o público-alvo pelo default seguro.
 *
 * O default de `defaultAudienceFor` é o lado que não vaza: boleto nasce só para
 * o inquilino, extrato de repasse só para o proprietário. A imobiliária pode
 * ampliar caso a caso logo abaixo — o que ela não pode é herdar sem perceber a
 * audiência da categoria anterior, que é como o extrato do proprietário sairia
 * marcado para o inquilino.
 */
watch(
  () => form.category,
  (nova) => {
    form.audience = [...defaultAudienceFor(nova)];
  },
);

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const escolhido = input.files?.[0] || null;
  file.value = escolhido;
  error.value = "";
  // O título quase sempre é o nome do arquivo sem a extensão. Preencher aqui
  // evita a linha "documento-final-v2" aparecendo para o cliente.
  if (escolhido && !form.title.trim()) {
    form.title = escolhido.name.replace(/\.[^.]+$/, "");
  }
}

function toggleAudience(role: ContractPartyRole) {
  const i = form.audience.indexOf(role);
  if (i === -1) form.audience.push(role);
  else form.audience.splice(i, 1);
}

function reset() {
  form.title = "";
  form.competence = "";
  form.dueOn = "";
  form.amount = 0;
  form.publish = false;
  form.audience = [...defaultAudienceFor(form.category)];
  file.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

async function enviar() {
  const escolhido = file.value;
  if (!escolhido) {
    error.value = "Escolha o arquivo.";
    return;
  }
  const ext = extensionOf(escolhido.name);
  if (!isAllowedDocExtension(ext)) {
    error.value = "Formato não aceito. Envie PDF ou imagem.";
    return;
  }
  if (!form.audience.length) {
    error.value = "Escolha para quem o documento aparece.";
    return;
  }
  const slug = tenant.value?.slug;
  if (!slug) {
    error.value =
      "Não foi possível identificar a imobiliária. Recarregue a página.";
    return;
  }

  uploading.value = true;
  error.value = "";
  const storagePath = portalDocPath(
    slug,
    props.contractId,
    crypto.randomUUID(),
    ext,
  );

  try {
    // O arquivo sobe com o token do MEMBRO, direto do navegador. É o que faz a
    // policy "member upload portal-docs" valer: quem não é desta imobiliária é
    // recusado pelo próprio Storage, sem depender de checagem nossa.
    const client = await getAdminSupabase();
    const { error: upErr } = await client.storage
      .from("portal-docs")
      .upload(storagePath, escolhido, {
        upsert: false,
        contentType: escolhido.type || undefined,
      });
    if (upErr) throw upErr;

    await adminFetch(`/api/admin/contracts/${props.contractId}/documents`, {
      method: "POST",
      body: {
        category: form.category,
        title: form.title,
        competence: form.competence ? `${form.competence}-01` : null,
        dueOn: form.dueOn || null,
        amount: form.amount || null,
        audience: form.audience,
        storagePath,
        mime: escolhido.type || null,
        sizeBytes: escolhido.size,
        publish: form.publish,
      },
    });

    reset();
    await refresh();
    toast.success(
      form.publish ? "Documento publicado." : "Documento salvo como rascunho.",
    );
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    error.value =
      err?.data?.statusMessage || err?.message || "Não foi possível enviar.";
  } finally {
    uploading.value = false;
  }
}

async function togglePublish(d: PortalDocument) {
  const publicando = !d.publishedAt;
  if (!publicando) {
    const ok = await askConfirm({
      title: `Tirar "${d.title}" do ar?`,
      description:
        "O documento some da Área do Cliente na hora. O arquivo continua guardado e pode ser publicado de novo.",
      confirmLabel: "Tirar do ar",
    });
    if (!ok) return;
  }
  try {
    await adminFetch(
      `/api/admin/contracts/${props.contractId}/documents/${d.id}`,
      { method: "PUT", body: { publish: publicando } },
    );
    await refresh();
    toast.success(
      publicando ? "Documento publicado." : "Documento fora do ar.",
    );
  } catch {
    toast.error("Não foi possível mudar a publicação.");
  }
}

async function excluir(d: PortalDocument) {
  const ok = await askConfirm({
    title: `Excluir "${d.title}"?`,
    description:
      "O arquivo é apagado do armazenamento. Não dá para desfazer — se a ideia é só tirar do portal, use “Tirar do ar”.",
    confirmLabel: "Excluir",
    danger: true,
  });
  if (!ok) return;
  try {
    await adminFetch(
      `/api/admin/contracts/${props.contractId}/documents/${d.id}`,
      { method: "DELETE" },
    );
    await refresh();
    toast.success("Documento excluído.");
  } catch {
    toast.error("Não foi possível excluir o documento.");
  }
}

function audienceLabel(audience: ContractPartyRole[]): string {
  return audience.map((r) => CONTRACT_ROLE_LABELS[r]).join(", ");
}

/** "mar/2026" — competência é mês, e ler "01/03/2026" sugere um dia que não existe. */
function competenceLabel(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return "";
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${meses[Number(m[2]) - 1]}/${m[1]}`;
}
</script>

<template>
  <div class="admin-card">
    <h3 class="section-t">
      Documentos
      <small>o cliente só vê depois de publicado</small>
    </h3>

    <p v-if="pending" style="color: var(--ink-soft)">Carregando...</p>
    <ul v-else-if="documents?.length" class="doc-list">
      <li v-for="d in documents" :key="d.id" class="doc">
        <div class="doc-info">
          <div class="doc-top">
            <strong>{{ d.title }}</strong>
            <span class="pill">{{ PORTAL_DOC_LABELS[d.category] }}</span>
            <span v-if="!d.publishedAt" class="pill muted">Rascunho</span>
          </div>
          <div class="doc-meta">
            Para {{ audienceLabel(d.audience) }}
            <template v-if="competenceLabel(d.competence)">
              · {{ competenceLabel(d.competence) }}
            </template>
            <template v-if="d.dueOn">
              · vence {{ formatDateBR(d.dueOn) }}</template
            >
            <template v-if="d.amount"> · {{ formatBRL(d.amount) }}</template>
          </div>
        </div>
        <div class="doc-actions">
          <button
            class="admin-btn ghost sm"
            type="button"
            @click="togglePublish(d)"
          >
            {{ d.publishedAt ? "Tirar do ar" : "Publicar" }}
          </button>
          <button class="admin-btn danger sm" type="button" @click="excluir(d)">
            Excluir
          </button>
        </div>
      </li>
    </ul>
    <p v-else style="color: var(--ink-soft)">
      Nenhum documento ainda. O que for publicado aqui é o que o cliente vê na
      Área do Cliente.
    </p>

    <form class="upload" @submit.prevent="enviar">
      <h4 class="upload-t">Novo documento</h4>
      <div class="form-grid">
        <div>
          <label class="admin-label">Arquivo *</label>
          <input
            ref="fileInput"
            class="admin-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            @change="onFile"
          />
        </div>
        <div>
          <label class="admin-label">Categoria</label>
          <select v-model="form.category" class="admin-select">
            <option v-for="c in PORTAL_DOC_CATEGORIES" :key="c" :value="c">
              {{ PORTAL_DOC_LABELS[c] }}
            </option>
          </select>
        </div>
        <div class="full">
          <label class="admin-label">Título *</label>
          <input
            v-model="form.title"
            class="admin-input"
            placeholder="Contrato assinado"
          />
        </div>
        <div>
          <label class="admin-label">Competência</label>
          <input v-model="form.competence" class="admin-input" type="month" />
        </div>
        <div>
          <label class="admin-label">Vencimento</label>
          <input v-model="form.dueOn" class="admin-input" type="date" />
        </div>
        <div>
          <label class="admin-label">Valor</label>
          <input
            :value="amountDisplay"
            class="admin-input"
            inputmode="numeric"
            placeholder="R$ 1.850"
            @input="onAmountInput"
          />
        </div>
      </div>

      <fieldset class="audience">
        <legend class="admin-label">Quem vê este documento *</legend>
        <label v-for="r in CONTRACT_PARTY_ROLES" :key="r" class="check">
          <input
            type="checkbox"
            :checked="form.audience.includes(r)"
            @change="toggleAudience(r)"
          />
          {{ CONTRACT_ROLE_LABELS[r] }}
        </label>
        <p class="hint">
          Sugerido pela categoria. Boleto e recibo nascem só para o inquilino;
          extrato de repasse, só para o proprietário.
        </p>
      </fieldset>

      <label class="check">
        <input v-model="form.publish" type="checkbox" />
        Publicar agora
      </label>
      <p class="hint">
        Sem marcar, o documento fica como rascunho — no armazenamento, invisível
        para o cliente. Útil para subir o mês inteiro e publicar de uma vez.
      </p>

      <div class="form-actions">
        <button class="admin-btn" type="submit" :disabled="uploading">
          {{ uploading ? "Enviando..." : "Enviar documento" }}
        </button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
.section-t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px;
  margin: 0 0 14px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
/* Legenda do próprio título, em vez de parágrafo abaixo dele: diz a mesma coisa
   sem empurrar o formulário para baixo. */
.section-t small {
  font-family: inherit;
  font-weight: 500;
  font-size: 12px;
  color: var(--ink-soft);
}
.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.doc {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 2px;
  border-bottom: 1px solid var(--line);
}
.doc:last-child {
  border-bottom: none;
}
.doc-info {
  min-width: 0;
}
.doc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.doc-top strong {
  font-size: 15px;
}
.doc-meta {
  color: var(--ink-soft);
  font-size: 13px;
  margin-top: 2px;
}
.doc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.upload {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.upload-t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 14px;
  margin: 0 0 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .form-grid .full {
    grid-column: 1 / -1;
  }
}
.audience {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 16px 0 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}
.audience legend {
  padding: 0 4px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.hint {
  color: var(--ink-soft);
  font-size: 12.5px;
  margin: 6px 0 0;
  flex-basis: 100%;
}
.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin: 10px 0 0;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}
</style>
