// `.ts` explícito: o mock (mocker-nuxt) carrega este arquivo em Node puro, que não resolve import sem extensão.
import { requisitoPorChave } from './requisitos.ts'
import { documentosLocacaoSeed } from './locacao-seed.ts'
import type { Corretor, Documento, Pessoa, Processo, StatusVenda, UsuarioGestao } from './types'

/** Dados de exemplo do protótipo. Tudo fictício (nomes e CPFs de exemplo). */

export const CORRETORES: Corretor[] = [
  { id: 'c1', nome: 'Carlos Mendes' },
  { id: 'c2', nome: 'Juliana Prado' },
  { id: 'c3', nome: 'Rafael Teixeira' },
]

export const USUARIOS: UsuarioGestao[] = [
  { nome: 'Carlos Mendes', mail: 'carlos@olmi.exemplo', perfil: 'corretor' },
  { nome: 'Juliana Prado', mail: 'juliana@olmi.exemplo', perfil: 'corretor' },
  { nome: 'Rafael Teixeira', mail: 'rafael@olmi.exemplo', perfil: 'corretor' },
  { nome: 'Marina Alves', mail: 'marina@olmi.exemplo', perfil: 'recepcao' },
  { nome: 'Paulo Ribeiro', mail: 'paulo@olmi.exemplo', perfil: 'juridico' },
  { nome: 'Helena Duarte', mail: 'helena@olmi.exemplo', perfil: 'dono' },
]

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/** Pessoa de exemplo já com contato: as etapas 2 e 3 só fecham com telefone e e-mail. */
const pessoa = (nome: string, cpf: string, n: number): Pessoa => ({
  nome,
  cpf,
  telefone: `(11) 9${String(1000 + n * 137).slice(0, 4)}-${String(2000 + n * 311).slice(0, 4)}`,
  email: `${semAcento(nome).toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@exemplo.com`,
})

const feitas = (n: number) => Array.from({ length: 8 }, (_, i) => i < n)
const fin = (forma: 'À vista' | 'Financiamento' | 'Misto', financiado = 0, entrada = 0, fgts = 0, proprios = 0) => ({
  forma,
  financiado,
  entrada,
  fgts,
  proprios,
})

function proc(o: Partial<Processo> & Pick<Processo, 'id' | 'vendedor' | 'comprador' | 'imovel' | 'corretorId' | 'status' | 'valor'>): Processo {
  return {
    tipo: 'venda',
    captadorId: 'c2',
    updated: '13/11/2026 09:10',
    pct: 5,
    fin: fin('À vista', 0, 0, 0, o.valor),
    etapa: 1,
    concluidas: feitas(0),
    adiantamentos: [],
    hist: [],
    obs: '',
    pdf: false,
    arquivado: false,
    ...o,
  }
}

export function processosSeed(): Processo[] {
  return [
    proc({
      id: 'V-2026-0142',
      vendedor: pessoa('Marta Lopes', '214.568.730-12', 1),
      comprador: pessoa('Daniel Reis', '398.115.204-77', 2),
      imovel: 'Apartamento 302 · Edifício Solar · Rua das Palmeiras, 410',
      corretorId: 'c1',
      status: 'Aguardando registro',
      updated: '12/11/2026 16:05',
      valor: 100000,
      fin: fin('Financiamento', 70000, 20000, 10000, 0),
      etapa: 8,
      concluidas: feitas(7),
      valorVenal: 92000,
      pdf: true,
      obs: 'Matrícula sem ônus. Contrato revisado.',
      adiantamentos: [
        { id: 'a1', resp: 'vendedor', valor: 2000, data: '2026-11-05', quem: 'Paulo Ribeiro' },
        { id: 'a2', resp: 'captador', valor: 500, data: '2026-11-05', quem: 'Paulo Ribeiro' },
        { id: 'a3', resp: 'imob', valor: 2500, data: '2026-11-05', quem: 'Paulo Ribeiro' },
      ],
      hist: [
        { acao: 'Concluiu a etapa 7 — Análise jurídica', quem: 'Paulo Ribeiro', quando: '12/11/2026 16:05' },
        { acao: 'Conferência da recepção concluída', quem: 'Marina Alves', quando: '10/11/2026 11:20' },
        { acao: 'Abriu o processo', quem: 'Carlos Mendes', quando: '20/10/2026 14:32' },
      ],
    }),
    proc({
      id: 'V-2026-0151',
      vendedor: pessoa('Roberto Neves', '102.744.386-50', 3),
      comprador: { nome: 'Camila Farias', cpf: '445.902.118-03' },
      imovel: 'Casa 3 quartos · Jardim das Acácias',
      corretorId: 'c2',
      captadorId: 'c1',
      status: 'Aguardando documentação',
      updated: '13/11/2026 08:40',
      valor: 480000,
      fin: fin('Misto', 300000, 100000, 40000, 40000),
      etapa: 3,
      concluidas: feitas(2),
      adiantamentos: [{ id: 'a4', resp: 'vendedor', valor: 6000, data: '2026-11-09', quem: 'Paulo Ribeiro' }],
      hist: [
        { acao: 'Enviou documento: Comprovante de renda do comprador', quem: 'Juliana Prado', quando: '13/11/2026 08:40' },
        { acao: 'Abriu o processo', quem: 'Juliana Prado', quando: '28/10/2026 10:02' },
      ],
    }),
    proc({
      id: 'V-2026-0155',
      vendedor: { nome: 'Antônio Cardoso', cpf: '071.338.559-24' },
      comprador: { nome: 'Larissa Moura', cpf: '287.601.440-91' },
      imovel: 'Terreno 360 m² · Loteamento Vila Nova',
      corretorId: 'c1',
      captadorId: 'c1',
      status: 'Proposta realizada',
      updated: '11/11/2026 17:15',
      valor: 185000,
      hist: [{ acao: 'Abriu o processo', quem: 'Carlos Mendes', quando: '11/11/2026 17:15' }],
    }),
    proc({
      id: 'V-2026-0158',
      vendedor: pessoa('Sônia Barros', '330.912.685-40', 7),
      comprador: pessoa('Empresa Alfa Ltda', '12.345.678/0001-90', 8),
      imovel: 'Sala comercial 41 m² · Centro',
      corretorId: 'c3',
      captadorId: 'c3',
      status: 'Em análise de financiamento',
      updated: '12/11/2026 10:30',
      valor: 320000,
      fin: fin('Financiamento', 256000, 64000, 0, 0),
      etapa: 5,
      concluidas: feitas(4),
      valorVenal: 301000,
      hist: [
        { acao: 'Mudou o status para Em análise de financiamento', quem: 'Rafael Teixeira', quando: '12/11/2026 10:30' },
        { acao: 'Abriu o processo', quem: 'Rafael Teixeira', quando: '02/11/2026 09:00' },
      ],
    }),
    proc({
      id: 'V-2026-0133',
      vendedor: pessoa('Irene Matos', '445.118.902-61', 9),
      comprador: pessoa('Fábio Siqueira', '519.220.007-18', 10),
      imovel: 'Casa 2 quartos · Jardim Primavera',
      corretorId: 'c3',
      captadorId: 'c3',
      status: 'Venda concluída',
      updated: '03/11/2026 14:00',
      valor: 275000,
      etapa: 8,
      concluidas: feitas(8),
      valorVenal: 260000,
      pdf: true,
      hist: [
        { acao: 'Mudou o status para Venda concluída', quem: 'Paulo Ribeiro', quando: '03/11/2026 14:00' },
        { acao: 'Abriu o processo', quem: 'Rafael Teixeira', quando: '01/09/2026 09:30' },
      ],
    }),
    proc({
      id: 'V-2026-0147',
      vendedor: pessoa('Gustavo Pires', '602.331.874-09', 11),
      comprador: pessoa('Patrícia Lemos', '730.446.118-25', 12),
      imovel: 'Sobrado · Rua das Orquídeas, 88',
      corretorId: 'c2',
      captadorId: 'c2',
      status: 'Venda cancelada',
      updated: '28/10/2026 18:20',
      valor: 410000,
      etapa: 3,
      concluidas: feitas(2),
      hist: [
        { acao: 'Mudou o status para Venda cancelada', quem: 'Juliana Prado', quando: '28/10/2026 18:20' },
        { acao: 'Abriu o processo', quem: 'Juliana Prado', quando: '05/10/2026 08:45' },
      ],
    }),
  ]
}

function doc(o: Pick<Documento, 'id' | 'nome' | 'categoria' | 'processoId'> & Partial<Documento>): Documento {
  return { estado: 'enviado', tamanho: 524288, versoes: 1, enviadoPor: 'Carlos Mendes', apagado: null, ...o }
}

/** Um arquivo por item de checklist, para os processos de exemplo que já passaram da etapa. */
function porRequisito(processoId: string, chaves: string[], enviadoPor: string, estado: Documento['estado'] = 'conferido'): Documento[] {
  return chaves.map((chave) => {
    const r = requisitoPorChave(chave)!
    return doc({ id: `r${processoId.slice(-4)}-${chave.replace(':', '-')}`, nome: `${r.nome}.pdf`, categoria: r.categoria, processoId, requisito: chave, estado, enviadoPor })
  })
}

const DOCS_VENDEDOR = ['vendedor:rg-cnh', 'vendedor:certidao', 'vendedor:residencia']
const DOCS_COMPRADOR = ['comprador:rg-cnh', 'comprador:certidao', 'comprador:residencia']

export function documentosSeed(): Documento[] {
  return [
    doc({ id: 'd1', nome: 'RG do vendedor.pdf', categoria: 'pessoas', processoId: 'V-2026-0142', estado: 'conferido', tamanho: 812000, requisito: 'vendedor:rg-cnh' }),
    doc({ id: 'd2', nome: 'Matrícula atualizada.pdf', categoria: 'imoveis', processoId: 'V-2026-0142', estado: 'conferido', tamanho: 2400000, requisito: 'imovel:matricula' }),
    doc({ id: 'd3', nome: 'Contrato de compra e venda.pdf', categoria: 'venda', processoId: 'V-2026-0142', estado: 'conferido', versoes: 2, enviadoPor: 'Paulo Ribeiro' }),
    doc({ id: 'd4', nome: 'Aditivo 01 - prazo de registro.pdf', categoria: 'venda', processoId: 'V-2026-0142', enviadoPor: 'Paulo Ribeiro' }),
    doc({ id: 'd5', nome: 'Comprovante de renda do comprador.pdf', categoria: 'pessoas', processoId: 'V-2026-0151', enviadoPor: 'Juliana Prado' }),
    doc({ id: 'd6', nome: 'Foto da fachada.jpg', categoria: 'imoveis', processoId: 'V-2026-0151', enviadoPor: 'Juliana Prado', tamanho: 3100000 }),
    doc({ id: 'd7', nome: 'Simulação de financiamento.pdf', categoria: 'financeiro', processoId: 'V-2026-0158', enviadoPor: 'Rafael Teixeira', requisito: 'fin:simulacao' }),
    doc({
      id: 'd8',
      nome: 'Recibo de adiantamento.pdf',
      categoria: 'financeiro',
      processoId: 'V-2026-0142',
      enviadoPor: 'Paulo Ribeiro',
      apagado: { quem: 'Marina Alves', quando: '10/11/2026 09:15' },
    }),
  ]
}

/**
 * Arquivos dos itens de checklist dos processos de exemplo. Separados dos avulsos
 * acima de propósito: o demo carrega os dois (`documentosSeedCompleto`), mas os
 * testes de filtro/contagem da tela de documentos usam só os avulsos — senão cada
 * item novo de checklist mudaria os números esperados de testes que nada têm a ver.
 */
export function documentosRequisitosSeed(): Documento[] {
  return [
    ...porRequisito('V-2026-0142', [...DOCS_VENDEDOR.slice(1), ...DOCS_COMPRADOR, 'imovel:venal', 'imovel:agua-luz', 'fin:proposta', 'fin:simulacao', 'fin:fgts', 'fin:entrada'], 'Carlos Mendes'),
    ...porRequisito('V-2026-0151', DOCS_VENDEDOR, 'Juliana Prado'),
    ...porRequisito('V-2026-0151', ['comprador:rg-cnh'], 'Juliana Prado', 'enviado'),
    ...porRequisito('V-2026-0158', [...DOCS_VENDEDOR, ...DOCS_COMPRADOR, 'imovel:matricula', 'imovel:venal', 'imovel:agua-luz'], 'Rafael Teixeira'),
    ...porRequisito('V-2026-0158', ['fin:proposta'], 'Rafael Teixeira', 'enviado'),
    ...porRequisito('V-2026-0133', [...DOCS_VENDEDOR, ...DOCS_COMPRADOR, 'imovel:matricula', 'imovel:venal', 'imovel:agua-luz', 'fin:proposta'], 'Rafael Teixeira'),
    ...porRequisito('V-2026-0147', DOCS_VENDEDOR, 'Juliana Prado', 'enviado'),
  ]
}

export const documentosSeedCompleto = (): Documento[] => [...documentosSeed(), ...documentosRequisitosSeed(), ...documentosLocacaoSeed()]

export const STATUS_INICIAL: StatusVenda = 'Em negociação'
