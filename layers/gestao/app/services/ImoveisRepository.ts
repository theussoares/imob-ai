import type { ImovelGestao } from '../../domain/imoveis'
import type { NovoImovel, ResultadoImovel } from '../../domain/imoveis-acoes'
import type { FotoNova } from '../../domain/imoveis-fotos'
import type { PropertyStatus } from '~~/shared/models/property'

export type ResultadoExclusao = { ok: true } | { ok: false; erro: string }

/**
 * Contrato do cadastro de imóveis do gestão. Hoje `MockImoveisRepository` (localStorage); no backend,
 * uma implementação http sobre `/api/admin/properties` — as telas não mudam. Permissão NÃO mora aqui:
 * o servidor a repete, e o store a checa antes de chamar.
 */
export interface ImoveisRepository {
  listar(): Promise<ImovelGestao[]>
  criar(dados: NovoImovel): Promise<ResultadoImovel>
  atualizar(id: string, dados: NovoImovel): Promise<ResultadoImovel>
  mudarStatus(id: string, status: PropertyStatus): Promise<ResultadoImovel>
  definirDestaque(id: string, featured: boolean): Promise<ResultadoImovel>
  excluir(id: string): Promise<ResultadoExclusao>
  adicionarFotos(id: string, novas: FotoNova[]): Promise<ResultadoImovel>
  definirCapa(id: string, fotoId: string): Promise<ResultadoImovel>
  moverFoto(id: string, fotoId: string, direcao: 'cima' | 'baixo'): Promise<ResultadoImovel>
  removerFoto(id: string, fotoId: string): Promise<ResultadoImovel>
}

/** Onde o mock guarda a lista. `gravar` devolve `false` quando não coube (localStorage cheio). */
export interface ArmazemImoveis {
  ler(): ImovelGestao[]
  gravar(lista: ImovelGestao[]): boolean
}
