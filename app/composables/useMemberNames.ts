import type { MemberView } from "~~/server/repositories/member.repository";

/**
 * Resolve id de usuário para e-mail, para mostrar quem alterou um registro.
 *
 * `updated_by` guarda o id; o e-mail vive no schema `auth`, fora do alcance do
 * PostgREST. Em vez de uma consulta por registro, busca a lista de membros uma
 * vez — são poucos por imobiliária, e a mesma lista serve a tela inteira.
 *
 * A busca é preguiçosa: quem nunca abre um registro editado não paga por ela.
 */
export function useMemberNames() {
  const cache = useState<Record<string, string>>("member-names", () => ({}));
  const loaded = useState("member-names-loaded", () => false);

  async function load() {
    if (loaded.value) return;
    loaded.value = true;
    try {
      const membros = await adminFetch<MemberView[]>("/api/admin/members");
      cache.value = Object.fromEntries(membros.map((m) => [m.userId, m.email]));
    } catch {
      // Falhar aqui não pode atrapalhar a tela: sem os nomes, o rótulo
      // simplesmente não aparece. Deixar `loaded` como true evita repetir a
      // tentativa a cada card aberto.
    }
  }

  /** E-mail de quem alterou, ou vazio quando não dá para dizer. */
  function nameFor(userId?: string | null): string {
    if (!userId) return "";
    return cache.value[userId] ?? "";
  }

  return { load, nameFor };
}
