import type { ImovelGestao } from '../../domain/imoveis'
import type { NovoImovel, ResultadoImovel } from '../../domain/imoveis-acoes'
import type { FotoNova } from '../../domain/imoveis-fotos'
import { queryDaListaImoveis, type FiltroListaImoveis, type PaginaImoveis } from '../../domain/imoveis-lista'
import type { PropertyStatus } from '~~/shared/models/property'
import { type ClienteGestao, paraFalha, traduzirErro } from './clienteGestao'
import type { ImoveisRepository, ResultadoExclusao } from './ImoveisRepository'

/** A rota de fotos da F5 aceita 4 por requisição (cabe nos 4,5 MB do corpo da função da Vercel). */
export const FOTOS_POR_REQUISICAO = 4

/**
 * `ImoveisRepository` sobre `/api/gestao/imoveis/**` (espelho de `properties`, spec do espelho).
 * Mesma assinatura do mock: a tela não sabe qual está usando. Cada chamada devolve o imóvel
 * inteiro, e o servidor repete a permissão (404 para o imóvel de outro corretor).
 *
 * Foto: o servidor recebe a data URL, confere os bytes e grava no bucket; o caminho é dele.
 * (A F5 descartou URL assinada para foto: o corretor não tem login de `tenant_members`, então
 * não passa na policy de storage do `/admin`.)
 */
export class HttpImoveisRepository implements ImoveisRepository {
  constructor(private readonly api: ClienteGestao) {}

  private async imovel(fn: () => Promise<ImovelGestao>): Promise<ResultadoImovel> {
    try {
      return { ok: true, imovel: await fn() }
    } catch (e) {
      const f = paraFalha(e)
      return { ok: false, erro: f.erro }
    }
  }

  listar(): Promise<ImovelGestao[]> {
    return this.api.get<ImovelGestao[]>('/api/gestao/imoveis')
  }

  /** Uma página filtrada NO SERVIDOR (busca, anúncio, finalidade, situação); cada item já traz a `situacao`. */
  pagina(f: FiltroListaImoveis): Promise<PaginaImoveis> {
    // `pagina` vai sempre: é ela que escolhe a resposta paginada (sem ela o servidor devolve o array de 200).
    return this.api.get<PaginaImoveis>('/api/gestao/imoveis', { ...queryDaListaImoveis(f), pagina: String(f.pagina) })
  }

  /** Um imóvel pelo id, ou `null` se não existe neste tenant (a lista do store só guarda os 200 mais recentes). */
  async obter(id: string): Promise<ImovelGestao | null> {
    try {
      return await this.api.get<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}`)
    } catch (e) {
      if (traduzirErro(e).status === 404) return null
      throw e
    }
  }

  criar(dados: NovoImovel) {
    return this.imovel(() => this.api.post<ImovelGestao>('/api/gestao/imoveis', dados))
  }

  atualizar(id: string, dados: NovoImovel) {
    return this.imovel(() => this.api.put<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}`, dados))
  }

  mudarStatus(id: string, status: PropertyStatus) {
    return this.imovel(() => this.api.post<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/status`, { status }))
  }

  definirDestaque(id: string, featured: boolean) {
    return this.imovel(() => this.api.post<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/destaque`, { featured }))
  }

  async excluir(id: string): Promise<ResultadoExclusao> {
    try {
      await this.api.del(`/api/gestao/imoveis/${encodeURIComponent(id)}`)
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: paraFalha(e).erro }
    }
  }

  adicionarFotos(id: string, novas: FotoNova[]) {
    return this.imovel(async () => {
      // Em lotes, em ordem: a posição de cada foto depende da contagem que o servidor leu antes.
      let ultimo: ImovelGestao | null = null
      for (let i = 0; i < novas.length; i += FOTOS_POR_REQUISICAO) {
        ultimo = await this.api.post<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/fotos`, { fotos: novas.slice(i, i + FOTOS_POR_REQUISICAO) })
      }
      return ultimo ?? (await this.api.get<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}`))
    })
  }

  definirCapa(id: string, fotoId: string) {
    return this.imovel(() => this.api.post<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/fotos/${encodeURIComponent(fotoId)}/capa`))
  }

  moverFoto(id: string, fotoId: string, direcao: 'cima' | 'baixo') {
    return this.imovel(() => this.api.post<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/fotos/${encodeURIComponent(fotoId)}/mover`, { direcao }))
  }

  removerFoto(id: string, fotoId: string) {
    return this.imovel(() => this.api.del<ImovelGestao>(`/api/gestao/imoveis/${encodeURIComponent(id)}/fotos/${encodeURIComponent(fotoId)}`))
  }
}
