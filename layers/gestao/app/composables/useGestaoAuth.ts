import {
  aceitarConvite,
  autenticar,
  CODIGO_BLOQUEIO_DEMO_MS,
  consultarConvite,
  consultarRecuperacao,
  criarConvite,
  criarRecuperacao,
  emitirCodigo,
  estadoAuthVazio,
  redefinirSenha as redefinirSenhaDemo,
  revogarConvite,
  semearContas,
  verificarCodigo,
  type ContaPublica,
  type EstadoAuth,
} from '../../domain/auth'
import { USUARIOS } from '../../domain/seed'
import type { MatrizPermissoes, MembroGestaoLista, Perfil, Sessao } from '../../domain/types'
import { paraFalha } from '../services/clienteGestao'
import { guardarTokens, tokenAtual } from '../services/tokensGestao'

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
  const http = useGestaoHttp()
  // `http` nunca é demo: sem «Acesso rápido», sem contas de exemplo, sem código à mostra.
  const demo = !!useRuntimeConfig().public.gestaoDemo && !http
  const estado = useState<EstadoAuth>('gestao:auth', estadoAuthVazio)
  const pendente = useState<string | null>('gestao:2fa-pendente', () => null)
  /** Só existe em demo: o código que iria por e-mail, para a faixa «Demonstração». */
  const codigoDemo = useState<string | null>('gestao:codigo-demo', () => null)
  const senhaDemo = useState<string | null>('gestao:senha-demo', () => null)

  // --- http: o servidor é quem autentica; aqui só se chama e se guarda o que não é segredo ---
  const api = http ? useGestaoApi() : null
  const cfg = useRuntimeConfig().public
  const { definir } = useGestaoSessao()
  /** Quando o reenvio do código volta a valer (ms). Em memória: não é segredo, só contagem. */
  const reenvioEm = useState<number>('gestao:reenvio-em', () => 0)

  const marcarReenvio = (segundos: number) => (reenvioEm.value = Date.now() + Math.max(0, segundos) * 1000)

  async function entrarComSenhaHttp(email: string, senha: string, captcha: string) {
    if (!captcha) return { ok: false as const, erro: ERRO_CAPTCHA }
    try {
      const r = await api!.post<{ accessToken: string; expiresAt: number | null; codigo: { segundos?: number } }>(
        '/api/gestao/auth/login',
        { email, senha, captcha },
        { semToken: true },
      )
      // Acesso em memória; o refresh fica no cookie HttpOnly (ver tokensGestao.ts). Sozinhos não abrem nada: falta o código do e-mail.
      await guardarTokens(r)
      marcarReenvio(r.codigo?.segundos ?? 60)
      definirPendente(email.trim().toLowerCase())
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, erro: paraFalha(e).erro }
    }
  }

  async function reenviarHttp() {
    if (!pendente.value) return { ok: false as const, erro: 'Volte ao login.', segundos: 0 }
    try {
      const r = await api!.post<{ segundos?: number }>('/api/gestao/auth/reenviar')
      marcarReenvio(r.segundos ?? 60)
      return { ok: true as const }
    } catch (e) {
      const f = paraFalha(e)
      if (f.segundos) marcarReenvio(f.segundos)
      return { ok: false as const, erro: f.erro, segundos: f.segundos ?? 0 }
    }
  }

  async function verificarHttp(codigo: string): Promise<{ ok: true; conta: ContaPublica } | { ok: false; erro: string; motivo: string; segundos?: number }> {
    if (!pendente.value || !tokenAtual()) {
      // Sem token: a renovação pelo cookie falhou (expirou ou nunca houve login).
      definirPendente(null)
      return { ok: false, erro: 'Sua sessão expirou. Entre de novo.', motivo: 'sem-pendente' }
    }
    try {
      const r = await api!.post<{ membro: { nome: string; perfil: Perfil }; sessao: Sessao; matriz: MatrizPermissoes }>('/api/gestao/auth/codigo', { codigo })
      // A sessão só nasce AQUI, depois do 2º fator, e vem do servidor (perfil, nome e corretor).
      definir(r.sessao)
      useState<MatrizPermissoes>('gestao:matriz').value = r.matriz
      const email = pendente.value
      definirPendente(null)
      return { ok: true, conta: { email, nome: r.membro.nome, perfil: r.membro.perfil } }
    } catch (e) {
      const f = paraFalha(e)
      const resto = f.restantes !== undefined && f.motivo === 'invalido' ? ` Restam ${f.restantes} tentativas.` : ''
      return { ok: false, erro: f.erro + resto, motivo: f.motivo ?? (f.sessaoExpirada ? 'sessao' : 'erro'), segundos: f.segundos }
    }
  }

  /** Convites e contas a partir de `GET /membros` (só quem pode convidar ou administrar lê). */
  async function carregarMembrosHttp() {
    try {
      const { data } = await api!.get<{ data: MembroGestaoLista[] }>('/api/gestao/membros')
      const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0)
      estado.value = {
        codigos: [],
        contas: data.filter((m) => m.status === 'ativo').map((m) => ({ email: m.email, nome: m.nome, perfil: m.perfil, salt: '', senhaHash: '' })),
        // `token` é o id do registro: a revogação (`DELETE /membros/:id`) é por id, e o link nunca sai do servidor.
        convites: data
          .filter((m) => m.status === 'pendente')
          .map((m) => ({ token: m.id, email: m.email, perfil: m.perfil, criadoPor: m.convidadoPor, criadoEm: ms(m.criadoEm), expiraEm: ms(m.conviteExpiraEm), usadoEm: null, revogadoEm: null })),
      }
    } catch {
      /* sem permissão para listar (403) ou fora do ar: a tela mostra vazio */
    }
  }

  async function convidarHttp(email: string, perfil: Perfil, brokerId?: string) {
    try {
      const r = await api!.post<{ membro: MembroGestaoLista; emailEnviado: boolean }>('/api/gestao/membros', { email, perfil, ...(brokerId && { brokerId }) })
      await carregarMembrosHttp()
      const m = r.membro
      return {
        ok: true as const,
        emailEnviado: r.emailEnviado,
        convite: { token: m.id, email: m.email, perfil: m.perfil, criadoPor: m.convidadoPor, criadoEm: Date.parse(m.criadoEm), expiraEm: m.conviteExpiraEm ? Date.parse(m.conviteExpiraEm) : 0, usadoEm: null, revogadoEm: null },
      }
    } catch (e) {
      return { ok: false as const, erro: paraFalha(e).erro }
    }
  }

  async function revogarHttp(id: string) {
    try {
      await api!.del(`/api/gestao/membros/${encodeURIComponent(id)}`)
      await carregarMembrosHttp()
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, erro: paraFalha(e).erro }
    }
  }

  async function consultarHttp(token: string) {
    try {
      const r = await api!.get<{ ok: boolean; motivo?: string; erro?: string; convite?: { email: string; perfil: Perfil; nome: string } }>(`/api/gestao/auth/convite/${encodeURIComponent(token)}`)
      if (r.ok && r.convite) {
        return { ok: true as const, convite: { token, email: r.convite.email, perfil: r.convite.perfil, criadoPor: '', criadoEm: 0, expiraEm: 0, usadoEm: null, revogadoEm: null } }
      }
      return { ok: false as const, motivo: (r.motivo ?? 'inexistente') as 'inexistente', erro: r.erro ?? 'Convite indisponível.' }
    } catch (e) {
      return { ok: false as const, motivo: 'inexistente' as const, erro: paraFalha(e).erro }
    }
  }

  async function aceitarHttp(token: string, nome: string, senha: string, captcha: string) {
    if (!captcha) return { ok: false as const, erro: ERRO_CAPTCHA, motivo: 'captcha' }
    try {
      await api!.post('/api/gestao/auth/aceitar', { token, nome, senha, captcha }, { semToken: true })
      return { ok: true as const }
    } catch (e) {
      const f = paraFalha(e)
      return { ok: false as const, erro: f.erro, motivo: f.motivo ?? 'erro' }
    }
  }

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
    if (http) {
      restaurarPendente()
      if (useGestaoSessao().sessao.value) await carregarMembrosHttp()
      return
    }
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
    // `http`: o pendente só vale com o token em memória; sem ele (página recarregada) volta ao login.
    if (http && !tokenAtual()) return
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
    if (http) return entrarComSenhaHttp(email, senha, captcha)
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
    if (http) return reenviarHttp()
    if (!pendente.value) return { ok: false as const, erro: 'Volte ao login.', segundos: 0 }
    const e = await ler()
    const c = await emitirCodigo(e, pendente.value, bloqueio(demo))
    if (!c.ok) return { ok: false as const, erro: c.erro, segundos: c.segundos ?? 0 }
    gravar(c.estado)
    definirPendente(pendente.value, c.codigo)
    return { ok: true as const }
  }

  async function verificar(codigo: string): Promise<{ ok: true; conta: ContaPublica } | { ok: false; erro: string; motivo: string; segundos?: number }> {
    if (http) return verificarHttp(codigo)
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
    if (http) return Math.max(0, Math.ceil((reenvioEm.value - Date.now()) / 1000))
    const c = estado.value.codigos.find((x) => x.email === pendente.value)
    return c ? Math.max(0, Math.ceil((c.criadoEm + 60_000 - Date.now()) / 1000)) : 0
  }

  // --- Convites ---

  async function convidar(email: string, perfil: Perfil, convidante: { nome: string; perfil: Perfil }, brokerId?: string) {
    if (http) return convidarHttp(email, perfil, brokerId)
    const r = criarConvite(await ler(), { email, perfil, convidante })
    if (r.ok) gravar(r.estado)
    return r
  }

  async function revogar(token: string) {
    if (http) return revogarHttp(token)
    const r = revogarConvite(await ler(), token)
    if (r.ok) gravar(r.estado)
    return r
  }

  async function consultar(token: string) {
    if (http) return consultarHttp(token)
    return consultarConvite(await ler(), token)
  }

  async function aceitar(token: string, nome: string, senha: string, captcha: string) {
    if (http) return aceitarHttp(token, nome, senha, captcha)
    if (!captcha) return { ok: false as const, erro: ERRO_CAPTCHA, motivo: 'captcha' }
    const r = await aceitarConvite(await ler(), { token, nome, senha })
    if (r.ok) gravar(r.estado)
    return r
  }

  // --- Recuperação de senha ---

  /**
   * Pede o link. A resposta é a mesma exista a conta ou não (o servidor também não diz). Só o demo devolve o
   * link, porque não há e-mail: fora dele `linkDemo` é sempre `null`.
   */
  async function recuperar(email: string, captcha: string): Promise<{ ok: true; linkDemo: string | null } | { ok: false; erro: string }> {
    if (!captcha) return { ok: false, erro: ERRO_CAPTCHA }
    if (http) {
      try {
        await api!.post('/api/gestao/auth/recuperar', { email, captcha }, { semToken: true })
        return { ok: true, linkDemo: null }
      } catch (e) {
        return { ok: false, erro: paraFalha(e).erro }
      }
    }
    const r = criarRecuperacao(await ler(), email)
    if (r.token) gravar(r.estado)
    return { ok: true, linkDemo: r.token ? `${window.location.origin}/gestao/redefinir-senha?token_hash=${r.token}` : null }
  }

  /** Só diz se o link ainda parece vivo (demo). No http o servidor só descobre ao gastar o token, de propósito. */
  async function linkDeRecuperacaoValido(token: string): Promise<boolean> {
    if (http) return !!token
    return consultarRecuperacao(await ler(), token).ok
  }

  async function redefinir(token: string, senha: string, captcha: string): Promise<{ ok: true } | { ok: false; erro: string; motivo: string }> {
    if (!captcha) return { ok: false, erro: ERRO_CAPTCHA, motivo: 'captcha' }
    if (http) {
      try {
        await api!.post('/api/gestao/auth/redefinir', { tokenHash: token, senha, captcha }, { semToken: true })
        return { ok: true }
      } catch (e) {
        const f = paraFalha(e)
        return { ok: false, erro: f.erro, motivo: f.motivo ?? 'erro' }
      }
    }
    const r = await redefinirSenhaDemo(await ler(), { token, senha })
    gravar(r.estado)
    return r.ok ? { ok: true } : { ok: false, erro: r.erro, motivo: r.motivo }
  }

  return {
    demo,
    http,
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
    recuperar,
    linkDeRecuperacaoValido,
    redefinir,
  }
}
