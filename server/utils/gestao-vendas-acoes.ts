import { z } from 'zod'
import {
  concluirEtapa,
  mudarStatus,
  type Ator,
  type Resultado,
  type Estado,
} from '~~/layers/gestao/domain/acoes'
import { arquivarProcesso, restaurarProcesso, salvarAbertura, salvarObservacao } from '~~/layers/gestao/domain/acoes-ciclo'
import {
  marcarAdiantamentoPago,
  registrarAdiantamento,
  removerAdiantamento,
  salvarConferenciaFinal,
  salvarFinanceiro,
  salvarImovel,
  salvarPessoa,
} from '~~/layers/gestao/domain/acoes-processo'
import { aprovarAnaliseFinanceira, devolverAnaliseFinanceira, enviarAnaliseFinanceira } from '~~/layers/gestao/domain/acoes-analise'
import { MOTIVO_MAX } from '~~/layers/gestao/domain/analise-financeira'
import type { Capacidades } from '~~/layers/gestao/domain/permissions'
import { STATUS_VENDA } from '~~/layers/gestao/domain/status'
import type { StatusVenda } from '~~/layers/gestao/domain/types'

/**
 * Mapa `acao → { permissão, Zod, função pura }` das ações de venda.
 *
 * A permissão de cada ação é a MESMA que a tela usa para habilitar o botão
 * (`capacidades()` em permissions.ts, lida em pages/gestao/vendas/[id].vue e
 * GestaoEtapaPainel.vue): o servidor recusa o que a tela já esconde, e o que a
 * tela libera o servidor aceita. Divergir aqui é o jeito de criar um botão que
 * aparece e responde 403, ou pior, um endpoint mais frouxo que a tela.
 *
 * A função recebe `id` do processo (vem da URL, nunca do corpo) e `dados`
 * (corpo, já validado pelo Zod). Ator e data o despachante amarra.
 */

export type FnAcao = (estado: Estado, ator: Ator, quando: string) => Resultado

export interface DefinicaoAcao {
  /** Pode o membro rodar a ação sobre ESTE processo? `false` → 403. */
  permitido: (c: Capacidades, dados: never) => boolean
  schema: z.ZodType
  fn: (id: string, dados: never) => FnAcao
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const texto = z.string().max(500)
const pessoaAbertura = z.object({ nome: texto, cpf: texto })

const vazio = z.object({}).strict()

const def = <S extends z.ZodType>(d: {
  permitido: (c: Capacidades, dados: z.infer<S>) => boolean
  schema: S
  fn: (id: string, dados: z.infer<S>) => FnAcao
}): DefinicaoAcao => d as unknown as DefinicaoAcao

export const ACOES_VENDA = {
  // Mesmo critério da tela (`podeMudarStatus`): editar OU jurídico.
  mudarStatus: def({
    permitido: (c) => c.editar || c.juridico,
    schema: z.object({ status: z.enum(STATUS_VENDA as [StatusVenda, ...StatusVenda[]]) }),
    fn: (id, d) => (e, a, q) => mudarStatus(e, id, d.status, a, q),
  }),
  // Etapas 6 e 7 têm dono próprio (recepção / jurídico), como `podeNaEtapa` na tela.
  concluirEtapa: def({
    permitido: (c, d) => (d.etapa === 6 ? c.conferir : d.etapa === 7 ? c.juridico : c.editar),
    schema: z.object({ etapa: z.number().int().min(1).max(8) }),
    fn: (id, d) => (e, a, q) => concluirEtapa(e, id, d.etapa, a, q),
  }),
  salvarAbertura: def({
    permitido: (c) => c.editar,
    schema: z.object({
      vendedor: pessoaAbertura,
      comprador: pessoaAbertura,
      imovel: texto,
      corretorId: z.string().max(64),
      captadorId: z.string().max(64),
      preliminar: z.object({ existe: z.boolean(), arquivo: texto.nullable() }),
    }),
    fn: (id, d) => (e, a, q) => salvarAbertura(e, id, d, a, q),
  }),
  // Observações são da etapa 7, do jurídico (`podeNaEtapa(7)`).
  salvarObservacao: def({
    permitido: (c) => c.juridico,
    schema: z.object({ obs: z.string().max(5000) }),
    fn: (id, d) => (e, a, q) => salvarObservacao(e, id, d.obs, a, q),
  }),
  arquivarProcesso: def({
    permitido: (c) => c.arquivar,
    schema: vazio,
    fn: (id) => (e, a, q) => arquivarProcesso(e, id, a, q),
  }),
  restaurarProcesso: def({
    permitido: (c) => c.arquivar,
    schema: vazio,
    fn: (id) => (e, a, q) => restaurarProcesso(e, id, a, q),
  }),
  // A aba de comissão é de quem edita o financeiro (`editarFinanceiro` na tela): `valores`, ou o corretor do
  // processo (`financeiroLivre`) enquanto a análise não foi enviada ou foi devolvida.
  registrarAdiantamento: def({
    permitido: (c) => c.editarFinanceiro,
    schema: z.object({
      resp: z.enum(['vendedor', 'captador', 'imob']),
      valor: z.number().finite(),
      data,
      momento: z.enum(['adiantamento', 'fim-contrato']).optional(),
      pago: z.boolean().optional(),
      comprovante: texto.nullable().optional(),
    }),
    fn: (id, d) => (e, a, q) => registrarAdiantamento(e, id, d, a, q),
  }),
  marcarAdiantamentoPago: def({
    permitido: (c) => c.editarFinanceiro,
    schema: z.object({ adiantamentoId: z.string().max(32), comprovante: texto.nullable().optional() }),
    fn: (id, d) => (e, a, q) => marcarAdiantamentoPago(e, id, d.adiantamentoId, d, a, q),
  }),
  removerAdiantamento: def({
    permitido: (c) => c.editarFinanceiro,
    schema: z.object({ adiantamentoId: z.string().max(32) }),
    fn: (id, d) => (e, a, q) => removerAdiantamento(e, id, d.adiantamentoId, a, q),
  }),
  // Checklist comercial (etapa 5): grava valor e fontes, então exige editar E poder editar o financeiro.
  salvarFinanceiro: def({
    permitido: (c) => c.editar && c.editarFinanceiro,
    schema: z.object({
      valor: z.number().finite(),
      fin: z.object({
        forma: z.enum(['À vista', 'Financiamento', 'Misto']),
        financiado: z.number().finite(),
        entrada: z.number().finite(),
        fgts: z.number().finite(),
        proprios: z.number().finite(),
        avaliacao: z.number().finite().optional(),
        ganho: z.enum(['Isento', 'Há ganho de capital', 'Ainda não analisado']).optional(),
        bem: texto.optional(),
        valorBem: z.number().finite().optional(),
      }),
    }),
    fn: (id, d) => (e, a, q) => salvarFinanceiro(e, id, d, a, q),
  }),
  // Análise do financeiro: quem edita envia; só `valores` aprova ou devolve (e não o próprio corretor).
  enviarAnaliseFinanceira: def({
    permitido: (c) => c.editarFinanceiro,
    schema: vazio,
    fn: (id) => (e, a, q) => enviarAnaliseFinanceira(e, id, a, q),
  }),
  aprovarAnaliseFinanceira: def({
    permitido: (c) => c.valores,
    schema: vazio,
    fn: (id) => (e, a, q) => aprovarAnaliseFinanceira(e, id, a, q),
  }),
  devolverAnaliseFinanceira: def({
    permitido: (c) => c.valores,
    schema: z.object({ motivo: z.string().max(MOTIVO_MAX) }),
    fn: (id, d) => (e, a, q) => devolverAnaliseFinanceira(e, id, d.motivo, a, q),
  }),
  salvarPessoa: def({
    permitido: (c) => c.editar,
    schema: z.object({ quem: z.enum(['vendedor', 'comprador']), cpf: texto, telefone: texto, email: texto }),
    fn: (id, d) => (e, a, q) => salvarPessoa(e, id, d.quem, { cpf: d.cpf, telefone: d.telefone, email: d.email }, a, q),
  }),
  salvarImovel: def({
    permitido: (c) => c.editar,
    schema: z.object({ matriculaMae: z.boolean(), valorVenal: z.number().finite() }),
    fn: (id, d) => (e, a, q) => salvarImovel(e, id, d, a, q),
  }),
  // Conferência final é a etapa 6, da recepção (`podeNaEtapa(6)`).
  salvarConferenciaFinal: def({
    permitido: (c) => c.conferir,
    schema: z.object({
      documentacao: z.boolean(),
      valores: z.boolean(),
      comissao: z.boolean(),
      encaminhado: z.boolean(),
      responsavel: texto,
      data,
    }),
    fn: (id, d) => (e, a, q) => salvarConferenciaFinal(e, id, d, a, q),
  }),
} satisfies Record<string, DefinicaoAcao>

export type NomeAcaoVenda = keyof typeof ACOES_VENDA

export const nomeAcaoValido = (n: unknown): n is NomeAcaoVenda =>
  typeof n === 'string' && Object.prototype.hasOwnProperty.call(ACOES_VENDA, n)
