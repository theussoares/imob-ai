import { z } from 'zod'
import * as acoes from '~~/layers/gestao/domain/acoes-locacao'
import type { Ator, Estado, Resultado } from '~~/layers/gestao/domain/acoes'
import { MOTIVO_MAX } from '~~/layers/gestao/domain/analise-financeira'
import type { Capacidades } from '~~/layers/gestao/domain/permissions'
import type { ContratoLocacao, Locacao, MatrizPermissoes, PermChave, Perfil } from '~~/layers/gestao/domain/types'
import { pessoaSchema, vistoriaSchema } from '~~/server/mappers/gestao-locacao'

/**
 * Mapa `acao -> { permissão, Zod, função pura }` do despachante de locação.
 *
 * É o espelho server-side dos botões da tela (`pages/gestao/locacao/[id].vue`): a
 * permissão de cada ação é a MESMA que a tela usa para mostrar o botão, para o
 * servidor não ser mais frouxo nem mais rígido que a interface.
 *
 * O Zod aqui descarta chave desconhecida (comportamento padrão do `z.object`):
 * o corpo nunca consegue injetar `status`, `etapa`, `arquivado` ou `tenantId` no
 * agregado — só entram os campos que cada ação declara.
 */

type Fn<D> = (estado: Estado, id: string, d: D, ator: Ator, quando: string) => Resultado

export interface DefAcao<D = unknown> {
  /**
   * Basta UMA das permissões (a tela usa `editar || valores` em renovar/encerrar).
   * Recebe os dados porque a etapa 7 de «concluir» é do financeiro, as outras da edição.
   */
  permissao: (d: D) => PermChave[]
  /**
   * Regra fina, conferida depois de carregar a locação: o `proprio` e o estado da análise dependem dela.
   * `permissao` segue como porta de entrada (403 antes de tocar no banco) e este é o critério que vale.
   */
  permitido?: (c: Capacidades, d: D) => boolean
  schema: z.ZodType<D>
  fn: Fn<D>
  /** Ações que mexem em corretor/imóvel validam o vínculo no tenant (ver serviço). */
  tocaVinculos?: boolean
}

const def = <D>(d: DefAcao<D>): DefAcao<unknown> => d as unknown as DefAcao<unknown>

const vazio = z.object({})
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Pagamento e repasse: valor, data, forma e comprovante OPCIONAL. Valor e data entram soltos
 * (`unknown`/string) para a função do domínio devolver a frase certa («Informe um valor maior que
 * zero.»), como no contrato; `hoje` para «data não futura» vem do relógio do servidor, nunca do corpo.
 */
const recebimento = z.object({
  cobrancaId: z.string().max(40),
  valor: z.unknown(),
  data: iso,
  forma: z.string().max(20),
  comprovante: z.string().max(300).nullish(),
})

/**
 * Números do contrato entram como `unknown`: a função do domínio já checa tipo e
 * faixa e devolve a frase certa para a tela («Informe o valor do aluguel.»). Um
 * `z.number()` aqui trocaria isso por «dados inválidos» quando o campo vem vazio.
 * O resultado ainda passa pelo schema estrito do mapper antes de gravar.
 */
const contratoEntrada = z.object({
  valor: z.unknown(),
  diaVencimento: z.unknown(),
  inicio: z.string().max(10),
  fim: z.string().max(10),
  reajuste: z.enum(['IGP-M', 'IPCA', 'Outro']),
  taxaPct: z.unknown(),
})

export const ACOES_LOCACAO: Record<string, DefAcao<unknown>> = {
  salvarAberturaLocacao: def({
    permissao: () => ['editar'],
    tocaVinculos: true,
    schema: z.object({
      locador: pessoaSchema,
      locatario: pessoaSchema,
      imovelId: z.string().max(80),
      imovel: z.string().max(300),
      corretorId: z.string().max(80),
    }),
    fn: (e, id, d, a, q) => acoes.salvarAberturaLocacao(e, id, d, a, q),
  }),
  salvarGarantia: def({
    permissao: () => ['editar'],
    schema: z.object({ tipo: z.enum(['Caução', 'Seguro-fiança', 'Fiador', 'Título de capitalização', 'Outra']), detalhe: z.string().max(1000) }),
    fn: (e, id, d, a, q) => acoes.salvarGarantia(e, id, d, a, q),
  }),
  salvarVistoria: def({
    permissao: () => ['editar'],
    schema: z.object({ quando: z.enum(['entrada', 'saida']), vistoria: vistoriaSchema }),
    fn: (e, id, d, a, q) => acoes.salvarVistoria(e, id, d.quando, d.vistoria, a, q),
  }),
  // Valor do aluguel e taxa: `valores`, ou o corretor da locação (`financeiroLivre`) enquanto a análise não foi enviada
  // ou foi devolvida. Cobranças, pagamentos e repasses (o fluxo mensal) seguem só de `valores`.
  salvarContrato: def({
    permissao: () => ['valores', 'financeiroLivre'],
    permitido: (c) => c.editarFinanceiro,
    schema: contratoEntrada,
    fn: (e, id, d, a, q) => acoes.salvarContrato(e, id, d as ContratoLocacao, a, q),
  }),
  gerarCobranca: def({
    permissao: () => ['valores'],
    schema: z.object({ competencia: z.string().max(7) }),
    fn: (e, id, d, a, q) => acoes.gerarCobranca(e, id, d.competencia, a, q),
  }),
  registrarPagamento: def({
    permissao: () => ['valores'],
    schema: recebimento,
    fn: (e, id, d, a, q) => acoes.registrarPagamento(e, id, d.cobrancaId, d as never, a, q),
  }),
  registrarRepasse: def({
    permissao: () => ['valores'],
    schema: recebimento,
    fn: (e, id, d, a, q) => acoes.registrarRepasse(e, id, d.cobrancaId, d as never, a, q),
  }),
  anexarComprovante: def({
    permissao: () => ['valores'],
    schema: z.object({
      cobrancaId: z.string().max(40),
      alvo: z.enum(['pagamento', 'repasse']),
      pagamentoId: z.string().max(20).optional(),
      comprovante: z.string().min(1).max(300),
    }),
    fn: (e, id, d, a, q) => acoes.anexarComprovante(e, id, d.cobrancaId, d, a, q),
  }),
  enviarAnaliseFinanceira: def({
    permissao: () => ['valores', 'financeiroLivre'],
    permitido: (c) => c.editarFinanceiro,
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.enviarAnaliseFinanceiraLocacao(e, id, a, q),
  }),
  aprovarAnaliseFinanceira: def({
    permissao: () => ['valores'],
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.aprovarAnaliseFinanceiraLocacao(e, id, a, q),
  }),
  devolverAnaliseFinanceira: def({
    permissao: () => ['valores'],
    schema: z.object({ motivo: z.string().max(MOTIVO_MAX) }),
    fn: (e, id, d, a, q) => acoes.devolverAnaliseFinanceiraLocacao(e, id, d.motivo, a, q),
  }),
  concluirEtapaLocacao: def({
    permissao: (d: { etapa: number }) => (d.etapa === 7 ? ['valores'] : ['editar']),
    schema: z.object({ etapa: z.number().int() }),
    fn: (e, id, d, a, q) => acoes.concluirEtapaLocacao(e, id, d.etapa, a, q),
  }),
  renovarLocacao: def({
    permissao: () => ['editar', 'valores'],
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.renovarLocacao(e, id, a, q),
  }),
  encerrarLocacao: def({
    permissao: () => ['editar', 'valores'],
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.encerrarLocacao(e, id, a, q),
  }),
  arquivarLocacao: def({
    permissao: () => ['arquivar'],
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.arquivarLocacao(e, id, a, q),
  }),
  restaurarLocacao: def({
    permissao: () => ['arquivar'],
    schema: vazio,
    fn: (e, id, _d, a, q) => acoes.restaurarLocacao(e, id, a, q),
  }),
}

/** Corpo de `POST /api/gestao/locacoes/:id/acoes`. `versao` é a que o cliente leu. */
export const corpoAcaoSchema = z.object({
  acao: z.string().max(60),
  dados: z.unknown().optional(),
  versao: z.number().int().min(1),
})

/**
 * Esta pessoa pode agir NESTA locação com alguma das permissões? `proprio` só vale
 * se a locação é do corretor logado — mesma regra de `capacidades()` no domínio.
 */
export function permitidoNaLocacao(
  matriz: MatrizPermissoes,
  perfil: Perfil,
  brokerId: string | null,
  chaves: PermChave[],
  locacao: Pick<Locacao, 'corretorId'>,
): boolean {
  return chaves.some((k) => {
    const v = matriz[k]?.[perfil] ?? 'nao'
    return v === 'sim' || (v === 'proprio' && brokerId !== null && locacao.corretorId === brokerId)
  })
}
