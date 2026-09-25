/**
 * Rascunho local de formulário do painel.
 *
 * O aviso de "sair sem salvar" cobre a saída consciente. Não cobre a que a
 * pessoa não escolheu: bateria que acaba, o sistema matando o app instalado em
 * segundo plano, a sessão que expira no meio do cadastro. Para essas, o que
 * salva o trabalho é ter guardado antes.
 *
 * Só para CADASTRO NOVO. Na edição o original está no banco, e um rascunho
 * local de edição brigaria com a trava de edição simultânea (409): a pessoa
 * restauraria por cima de uma versão que outra pessoa já mudou.
 *
 * Validade de 7 dias: um rascunho de mês passado reaparecendo é mais confuso
 * que útil — o imóvel provavelmente já foi cadastrado por outro caminho.
 */

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface FormDraft<T> {
  savedAt: number
  data: T
}

export function draftKey(tenantId: string | null | undefined, form: string): string {
  return `imob-rascunho:${tenantId || 'sem-tenant'}:${form}`
}

export function serializeDraft<T>(data: T, now = Date.now()): string {
  return JSON.stringify({ savedAt: now, data } satisfies FormDraft<T>)
}

/** Lê um rascunho; `null` se não existe, está corrompido ou venceu. */
export function parseDraft<T>(raw: string | null, now = Date.now()): FormDraft<T> | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<FormDraft<T>>
    if (typeof d?.savedAt !== 'number' || d.data === undefined) return null
    if (now - d.savedAt > DRAFT_TTL_MS || d.savedAt > now + 60_000) return null
    return d as FormDraft<T>
  } catch {
    return null
  }
}
