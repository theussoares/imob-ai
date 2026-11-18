import { z } from 'zod'
import { hojeISO } from '~~/layers/gestao/domain/avisos-locacao'
import { agora } from '~~/layers/gestao/domain/acoes'
import { realizarConsulta, proximoIdConsulta, FINALIDADES, type ConsultaFeita, type Finalidade } from '~~/layers/gestao/domain/consulta'
import { resumoDashboard, type ResumoDashboard } from '~~/layers/gestao/domain/dashboard'
import {
  competenciasDisponiveis,
  pendenciasFinanceiras,
  resumoLocacoes,
  resumoVendas,
  type RespostaFinanceiro,
} from '~~/layers/gestao/domain/financeiro'
import { listarConsultas, inserirConsulta, ultimoIdConsulta } from '~~/server/repositories/gestao-consulta.repository'
import { listarDocumentosDosContratos } from '~~/server/repositories/gestao-documento.repository'
import { buscarLocacao, listarTodasLocacoes } from '~~/server/repositories/gestao-locacao.repository'
import { buscarVenda, listarTodasVendas } from '~~/server/repositories/gestao-venda.repository'
import { registrarEvento, listarEventos } from '~~/server/repositories/gestao-evento.repository'
import { exigirPermissao, type ContextoGestao } from '~~/server/utils/gestao-auth'
import { agoraBrasil } from '~~/server/utils/gestao-tempo'

/**
 * Leituras agregadas do gestão (financeiro, dashboard, auditoria, consulta cadastral).
 *
 * Os endpoints ficam finos e chamam `requireGestaoMember` eles mesmos (o guardrail
 * varre o endpoint, não o serviço); a regra — permissão, escopo do corretor, recorte —
 * mora aqui para testar sem subir o Nitro. `tenant_id` sai só de `ctx.membro.tenantId`.
 * As contas são as funções puras de `layers/gestao/domain`, as mesmas do protótipo.
 */

/** Mesma regra de vendas e locações: sem `verTodos` o membro só vê o que é do seu corretor. */
function escopoCorretor(ctx: ContextoGestao): { corretorId?: string | null } {
  return ctx.matriz.verTodos?.[ctx.membro.perfil] === 'sim' ? {} : { corretorId: ctx.membro.brokerId }
}

/** «Hoje» é o de Brasília no servidor: o cliente não escolhe a data dos atrasos. */
const hoje = () => hojeISO(agoraBrasil())

/** Vendas e locações ativas do escopo do membro, já no modelo de domínio. */
async function contratosVisiveis(ctx: ContextoGestao) {
  const e = escopoCorretor(ctx)
  const tenantId = ctx.membro.tenantId
  // Corretor sem vínculo (`null`) não tem «os meus»: nada, e não tudo.
  const semVinculo = e.corretorId === null
  const [v, l] = await Promise.all([
    semVinculo
      ? { vendas: [], truncado: false }
      : listarTodasVendas(ctx.db, { tenantId, ...(e.corretorId ? { corretorId: e.corretorId } : {}) }, { arquivado: false }),
    listarTodasLocacoes(ctx.db, tenantId, { arquivadas: false, corretorId: e.corretorId }),
  ])
  // Totais precisam de TODOS os contratos: lê em blocos de 1000 até `LIMITE_BUSCA` (5000 por tipo) e só
  // então avisa. Alternativa descartada: somar no banco — o valor mora no `jsonb` e a conta é a do domínio
  // (`resumoVendas`...); uma segunda implementação em SQL divergiria dela.
  return { processos: v.vendas.map((x) => x.processo), locacoes: l.locacoes.map((x) => x.locacao), truncado: v.truncado || l.truncado }
}

// ---------------------------------------------------------------- financeiro

export type { RespostaFinanceiro }

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/

export async function financeiro(ctx: ContextoGestao, competencia: string): Promise<RespostaFinanceiro> {
  exigirPermissao(ctx, 'valores')
  if (competencia && !COMPETENCIA.test(competencia)) {
    throw createError({ statusCode: 422, statusMessage: 'Competência inválida (use aaaa-mm).' })
  }
  const { processos, locacoes, truncado } = await contratosVisiveis(ctx)
  const h = hoje()
  return {
    vendas: resumoVendas(processos),
    locacoes: resumoLocacoes(locacoes, h, competencia),
    competencias: competenciasDisponiveis(locacoes),
    pendencias: pendenciasFinanceiras(locacoes, h),
    truncado,
  }
}

// ----------------------------------------------------------------- dashboard

/**
 * Só contagens e avisos, sem R$ (ver `dashboard.ts`): por isso não precisa de recorte
 * de `valores`. O recorte que importa é o de corretor, feito em `contratosVisiveis`; a
 * contagem de documentos recebe só os ids que ele enxerga.
 */
export async function dashboard(ctx: ContextoGestao): Promise<ResumoDashboard & { truncado: boolean }> {
  const { processos, locacoes, truncado } = await contratosVisiveis(ctx)
  const ids = [...processos.map((p) => p.id), ...locacoes.map((l) => l.id)]
  // Todos os documentos dos contratos visíveis (não só os «para conferir»): as pendências
  // documentais da venda saem da mesma lista. Sem isso o painel dizia «Nada pendente» com a
  // venda mostrando 9 documentos faltando.
  const { docs: documentos } = await listarDocumentosDosContratos(ctx.db, ctx.membro.tenantId, ids)
  return { ...resumoDashboard(processos, locacoes, documentos, hoje()), truncado }
}

// ------------------------------------------------------------------ auditoria

export async function auditoria(ctx: ContextoGestao, filtro: { quem?: string; de?: string; ate?: string }) {
  exigirPermissao(ctx, 'auditoria')
  const eventos = await listarEventos(ctx.db, ctx.membro.tenantId, filtro)
  return {
    // O uuid do autor fica no banco: a tela mostra o nome.
    eventos: eventos.map(({ atorUserId: _u, ...e }) => e),
    pessoas: [...new Set(eventos.map((e) => e.atorNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  }
}

// ------------------------------------------------------------------ consultas

const ID_CONTRATO = /^[VL]-\d{4}-\d{4,}$/

const corpoConsultaSchema = z.object({
  documento: z.string().min(1).max(30),
  finalidade: z.enum(FINALIDADES),
  contratoId: z.string().regex(ID_CONTRATO).nullish(),
})

export async function consultas(ctx: ContextoGestao): Promise<ConsultaFeita[]> {
  exigirPermissao(ctx, 'consulta')
  return listarConsultas(ctx.db, ctx.membro.tenantId)
}

/**
 * Grava a consulta simulada. O documento inteiro só existe aqui, em memória: o
 * domínio devolve a versão mascarada, que é a única que chega ao banco, ao evento
 * de auditoria e ao log. O contrato citado precisa ser do tenant E visível ao
 * membro (404 igual a «não existe»), senão o histórico viraria canal para sondar ids.
 */
export async function consultar(ctx: ContextoGestao, corpo: unknown): Promise<ConsultaFeita> {
  exigirPermissao(ctx, 'consulta')
  const parsed = corpoConsultaSchema.safeParse(corpo)
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Informe documento e finalidade da consulta.' })
  const { documento, finalidade, contratoId } = parsed.data
  const tenantId = ctx.membro.tenantId

  if (contratoId) {
    const e = escopoCorretor(ctx)
    const achou =
      e.corretorId === null
        ? false
        : contratoId.startsWith('V-')
          ? !!(await buscarVenda(ctx.db, { tenantId, ...(e.corretorId ? { corretorId: e.corretorId } : {}) }, contratoId))
          : !!(await buscarLocacao(ctx.db, tenantId, contratoId, e))
    if (!achou) throw createError({ statusCode: 404, statusMessage: 'Contrato não encontrado.' })
  }

  const ultimo = await ultimoIdConsulta(ctx.db, tenantId)
  const proximoId = proximoIdConsulta(ultimo ? [{ id: ultimo } as ConsultaFeita] : [])
  const r = realizarConsulta(
    { documento, finalidade: finalidade as Finalidade, contratoId },
    { nome: ctx.membro.nome },
    agora(agoraBrasil()),
    proximoId,
  )
  if (!r.ok) throw createError({ statusCode: 422, statusMessage: r.erro })

  const gravou = await inserirConsulta(ctx.db, tenantId, r.consulta, { userId: ctx.membro.userId })
  if (gravou === 'duplicada') throw createError({ statusCode: 409, statusMessage: 'Outra consulta foi feita ao mesmo tempo. Tente de novo.' })

  await registrarEvento(ctx.db, tenantId, {
    atorUserId: ctx.membro.userId,
    atorNome: ctx.membro.nome,
    acao: `Consulta cadastral ${r.consulta.id} (${finalidade}) — ${r.consulta.documentoMascarado}`,
    alvoTipo: 'consulta',
    alvoId: r.consulta.id,
  })
  return r.consulta
}
