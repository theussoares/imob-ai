import {
  aceitarConvite,
  autenticar,
  CODIGO_BLOQUEIO_DEMO_MS,
  criarConvite,
  consultarConvite,
  emitirCodigo,
  estadoAuthVazio,
  revogarConvite,
  semearContas,
  verificarCodigo,
  type ContaPublica,
  type EstadoAuth,
} from '../../domain/auth'
import { USUARIOS } from '../../domain/seed'
import type { Perfil } from '../../domain/types'

const CHAVE = 'gestao-auth-v1'
const CHAVE_PENDENTE = 'gestao-2fa-pendente'

// Bloqueio por tentativas: 5 min no demo, 15 fora (ver `CODIGO_BLOQUEIO_DEMO_MS`).
const bloqueio = (demo: boolean) => (demo ? { bloqueioMs: CODIGO_BLOQUEIO_DEMO_MS } : {})

const ERRO_CAPTCHA = 'Confirme que você não é um robô.'

/**
 * Acesso por convite em modo demonstração: orquestra `domain/auth.ts` e guarda o
 * estado (contas, convites, códigos — só hashes) no localStorage, chave
 * `gestao-auth-v1`. Sem backend: quem abre o DevTools lê tudo, então isto prova o
 * fluxo e as regras, não o sigilo (spec, «Acesso e segurança»).
 *
 * Cada operação RELÊ o localStorage antes de mexer: duas abas abertas (uma
 * aceitando o convite, outra no painel) não podem sobrescrever o estado uma da
 * outra com uma cópia velha da memória.
 *
 * O «pendente de 2º fator» fica em sessionStorage, não em `sessao`: quem passou só
 * da senha NÃO está autenticado, e fechar a aba descarta a meia-autenticação.
 */
export function useGestaoAuth() {
  const demo = !!useRuntimeConfig().public.gestaoDemo
  const estado = useState<EstadoAuth>('gestao:auth', estadoAuthVazio)
  const pendente = useState<string | null>('gestao:2fa-pendente', () => null)
  /** Só existe em demo: o código que iria por e-mail, para a faixa «Demonstração». */
  const codigoDemo = useState<string | null>('gestao:codigo-demo', () => null)
  const senhaDemo = useState<string | null>('gestao:senha-demo', () => null)

  async function ler(): Promise<EstadoAuth> {
    if (!import.meta.client) return estado.value
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (bruto) {
        const e = JSON.parse(bruto) as EstadoAuth
        if (Array.isArray(e.contas) && Array.isArray(e.convites) && Array.isArray(e.codigos)) return e
      }
    } catch {
      // JSON corrompido ou localStorage bloqueado: recomeça do estado inicial.
    }
    return estadoAuthVazio()
  }

  function gravar(e: EstadoAuth) {
    estado.value = e
    try {
      localStorage.setItem(CHAVE, JSON.stringify(e))
    } catch {
      /* janela anônima: vale só para esta sessão de página */
    }
  }

  /**
   * Carrega (e na 1ª vez semeia) o estado. Contas de exemplo só nascem em demo e a
   * senha vem de um `import()` dinâmico: fora do demo esse chunk nunca é buscado.
   */
  async function carregar() {
    if (!import.meta.client) return
    let e = await ler()
    if (demo) {
      senhaDemo.value = (await import('../../domain/auth-demo')).SENHA_DEMO
      if (e.contas.length === 0) {
        e = await semearContas(USUARIOS, senhaDemo.value)
        gravar(e)
      }
    }
    estado.value = e
    restaurarPendente()
  }

  /** Síncrono, porque o middleware de rota decide o redirecionamento com ele. */
  function restaurarPendente() {
    if (!import.meta.client || pendente.value) return
    try {
      pendente.value = sessionStorage.getItem(CHAVE_PENDENTE)
      if (demo) codigoDemo.value = sessionStorage.getItem(`${CHAVE_PENDENTE}-codigo`)
    } catch {
      /* idem */
    }
  }

  function definirPendente(email: string | null, codigo: string | null = null) {
    pendente.value = email
    codigoDemo.value = demo ? codigo : null
    try {
      if (email) sessionStorage.setItem(CHAVE_PENDENTE, email)
      else sessionStorage.removeItem(CHAVE_PENDENTE)
      if (demo && email && codigo) sessionStorage.setItem(`${CHAVE_PENDENTE}-codigo`, codigo)
      else sessionStorage.removeItem(`${CHAVE_PENDENTE}-codigo`)
    } catch {
      /* idem */
    }
  }

  // --- Login em duas etapas ---

  async function entrarComSenha(email: string, senha: string, captcha: string) {
    if (!captcha) return { ok: false as const, erro: ERRO_CAPTCHA }
    const e = await ler()
    const r = await autenticar(e, email, senha)
    if (!r.ok) return { ok: false as const, erro: r.erro }
    // Reaproveitamos o código vivo se o último saiu há menos de 60 s (`aguarde`):
    // quem erra a senha e tenta de novo não ganha 5 palpites novos nem spam de e-mail.
    const c = await emitirCodigo(e, r.conta.email, bloqueio(demo))
    if (c.ok) {
      gravar(c.estado)
      definirPendente(r.conta.email, c.codigo)
    } else if (c.motivo === 'aguarde') {
      definirPendente(r.conta.email, codigoDemo.value)
    } else {
      return { ok: false as const, erro: c.erro }
    }
    return { ok: true as const }
  }

  async function reenviar() {
    if (!pendente.value) return { ok: false as const, erro: 'Volte ao login.', segundos: 0 }
    const e = await ler()
    const c = await emitirCodigo(e, pendente.value, bloqueio(demo))
    if (!c.ok) return { ok: false as const, erro: c.erro, segundos: c.segundos ?? 0 }
    gravar(c.estado)
    definirPendente(pendente.value, c.codigo)
    return { ok: true as const }
  }

  async function verificar(codigo: string): Promise<{ ok: true; conta: ContaPublica } | { ok: false; erro: string; motivo: string; segundos?: number }> {
    if (!pendente.value) return { ok: false, erro: 'Volte ao login.', motivo: 'sem-pendente' }
    const e = await ler()
    const r = await verificarCodigo(e, pendente.value, codigo, bloqueio(demo))
    // Grava também na falha: é onde o contador de tentativas anda.
    gravar(r.estado)
    if (!r.ok) {
      const resto = r.restantes !== undefined && r.motivo === 'invalido' ? ` Restam ${r.restantes} tentativas.` : ''
      return { ok: false, erro: r.erro + resto, motivo: r.motivo, segundos: r.segundos }
    }
    definirPendente(null)
    return { ok: true, conta: r.conta }
  }

  function segundosParaReenvio(): number {
    const c = estado.value.codigos.find((x) => x.email === pendente.value)
    return c ? Math.max(0, Math.ceil((c.criadoEm + 60_000 - Date.now()) / 1000)) : 0
  }

  // --- Convites ---

  async function convidar(email: string, perfil: Perfil, convidante: { nome: string; perfil: Perfil }) {
    const r = criarConvite(await ler(), { email, perfil, convidante })
    if (r.ok) gravar(r.estado)
    return r
  }

  async function revogar(token: string) {
    const r = revogarConvite(await ler(), token)
    if (r.ok) gravar(r.estado)
    return r
  }

  async function consultar(token: string) {
    return consultarConvite(await ler(), token)
  }

  async function aceitar(token: string, nome: string, senha: string, captcha: string) {
    if (!captcha) return { ok: false as const, erro: ERRO_CAPTCHA, motivo: 'captcha' }
    const r = await aceitarConvite(await ler(), { token, nome, senha })
    if (r.ok) gravar(r.estado)
    return r
  }

  return {
    demo,
    estado,
    pendente,
    codigoDemo,
    senhaDemo,
    carregar,
    restaurarPendente,
    definirPendente,
    entrarComSenha,
    reenviar,
    verificar,
    segundosParaReenvio,
    convidar,
    revogar,
    consultar,
    aceitar,
  }
}
