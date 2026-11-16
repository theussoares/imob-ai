// `.ts` explícito: o mock (mocker-nuxt) carrega este arquivo em Node puro.
import { requisitoPorChave } from './requisitos.ts'
import { requisitosDaEtapaLocacao } from './locacao-requisitos.ts'
import type { Cobranca, Documento, Locacao, Pessoa } from './types'

/** Dados de exemplo da locação. Tudo fictício. */

/** Imóveis de exemplo: o cadastro real (`properties`) entra quando Imóveis for ligado à API. */
export const IMOVEIS_EXEMPLO: { id: string; rotulo: string }[] = [
  { id: 'im-101', rotulo: 'Apartamento 12 · Edifício Aurora · Rua das Flores, 200' },
  { id: 'im-102', rotulo: 'Casa 3 quartos · Jardim América' },
  { id: 'im-103', rotulo: 'Sala comercial 4 · Centro Empresarial' },
  { id: 'im-104', rotulo: 'Kitnet · Vila Nova' },
  { id: 'im-105', rotulo: 'Barracão · Distrito Industrial' },
]

const pessoa = (nome: string, cpf: string, n: number): Pessoa => ({
  nome,
  cpf,
  telefone: `(11) 9${String(2000 + n * 113).slice(0, 4)}-${String(3000 + n * 271).slice(0, 4)}`,
  email: `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.')}@exemplo.com`,
})

const feitas = (n: number) => Array.from({ length: 8 }, (_, i) => i < n)

const imovel = (id: string) => IMOVEIS_EXEMPLO.find((i) => i.id === id)!

function loc(o: Partial<Locacao> & Pick<Locacao, 'id' | 'locador' | 'locatario' | 'corretorId' | 'status'> & { imovelId: string }): Locacao {
  return {
    tipo: 'locacao',
    imovel: imovel(o.imovelId).rotulo,
    updated: '13/11/2026 09:10',
    etapa: 1,
    concluidas: feitas(0),
    cobrancas: [],
    hist: [],
    obs: '',
    arquivado: false,
    ...o,
  }
}

const vistoria = (data: string, responsavel: string, fotos: string[]) => ({ data, responsavel, fotos, observacao: '' })

const cobranca = (competencia: string, valor: number, pago: boolean, repasse?: Cobranca['repasse']): Cobranca => ({
  id: `cb-${competencia}`,
  competencia,
  valor,
  vencimento: `${competencia}-10`,
  ...(pago && { pago: { data: `${competencia}-09`, comprovante: `comprovante-${competencia}.pdf` } }),
  ...(repasse && { repasse }),
})

export function locacoesSeed(): Locacao[] {
  return [
    loc({
      id: 'L-2026-0004',
      locador: pessoa('Ana Prates', '210.330.440-55', 1),
      locatario: pessoa('Bruno Alves', '', 2),
      imovelId: 'im-104',
      corretorId: 'c1',
      status: 'Em abertura',
      hist: [{ acao: 'Abriu a locação', quem: 'Carlos Mendes', quando: '13/11/2026 09:10' }],
    }),
    loc({
      id: 'L-2026-0003',
      locador: pessoa('Cecília Nunes', '311.440.550-66', 3),
      locatario: pessoa('Diego Farias', '412.550.660-77', 4),
      imovelId: 'im-102',
      corretorId: 'c2',
      status: 'Aguardando garantia',
      etapa: 5,
      concluidas: feitas(4),
      hist: [{ acao: 'Abriu a locação', quem: 'Juliana Prado', quando: '09/11/2026 14:00' }],
    }),
    loc({
      id: 'L-2026-0001',
      locador: pessoa('Eduardo Cunha', '513.660.770-88', 5),
      locatario: pessoa('Fernanda Lopes', '614.770.880-99', 6),
      imovelId: 'im-101',
      corretorId: 'c1',
      status: 'Ativa',
      etapa: 8,
      concluidas: feitas(7),
      garantia: { tipo: 'Seguro-fiança', detalhe: 'Apólice 99812' },
      vistoriaEntrada: vistoria('2026-08-08', 'Marina Alves', ['sala.jpg', 'cozinha.jpg']),
      contrato: { valor: 2500, diaVencimento: 10, inicio: '2026-08-10', fim: '2027-08-10', reajuste: 'IGP-M', taxaPct: 10 },
      cobrancas: [
        cobranca('2026-10', 2500, true, { valor: 2250, feito: false }),
        cobranca('2026-11', 2500, false),
      ],
      hist: [{ acao: 'Abriu a locação', quem: 'Carlos Mendes', quando: '01/08/2026 10:00' }],
    }),
    loc({
      id: 'L-2026-0002',
      locador: pessoa('Gilberto Sá', '715.880.990-00', 7),
      locatario: pessoa('Helena Ribas', '816.990.100-11', 8),
      imovelId: 'im-103',
      corretorId: 'c3',
      status: 'Encerrada',
      etapa: 8,
      concluidas: feitas(8),
      garantia: { tipo: 'Caução', detalhe: '3 aluguéis' },
      vistoriaEntrada: vistoria('2025-10-01', 'Marina Alves', ['entrada.jpg']),
      vistoriaSaida: vistoria('2026-10-30', 'Marina Alves', ['saida.jpg']),
      contrato: { valor: 1800, diaVencimento: 5, inicio: '2025-10-05', fim: '2026-10-05', reajuste: 'IPCA', taxaPct: 8 },
      cobrancas: [cobranca('2026-09', 1800, true, { valor: 1656, feito: true, data: '2026-09-12', comprovante: 'repasse-2026-09.pdf' })],
      hist: [{ acao: 'Encerrou a locação', quem: 'Paulo Ribeiro', quando: '30/10/2026 17:00' }],
    }),
  ]
}

function arquivosDaEtapa(l: string, etapas: number[], enviadoPor: string): Documento[] {
  return etapas.flatMap(requisitosDaEtapaLocacao).map((r) => ({
    id: `r${l.slice(-4)}-${r.chave.replace(':', '-')}`,
    nome: `${requisitoPorChave(r.chave)!.nome}.pdf`,
    categoria: r.categoria,
    processoId: l,
    estado: 'conferido' as const,
    tamanho: 524288,
    versoes: 1,
    enviadoPor,
    requisito: r.chave,
    apagado: null,
  }))
}

/** Arquivos exigidos nas etapas já concluídas das locações de exemplo. */
export function documentosLocacaoSeed(): Documento[] {
  return [
    ...arquivosDaEtapa('L-2026-0003', [2, 3, 4], 'Juliana Prado'),
    ...arquivosDaEtapa('L-2026-0001', [2, 3, 4, 5], 'Carlos Mendes'),
    ...arquivosDaEtapa('L-2026-0002', [2, 3, 4, 5], 'Rafael Teixeira'),
  ]
}
