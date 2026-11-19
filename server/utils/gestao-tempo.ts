import { agoraNoFuso } from '~~/layers/gestao/domain/fuso'

/**
 * Relógio do servidor no fuso do painel (ver `layers/gestao/domain/fuso.ts`).
 * O servidor roda em UTC; as funções do domínio formatam com getters locais.
 * Alternativa descartada: definir `TZ` no deploy — vale para o processo todo,
 * inclusive o que não é do gestão.
 */
export const agoraBrasil = (agora: Date = new Date()): Date => agoraNoFuso(agora)
