import { adicionarFotos, definirCapa, moverFoto, removerFoto, type FotoNova } from '../../domain/imoveis-fotos'
import type { FotoImovel } from '../../domain/imoveis'

/**
 * Fotos escolhidas na criação, antes de o imóvel ter id. Ficam só no navegador (já reduzidas, como no envio
 * normal) e sobem DEPOIS do cadastro: assim uma falha no cadastro não deixa foto órfã no bucket.
 * Reusa as regras puras do domínio (limite, capa, ordem) com ids locais.
 */
export function useFotosPendentes() {
  const { reduzir } = useRedimensionarFoto()
  const fotos = ref<FotoImovel[]>([])
  const erro = ref('')
  const ocupado = ref(false)
  let contador = 0
  const novoId = () => `pendente-${++contador}`

  async function adicionar(arquivos: File[]) {
    erro.value = ''
    ocupado.value = true
    const novas: FotoNova[] = []
    for (const a of arquivos) {
      const f = await reduzir(a)
      if ('erro' in f) {
        erro.value = f.erro
        ocupado.value = false
        return
      }
      novas.push(f)
    }
    const r = adicionarFotos(fotos.value, novas, novoId)
    if (r.ok) fotos.value = r.fotos
    else erro.value = r.erro
    ocupado.value = false
  }

  const capa = (id: string) => { fotos.value = definirCapa(fotos.value, id) }
  const mover = (id: string, direcao: 'cima' | 'baixo') => { fotos.value = moverFoto(fotos.value, id, direcao) }
  const remover = (id: string) => { fotos.value = removerFoto(fotos.value, id) }

  /** Na ordem de envio: o servidor faz da primeira foto a capa, então a escolhida vai na frente. */
  function paraEnvio(): FotoNova[] {
    const capaPrimeiro = [...fotos.value.filter((f) => f.isCover), ...fotos.value.filter((f) => !f.isCover)]
    return capaPrimeiro.map((f) => ({ url: f.url, urlSm: f.urlSm, alt: f.alt }))
  }

  return { fotos, erro, ocupado, adicionar, capa, mover, remover, paraEnvio }
}
