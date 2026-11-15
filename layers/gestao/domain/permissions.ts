import type { MatrizPermissoes, PermChave, PermValor, Perfil, Processo, Sessao } from './types'

export const PERFIS: Record<Perfil, { nome: string; usuario: string; corretorId: string | null; descricao: string }> = {
  corretor: {
    nome: 'Corretor',
    usuario: 'Carlos Mendes',
    corretorId: 'c1',
    descricao: 'Cria processos, edita os próprios cadastros, envia documentos e vê só os seus processos.',
  },
  recepcao: {
    nome: 'Recepção',
    usuario: 'Marina Alves',
    corretorId: null,
    descricao: 'Vê os processos de todos os corretores, confere documentos e edita informações.',
  },
  juridico: {
    nome: 'Jurídico e financeiro',
    usuario: 'Paulo Ribeiro',
    corretorId: null,
    descricao: 'Vê processos e documentos, arquiva contratos e acessa valores, comissões, pagamentos e repasses.',
  },
  dono: {
    nome: 'Dono',
    usuario: 'Helena Duarte',
    corretorId: null,
    descricao: 'Acesso total, incluindo usuários, permissões e configurações.',
  },
}

export const ORDEM_PERFIS: Perfil[] = ['corretor', 'recepcao', 'juridico', 'dono']

export function sessaoDoPerfil(perfil: Perfil): Sessao {
  const p = PERFIS[perfil]
  return { perfil, nome: p.usuario, corretorId: p.corretorId }
}

export const DEFINICOES_PERMISSAO: { chave: PermChave; rotulo: string; estados: PermValor[] }[] = [
  { chave: 'verTodos', rotulo: 'Ver os processos de todos os corretores', estados: ['sim', 'proprio'] },
  { chave: 'criar', rotulo: 'Abrir processos', estados: ['sim', 'nao'] },
  { chave: 'editar', rotulo: 'Editar cadastros', estados: ['sim', 'proprio', 'nao'] },
  { chave: 'enviarDocs', rotulo: 'Enviar e substituir documentos', estados: ['sim', 'nao'] },
  { chave: 'conferir', rotulo: 'Conferir documentos', estados: ['sim', 'nao'] },
  { chave: 'apagarDocs', rotulo: 'Apagar (arquivar) documentos e usar a lixeira', estados: ['sim', 'nao'] },
  { chave: 'juridico', rotulo: 'Análise e finalização jurídica', estados: ['sim', 'nao'] },
  { chave: 'arquivar', rotulo: 'Arquivar contratos', estados: ['sim', 'nao'] },
  { chave: 'valores', rotulo: 'Ver valores, comissões, pagamentos e repasses', estados: ['sim', 'nao'] },
  { chave: 'consulta', rotulo: 'Fazer consulta cadastral (SPC/Serasa)', estados: ['sim', 'nao'] },
  { chave: 'auditoria', rotulo: 'Ver o histórico de alterações (auditoria)', estados: ['sim', 'nao'] },
  { chave: 'convidar', rotulo: 'Convidar usuários por e-mail', estados: ['sim', 'nao'] },
  { chave: 'admin', rotulo: 'Usuários, permissões e configurações', estados: ['sim', 'nao'] },
]

const linha = (corretor: PermValor, recepcao: PermValor, juridico: PermValor, dono: PermValor) => ({
  corretor,
  recepcao,
  juridico,
  dono,
})

/** Matriz padrão do protótipo. Sempre devolve cópia: quem edita não suja o padrão. */
export function matrizPadrao(): MatrizPermissoes {
  return {
    verTodos: linha('proprio', 'sim', 'sim', 'sim'),
    criar: linha('sim', 'sim', 'sim', 'sim'),
    editar: linha('proprio', 'sim', 'nao', 'sim'),
    enviarDocs: linha('sim', 'sim', 'sim', 'sim'),
    conferir: linha('nao', 'sim', 'nao', 'sim'),
    apagarDocs: linha('nao', 'sim', 'sim', 'sim'),
    juridico: linha('nao', 'nao', 'sim', 'sim'),
    arquivar: linha('nao', 'nao', 'sim', 'sim'),
    valores: linha('nao', 'nao', 'sim', 'sim'),
    consulta: linha('nao', 'sim', 'sim', 'sim'),
    auditoria: linha('nao', 'nao', 'sim', 'sim'),
    convidar: linha('nao', 'nao', 'sim', 'sim'),
    admin: linha('nao', 'nao', 'nao', 'sim'),
  }
}

export interface Capacidades {
  verTodos: boolean
  criar: boolean
  enviarDocs: boolean
  editar: boolean
  conferir: boolean
  juridico: boolean
  valores: boolean
  arquivar: boolean
  apagarDocs: boolean
  consulta: boolean
  auditoria: boolean
  convidar: boolean
  admin: boolean
}

/**
 * O que a sessão pode fazer, opcionalmente sobre um processo específico.
 *
 * `editar = 'proprio'` só vale se o corretor do processo é quem está logado —
 * sem processo (`null`) a pergunta é "pode editar algo?", e `proprio` conta
 * como sim.
 */
export function capacidades(matriz: MatrizPermissoes, sessao: Sessao, processo: Processo | null = null): Capacidades {
  const v = (k: PermChave): PermValor => matriz[k]?.[sessao.perfil] ?? 'nao'
  const proprio = processo === null || processo.corretorId === sessao.corretorId
  const editar = v('editar')
  return {
    verTodos: v('verTodos') === 'sim',
    criar: v('criar') === 'sim',
    enviarDocs: v('enviarDocs') === 'sim',
    editar: editar === 'sim' || (editar === 'proprio' && proprio),
    conferir: v('conferir') === 'sim',
    juridico: v('juridico') === 'sim',
    valores: v('valores') === 'sim',
    arquivar: v('arquivar') === 'sim',
    apagarDocs: v('apagarDocs') === 'sim',
    consulta: v('consulta') === 'sim',
    auditoria: v('auditoria') === 'sim',
    convidar: v('convidar') === 'sim',
    admin: v('admin') === 'sim',
  }
}

export type ChaveMenu =
  | 'dashboard'
  | 'imoveis'
  | 'vendas'
  | 'locacao'
  | 'financeiro'
  | 'consulta'
  | 'arquivados'
  | 'auditoria'
  | 'usuarios'
  | 'config'

export const MENU: { chave: ChaveMenu; rotulo: string; rota: string; pronto: boolean }[] = [
  { chave: 'dashboard', rotulo: 'Dashboard', rota: '/gestao', pronto: false },
  { chave: 'imoveis', rotulo: 'Imóveis', rota: '/gestao/imoveis', pronto: false },
  { chave: 'vendas', rotulo: 'Contratos de venda', rota: '/gestao/vendas', pronto: true },
  { chave: 'locacao', rotulo: 'Contratos de locação', rota: '/gestao/locacao', pronto: false },
  { chave: 'financeiro', rotulo: 'Financeiro', rota: '/gestao/financeiro', pronto: false },
  { chave: 'consulta', rotulo: 'Consulta cadastral', rota: '/gestao/consulta', pronto: false },
  { chave: 'arquivados', rotulo: 'Arquivados', rota: '/gestao/arquivados', pronto: false },
  { chave: 'auditoria', rotulo: 'Histórico de alterações', rota: '/gestao/auditoria', pronto: false },
  { chave: 'usuarios', rotulo: 'Usuários e permissões', rota: '/gestao/usuarios', pronto: false },
  { chave: 'config', rotulo: 'Configurações', rota: '/gestao/config', pronto: false },
]

/** Item de menu visível para o perfil? Espelha `navOk` do protótipo. */
export function menuVisivel(matriz: MatrizPermissoes, perfil: Perfil, chave: ChaveMenu): boolean {
  const v = (k: PermChave) => matriz[k]?.[perfil] === 'sim'
  switch (chave) {
    case 'financeiro':
      return v('valores')
    case 'arquivados':
      return v('arquivar') || v('apagarDocs')
    case 'consulta':
      return v('consulta')
    case 'auditoria':
      return v('auditoria')
    case 'usuarios':
      // Jurídico convida mas não administra: vê a tela de usuários, não as configurações.
      return v('admin') || v('convidar')
    case 'config':
      return v('admin')
    default:
      return true
  }
}

/** Processos que a sessão enxerga: corretor com `verTodos = proprio` só vê os seus. */
export function processosVisiveis(matriz: MatrizPermissoes, sessao: Sessao, processos: Processo[]): Processo[] {
  const todos = matriz.verTodos?.[sessao.perfil] === 'sim'
  return processos.filter((p) => !p.arquivado && (todos || p.corretorId === sessao.corretorId))
}
