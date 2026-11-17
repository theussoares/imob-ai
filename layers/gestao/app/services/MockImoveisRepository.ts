import type { ImovelGestao } from '../../domain/imoveis'
import { atualizarImovel, criarImovel, definirDestaque, excluirImovel, mudarStatusImovel, type NovoImovel, type ResultadoImovel } from '../../domain/imoveis-acoes'
import { adicionarFotos, definirCapa, moverFoto, removerFoto, type FotoNova, type ResultadoFotos } from '../../domain/imoveis-fotos'
import type { PropertyStatus } from '../../../../shared/models/property'
import type { ArmazemImoveis, ImoveisRepository, ResultadoExclusao } from './ImoveisRepository'

const SEM_ESPACO = 'Sem espaço para guardar neste navegador. Remova fotos ou imóveis de exemplo.'
const NAO_ENCONTRADO = 'Imóvel não encontrado.'

export class MockImoveisRepository implements ImoveisRepository {
  constructor(
    private readonly armazem: ArmazemImoveis,
    private readonly agora: () => string,
    private readonly novoId: () => string,
  ) {}

  async listar(): Promise<ImovelGestao[]> {
    return this.armazem.ler()
  }

  async criar(dados: NovoImovel): Promise<ResultadoImovel> {
    const lista = this.armazem.ler()
    const r = criarImovel(lista, dados, this.agora())
    return r.ok ? this.guardar([r.imovel, ...lista], r) : r
  }

  async atualizar(id: string, dados: NovoImovel): Promise<ResultadoImovel> {
    const lista = this.armazem.ler()
    const r = atualizarImovel(lista, id, dados, this.agora())
    return r.ok ? this.guardar(this.trocar(lista, r.imovel), r) : r
  }

  async mudarStatus(id: string, status: PropertyStatus): Promise<ResultadoImovel> {
    const lista = this.armazem.ler()
    const r = mudarStatusImovel(lista, id, status, this.agora())
    return r.ok ? this.guardar(this.trocar(lista, r.imovel), r) : r
  }

  async definirDestaque(id: string, featured: boolean): Promise<ResultadoImovel> {
    const lista = this.armazem.ler()
    const r = definirDestaque(lista, id, featured, this.agora())
    return r.ok ? this.guardar(this.trocar(lista, r.imovel), r) : r
  }

  async excluir(id: string): Promise<ResultadoExclusao> {
    const r = excluirImovel(this.armazem.ler(), id)
    if (!r.ok) return r
    return this.armazem.gravar(r.imoveis) ? { ok: true } : { ok: false, erro: SEM_ESPACO }
  }

  adicionarFotos(id: string, novas: FotoNova[]): Promise<ResultadoImovel> {
    return this.mexerNasFotos(id, (fotos) => adicionarFotos(fotos, novas, this.novoId))
  }

  definirCapa(id: string, fotoId: string): Promise<ResultadoImovel> {
    return this.mexerNasFotos(id, (fotos) => ({ ok: true, fotos: definirCapa(fotos, fotoId) }))
  }

  moverFoto(id: string, fotoId: string, direcao: 'cima' | 'baixo'): Promise<ResultadoImovel> {
    return this.mexerNasFotos(id, (fotos) => ({ ok: true, fotos: moverFoto(fotos, fotoId, direcao) }))
  }

  removerFoto(id: string, fotoId: string): Promise<ResultadoImovel> {
    return this.mexerNasFotos(id, (fotos) => ({ ok: true, fotos: removerFoto(fotos, fotoId) }))
  }

  private async mexerNasFotos(id: string, fn: (fotos: ImovelGestao['images']) => ResultadoFotos): Promise<ResultadoImovel> {
    const lista = this.armazem.ler()
    const atual = lista.find((i) => i.id === id)
    if (!atual) return { ok: false, erro: NAO_ENCONTRADO }
    const r = fn(atual.images)
    if (!r.ok) return r
    const imovel = { ...atual, images: r.fotos, updatedAt: this.agora() }
    return this.guardar(this.trocar(lista, imovel), { ok: true, imovel })
  }

  private trocar(lista: ImovelGestao[], novo: ImovelGestao): ImovelGestao[] {
    return lista.map((i) => (i.id === novo.id ? novo : i))
  }

  /** Só devolve sucesso se coube; senão o armazém restaura o estado anterior e a tela recebe a causa. */
  private guardar(lista: ImovelGestao[], sucesso: ResultadoImovel): ResultadoImovel {
    return this.armazem.gravar(lista) ? sucesso : { ok: false, erro: SEM_ESPACO }
  }
}
