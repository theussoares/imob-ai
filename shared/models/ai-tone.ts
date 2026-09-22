/**
 * Tom da descrição gerada por IA, por imobiliária.
 *
 * Lista fechada e não texto livre: um campo aberto aqui é instrução do cliente
 * indo direto para o prompt, e o resultado ruim aparece no site DELE, não numa
 * tela nossa. Três valores cobrem o que uma imobiliária realmente pede; um
 * quarto é uma linha.
 *
 * Sem acento nos valores — eles vão para o banco e para comparação. O acento
 * mora no rótulo, que é o que a pessoa vê.
 */
export const AI_TONES = ['sobrio', 'caloroso', 'alto_padrao'] as const
export type AiTone = (typeof AI_TONES)[number]

export const AI_TONE_LABELS: Record<AiTone, string> = {
  sobrio: 'Sóbrio',
  caloroso: 'Caloroso',
  alto_padrao: 'Alto padrão',
}

/** O que cada tom vira dentro do system prompt. Fonte única: mudar aqui muda a saída. */
export const AI_TONE_INSTRUCOES: Record<AiTone, string> = {
  sobrio: 'Tom sóbrio e direto. Frases curtas, sem adjetivo de venda.',
  caloroso: 'Tom caloroso e acolhedor, falando do viver no imóvel. Sem exagero.',
  alto_padrao: 'Tom sofisticado e contido. Elegância por precisão, nunca por superlativo.',
}

/**
 * Normaliza o que veio do banco ou do formulário.
 *
 * Existe porque a `check` do Postgres não é garantia suficiente: escrita manual
 * no SQL Editor e migration mal aplicada já contornaram constraint neste
 * repositório. Sem este piso, um valor desconhecido viraria instrução de tom
 * vazia no prompt — e o defeito apareceria como "o texto ficou estranho",
 * que ninguém liga à coluna.
 */
export function tomValido(v: unknown): AiTone {
  return (AI_TONES as readonly unknown[]).includes(v) ? (v as AiTone) : 'sobrio'
}
