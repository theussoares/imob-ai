import type { Perfil, UsuarioGestao } from './types'

/**
 * Acesso por convite + senha forte + 2º fator por e-mail, como funções PURAS:
 * recebem o estado e devolvem um novo (a entrada nunca é mutada), no mesmo
 * espírito de `acoes.ts`. Por que puro: é aqui que mora a regra de segurança, e
 * só dá para provar «convite expirado não vira conta» ou «6ª tentativa não passa»
 * em teste de Node se o relógio, o sorteio e o hash entram por parâmetro. Quando o
 * backend existir (Supabase Auth + tabela `gestao_otp`), estas regras migram para
 * o servidor sem mudar a tela.
 *
 * ATENÇÃO — é demonstração: o estado vive no localStorage do navegador, então
 * quem tem o aparelho lê tudo. Nada daqui substitui o servidor. O que o demo
 * garante é o FLUXO e as regras, não o sigilo.
 */

export const SENHA_MIN = 12
export const CONVITE_VALIDADE_MS = 72 * 60 * 60 * 1000
/** Link de nova senha: curto, porque quem o tem troca a senha da conta. */
export const RECUPERACAO_VALIDADE_MS = 30 * 60 * 1000
export const CODIGO_VALIDADE_MS = 10 * 60 * 1000
export const CODIGO_MAX_TENTATIVAS = 5
export const CODIGO_REENVIO_MS = 60 * 1000
/**
 * Depois de esgotar as tentativas o código fica travado — e um código novo
 * também. Sem isso o limite de 5 não limitaria nada: quem já sabe a senha pediria
 * outro código a cada minuto e ganharia 5 palpites novos (1 milhão de combinações).
 */
export const CODIGO_BLOQUEIO_MS = 15 * 60 * 1000
/**
 * No demo o bloqueio dura 5 min (`public.gestaoDemo`): numa apresentação ou num QA
 * quem erra 5 vezes não pode ficar 15 min sem conseguir testar o código certo.
 * Quem escolhe é o chamador (`Deps.bloqueioMs`); fora do demo vale o de 15 min.
 */
export const CODIGO_BLOQUEIO_DEMO_MS = 5 * 60 * 1000

const minutos = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
const msgBloqueio = (ms: number) =>
  `Muitas tentativas. Tente de novo em ${minutos(ms)} ${minutos(ms) === 1 ? 'minuto' : 'minutos'}.`

/** Mensagem única de falha no login: não revela se o e-mail tem conta. */
export const ERRO_LOGIN = 'E-mail ou senha incorretos'

export interface Conta {
  email: string
  nome: string
  perfil: Perfil
  /** SHA-256(salt + senha). Nunca a senha. Em produção: argon2/bcrypt no Supabase Auth. */
  senhaHash: string
  salt: string
}

export interface Convite {
  /** Em produção só o hash do token ficaria no banco e o link seria mostrado uma vez. */
  token: string
  email: string
  perfil: Perfil
  criadoPor: string
  criadoEm: number
  expiraEm: number
  usadoEm: number | null
  revogadoEm: number | null
}

export interface CodigoPendente {
  email: string
  /** SHA-256(salt:email:código). O código em si só existe no e-mail (no demo, na faixa). */
  codigoHash: string
  salt: string
  criadoEm: number
  expiraEm: number
  tentativas: number
  bloqueadoAte: number | null
  usado: boolean
}

/** Pedido de nova senha (demo). Em produção o token é do Supabase Auth e nunca fica em tela nem em localStorage. */
export interface Recuperacao {
  token: string
  email: string
  criadoEm: number
  expiraEm: number
  usadoEm: number | null
}

export interface EstadoAuth {
  contas: Conta[]
  convites: Convite[]
  codigos: CodigoPendente[]
  /** Ausente em estado guardado antes da recuperação de senha. */
  recuperacoes?: Recuperacao[]
}

export type ContaPublica = Pick<Conta, 'email' | 'nome' | 'perfil'>

/**
 * Sempre devolve `estado` — inclusive na falha. Contar tentativa errada É uma
 * mudança de estado que precisa ser gravada; devolver só `erro` deixaria o
 * chamador esquecer de persistir o contador e o limite de 5 viraria enfeite.
 */
export type ResultadoAuth<T extends object = object> =
  | ({ ok: true; estado: EstadoAuth } & T)
  | { ok: false; estado: EstadoAuth; motivo: string; erro: string; segundos?: number; restantes?: number }

// --- Dependências injetáveis (relógio, sorteio, hash) ---

export type Hasher = (texto: string) => Promise<string>
export type Sorteio = (n: number) => Uint8Array

export interface Deps {
  agora: number
  rng: Sorteio
  hash: Hasher
  /** Duração do bloqueio por tentativas; o demo usa `CODIGO_BLOQUEIO_DEMO_MS`. */
  bloqueioMs: number
}

/**
 * SHA-256 por `globalThis.crypto.subtle`: existe igual no navegador e no Node ≥ 19
 * (o dos testes), então uma implementação só serve aos dois, sem `node:crypto`
 * que o bundle do client não carrega.
 */
export const sha256Hex: Hasher = async (texto) => {
  const bytes = new TextEncoder().encode(texto)
  const h = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** `Math.random` é previsível; token e código vêm do gerador criptográfico. */
export const sorteioSeguro: Sorteio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))

/** `{ bloqueioMs: undefined }` não pode apagar o padrão: um bloqueio de NaN ms não bloquearia nada. */
const semIndefinidos = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

function deps(parcial: Partial<Deps> = {}): Deps {
  return { agora: Date.now(), rng: sorteioSeguro, hash: sha256Hex, bloqueioMs: CODIGO_BLOQUEIO_MS, ...semIndefinidos(parcial) }
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

/** Comparação sem sair no primeiro byte diferente (o tempo não conta onde errou). */
export function iguaisConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const normalizarEmail = (email: string) => email.trim().toLowerCase()
export const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const falha = (
  estado: EstadoAuth,
  motivo: string,
  erro: string,
  extra: { segundos?: number; restantes?: number } = {},
): ResultadoAuth<never> => ({ ok: false, estado, motivo, erro, ...extra })

// --- Senha ---

/**
 * Senhas que passam nas regras de caractere mas caem em minutos num ataque de
 * dicionário (`Senha@123456` cumpre tudo e é a primeira que se tenta). Lista curta
 * de propósito: o corte real é o tamanho e a mistura; isto só barra o óbvio.
 * Comparada pela forma só-letras, então `Senha@123456` e `senha2024!!` caem juntas.
 */
const COMUNS = [
  'senha', 'senhaforte', 'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'admin', 'administrador',
  'mudar', 'mudar123', 'trocar', 'imobiliaria', 'gestao', 'brasil', 'brasil123', 'abcdef', 'abcdefghijkl',
  'letmein', 'welcome', 'bemvindo', 'olmi', 'corretor',
]

export interface ContextoSenha {
  email?: string
  nome?: string
}

interface Requisito {
  id: string
  rotulo: string
  ok: (senha: string, ctx: ContextoSenha) => boolean
}

function contemDadoPessoal(senha: string, ctx: ContextoSenha): boolean {
  const s = semAcento(senha)
  const parteLocal = semAcento((ctx.email ?? '').split('@')[0] ?? '')
  if (parteLocal.length >= 3 && s.includes(parteLocal)) return true
  return semAcento(ctx.nome ?? '')
    .split(/\s+/)
    .some((p) => p.length >= 3 && s.includes(p))
}

function ehComum(senha: string): boolean {
  const baixa = senha.toLowerCase()
  const soLetras = baixa.replace(/[^a-z]/g, '')
  return COMUNS.includes(baixa) || COMUNS.includes(soLetras) || /(.)\1{5,}/.test(senha) || /(?:0123|1234|2345|3456|4567|5678|6789)/.test(senha)
}

/** Fonte única das regras: a validação e a lista de requisitos da tela saem daqui. */
export const REQUISITOS_SENHA: readonly Requisito[] = [
  { id: 'tamanho', rotulo: `Pelo menos ${SENHA_MIN} caracteres`, ok: (s) => s.length >= SENHA_MIN },
  { id: 'maiuscula', rotulo: 'Uma letra maiúscula', ok: (s) => /\p{Lu}/u.test(s) },
  { id: 'minuscula', rotulo: 'Uma letra minúscula', ok: (s) => /\p{Ll}/u.test(s) },
  { id: 'numero', rotulo: 'Um número', ok: (s) => /\d/.test(s) },
  { id: 'simbolo', rotulo: 'Um símbolo (como ! @ # $ %)', ok: (s) => /[^\p{L}\d\s]/u.test(s) },
  { id: 'pessoal', rotulo: 'Sem seu e-mail nem seu nome', ok: (s, c) => !contemDadoPessoal(s, c) },
  { id: 'comum', rotulo: 'Não pode ser uma senha comum nem sequência', ok: (s) => !ehComum(s) },
]

export interface ResultadoSenha {
  ok: boolean
  falhas: string[]
  /** 0 (vazia/muito fraca) … 4 (forte e longa) — alimenta o medidor. */
  forca: 0 | 1 | 2 | 3 | 4
}

export function validarSenha(senha: string, ctx: ContextoSenha = {}): ResultadoSenha {
  const falhas = REQUISITOS_SENHA.filter((r) => !r.ok(senha, ctx)).map((r) => r.rotulo)
  const ok = falhas.length === 0
  const passou = REQUISITOS_SENHA.length - falhas.length
  let forca: ResultadoSenha['forca']
  if (!senha) forca = 0
  else if (ok) forca = senha.length >= 16 ? 4 : 3
  else forca = Math.min(2, Math.floor(passou / 3)) as 0 | 1 | 2
  return { ok, falhas, forca }
}

async function hashSenha(senha: string, salt: string, hash: Hasher): Promise<string> {
  return hash(`${salt}:${senha}`)
}

// --- Semeadura ---

export const estadoAuthVazio = (): EstadoAuth => ({ contas: [], convites: [], codigos: [] })

/**
 * Cria uma conta por usuário de exemplo. A senha entra por parâmetro — o código de
 * produção não carrega literal nenhum: quem a conhece é `auth-demo.ts`, que só é
 * importado com `public.gestaoDemo` ligado.
 */
export async function semearContas(
  usuarios: UsuarioGestao[],
  senha: string,
  parcial: Partial<Deps> = {},
): Promise<EstadoAuth> {
  const d = deps(parcial)
  const contas: Conta[] = []
  for (const u of usuarios) {
    const salt = hex(d.rng(16))
    contas.push({
      email: normalizarEmail(u.mail),
      nome: u.nome,
      perfil: u.perfil,
      salt,
      senhaHash: await hashSenha(senha, salt, d.hash),
    })
  }
  return { ...estadoAuthVazio(), contas }
}

// --- Convites ---

export type StatusConvite = 'pendente' | 'usado' | 'revogado' | 'expirado'

export function statusConvite(c: Convite, agora: number): StatusConvite {
  if (c.usadoEm !== null) return 'usado'
  if (c.revogadoEm !== null) return 'revogado'
  if (agora >= c.expiraEm) return 'expirado'
  return 'pendente'
}

const PERFIS_VALIDOS: Perfil[] = ['corretor', 'recepcao', 'juridico', 'dono']

export function criarConvite(
  estado: EstadoAuth,
  dados: { email: string; perfil: Perfil; convidante: { nome: string; perfil: Perfil } },
  parcial: Partial<Deps> = {},
): ResultadoAuth<{ convite: Convite }> {
  const d = deps(parcial)
  const email = normalizarEmail(dados.email)
  if (!emailValido(email)) return falha(estado, 'email', 'Informe um e-mail válido.')
  if (!PERFIS_VALIDOS.includes(dados.perfil)) return falha(estado, 'perfil', 'Escolha um perfil.')
  // Sem isto o Jurídico se promoveria a Dono convidando um e-mail dele: o perfil
  // de quem convida é teto do perfil convidado.
  if (dados.perfil === 'dono' && dados.convidante.perfil !== 'dono')
    return falha(estado, 'perfil', 'Só o Dono pode convidar outro Dono.')
  if (estado.contas.some((c) => c.email === email))
    return falha(estado, 'existente', 'Já existe uma conta com este e-mail.')

  const convite: Convite = {
    token: hex(d.rng(32)),
    email,
    perfil: dados.perfil,
    criadoPor: dados.convidante.nome,
    criadoEm: d.agora,
    expiraEm: d.agora + CONVITE_VALIDADE_MS,
    usadoEm: null,
    revogadoEm: null,
  }
  // Um convite vivo por e-mail: o anterior é cancelado, senão dois links com
  // perfis diferentes ficariam válidos ao mesmo tempo para o mesmo endereço.
  const convites = estado.convites.map((c) =>
    c.email === email && statusConvite(c, d.agora) === 'pendente' ? { ...c, revogadoEm: d.agora } : c,
  )
  return { ok: true, estado: { ...estado, convites: [convite, ...convites] }, convite }
}

export function revogarConvite(estado: EstadoAuth, token: string, parcial: Partial<Deps> = {}): ResultadoAuth {
  const d = deps(parcial)
  const c = estado.convites.find((x) => x.token === token)
  if (!c) return falha(estado, 'inexistente', 'Convite não encontrado.')
  if (statusConvite(c, d.agora) !== 'pendente') return falha(estado, 'encerrado', 'Este convite já foi usado, cancelado ou expirou.')
  return {
    ok: true,
    estado: { ...estado, convites: estado.convites.map((x) => (x.token === token ? { ...x, revogadoEm: d.agora } : x)) },
  }
}

const ERRO_CONVITE: Record<Exclude<StatusConvite, 'pendente'> | 'inexistente', string> = {
  inexistente: 'Este convite não existe. Peça um novo a quem convidou você.',
  usado: 'Este convite já foi usado. Se foi você, entre com e-mail e senha.',
  revogado: 'Este convite foi cancelado. Peça um novo a quem convidou você.',
  expirado: 'Este convite expirou (vale 72 horas). Peça um novo a quem convidou você.',
}

/** Valida o token SEM consumi-lo — a tela do convite usa para decidir o que mostrar. */
export function consultarConvite(
  estado: EstadoAuth,
  token: string,
  parcial: Partial<Deps> = {},
): { ok: true; convite: Convite } | { ok: false; motivo: keyof typeof ERRO_CONVITE; erro: string } {
  const d = deps(parcial)
  // Token não é buscado por prefixo nem por `includes`: igualdade exata.
  const c = token ? estado.convites.find((x) => x.token === token) : undefined
  if (!c) return { ok: false, motivo: 'inexistente', erro: ERRO_CONVITE.inexistente }
  const s = statusConvite(c, d.agora)
  if (s !== 'pendente') return { ok: false, motivo: s, erro: ERRO_CONVITE[s] }
  return { ok: true, convite: c }
}

export async function aceitarConvite(
  estado: EstadoAuth,
  dados: { token: string; nome: string; senha: string },
  parcial: Partial<Deps> = {},
): Promise<ResultadoAuth<{ conta: ContaPublica }>> {
  const d = deps(parcial)
  const q = consultarConvite(estado, dados.token, d)
  if (!q.ok) return falha(estado, q.motivo, q.erro)
  const { convite } = q

  const nome = dados.nome.trim().replace(/\s+/g, ' ')
  if (nome.length < 2) return falha(estado, 'nome', 'Informe seu nome.')
  // Revalida no "servidor": o botão desabilitado da tela não é barreira nenhuma.
  const v = validarSenha(dados.senha, { email: convite.email, nome })
  if (!v.ok) return falha(estado, 'senha', 'A senha não cumpre os requisitos.')
  // Corrida de duas abas: se a conta nasceu nesse meio-tempo o convite não vale.
  if (estado.contas.some((c) => c.email === convite.email)) return falha(estado, 'usado', ERRO_CONVITE.usado)

  const salt = hex(d.rng(16))
  const conta: Conta = {
    email: convite.email,
    nome,
    // O perfil vem do CONVITE, nunca do formulário: quem aceita não escolhe o que será.
    perfil: convite.perfil,
    salt,
    senhaHash: await hashSenha(dados.senha, salt, d.hash),
  }
  return {
    ok: true,
    conta: { email: conta.email, nome: conta.nome, perfil: conta.perfil },
    estado: {
      ...estado,
      contas: [...estado.contas, conta],
      convites: estado.convites.map((c) => (c.token === convite.token ? { ...c, usadoEm: d.agora } : c)),
    },
  }
}

// --- Recuperação de senha ---

export const ERRO_RECUPERACAO = 'Este link expirou ou já foi usado. Peça um novo na tela de login.'

/**
 * Pedido de nova senha. Sem token na resposta quando a conta não existe, mas a tela diz a MESMA coisa nos
 * dois casos: o demo mostra o link só porque não há e-mail, e só para conta que existe (o demo não tem
 * o que esconder; em produção a resposta é igual e o link vai só por e-mail).
 */
export function criarRecuperacao(estado: EstadoAuth, email: string, parcial: Partial<Deps> = {}): { estado: EstadoAuth; token: string | null } {
  const d = deps(parcial)
  const e = normalizarEmail(email)
  if (!estado.contas.some((c) => c.email === e)) return { estado, token: null }
  const token = hex(d.rng(24))
  const rec: Recuperacao = { token, email: e, criadoEm: d.agora, expiraEm: d.agora + RECUPERACAO_VALIDADE_MS, usadoEm: null }
  // Um pedido novo invalida o anterior da mesma conta: só o último e-mail vale.
  const outras = (estado.recuperacoes ?? []).filter((r) => r.email !== e || r.usadoEm !== null)
  return { estado: { ...estado, recuperacoes: [...outras, rec] }, token }
}

export function consultarRecuperacao(estado: EstadoAuth, token: string, parcial: Partial<Deps> = {}): { ok: true; recuperacao: Recuperacao } | { ok: false; erro: string } {
  const d = deps(parcial)
  const r = (estado.recuperacoes ?? []).find((x) => x.token === token)
  if (!r || r.usadoEm !== null || r.expiraEm <= d.agora) return { ok: false, erro: ERRO_RECUPERACAO }
  return { ok: true, recuperacao: r }
}

/** Troca a senha da conta e gasta o link. Não abre sessão: o login segue pedindo senha e código. */
export async function redefinirSenha(
  estado: EstadoAuth,
  dados: { token: string; senha: string },
  parcial: Partial<Deps> = {},
): Promise<ResultadoAuth> {
  const d = deps(parcial)
  const q = consultarRecuperacao(estado, dados.token, d)
  if (!q.ok) return falha(estado, 'link', q.erro)
  const conta = estado.contas.find((c) => c.email === q.recuperacao.email)
  if (!conta) return falha(estado, 'link', ERRO_RECUPERACAO)
  if (!validarSenha(dados.senha, { email: conta.email, nome: conta.nome }).ok) return falha(estado, 'senha', 'A senha não cumpre os requisitos.')

  const salt = hex(d.rng(16))
  const senhaHash = await hashSenha(dados.senha, salt, d.hash)
  return {
    ok: true,
    estado: {
      ...estado,
      contas: estado.contas.map((c) => (c.email === conta.email ? { ...c, salt, senhaHash } : c)),
      recuperacoes: (estado.recuperacoes ?? []).map((r) => (r.token === dados.token ? { ...r, usadoEm: d.agora } : r)),
      // Código pendente de antes da troca não vale mais: quem tinha a senha antiga não segue entrando.
      codigos: estado.codigos.filter((c) => c.email !== conta.email),
    },
  }
}

// --- Login ---

/**
 * Confere e-mail + senha. A mensagem é a MESMA para conta inexistente e senha
 * errada, e o hash é calculado nos dois casos: responder mais rápido quando a
 * conta não existe contaria a diferença do mesmo jeito que a mensagem.
 */
export async function autenticar(
  estado: EstadoAuth,
  email: string,
  senha: string,
  parcial: Partial<Deps> = {},
): Promise<ResultadoAuth<{ conta: ContaPublica }>> {
  const d = deps(parcial)
  const alvo = normalizarEmail(email)
  const conta = estado.contas.find((c) => c.email === alvo)
  const calculado = await hashSenha(senha, conta?.salt ?? '0'.repeat(32), d.hash)
  if (!conta || !iguaisConstante(calculado, conta.senhaHash)) return falha(estado, 'credenciais', ERRO_LOGIN)
  return { ok: true, estado, conta: { email: conta.email, nome: conta.nome, perfil: conta.perfil } }
}

// --- 2º fator (código de 6 dígitos) ---

/** 6 dígitos sem viés: descarta o que cai no resto incompleto do módulo. */
export function gerarCodigo(rng: Sorteio = sorteioSeguro): string {
  const LIMITE = Math.floor(2 ** 32 / 1_000_000) * 1_000_000
  for (;;) {
    const b = rng(4)
    const n = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0
    if (n < LIMITE) return String(n % 1_000_000).padStart(6, '0')
  }
}

const hashCodigo = (salt: string, email: string, codigo: string, hash: Hasher) => hash(`${salt}:${email}:${codigo}`)

/** Segundos até poder pedir outro código (0 = já pode). Alimenta a contagem da tela. */
export function segundosParaReenvio(estado: EstadoAuth, email: string, agora: number): number {
  const c = estado.codigos.find((x) => x.email === normalizarEmail(email))
  if (!c) return 0
  return Math.max(0, Math.ceil((c.criadoEm + CODIGO_REENVIO_MS - agora) / 1000))
}

/**
 * Emite um código novo. O código em texto sai SÓ no retorno (para o e-mail — no
 * demo, a faixa); no estado fica o hash. Um código por e-mail: o novo invalida o
 * anterior, senão dois códigos válidos duplicariam os palpites possíveis.
 */
export async function emitirCodigo(
  estado: EstadoAuth,
  email: string,
  parcial: Partial<Deps> = {},
): Promise<ResultadoAuth<{ codigo: string }>> {
  const d = deps(parcial)
  const alvo = normalizarEmail(email)
  const atual = estado.codigos.find((c) => c.email === alvo)
  if (atual?.bloqueadoAte && d.agora < atual.bloqueadoAte)
    return falha(estado, 'bloqueado', msgBloqueio(atual.bloqueadoAte - d.agora), {
      segundos: Math.ceil((atual.bloqueadoAte - d.agora) / 1000),
    })
  const espera = segundosParaReenvio(estado, alvo, d.agora)
  // Código já consumido não segura o próximo: sem isso, entrar, sair e entrar de novo
  // em menos de 60 s reaproveitaria um código usado e o login ficaria sem saída.
  if (atual && !atual.usado && espera > 0)
    return falha(estado, 'aguarde', `Aguarde ${espera} s para pedir outro código.`, { segundos: espera })

  const codigo = gerarCodigo(d.rng)
  const salt = hex(d.rng(16))
  const novo: CodigoPendente = {
    email: alvo,
    salt,
    codigoHash: await hashCodigo(salt, alvo, codigo, d.hash),
    criadoEm: d.agora,
    expiraEm: d.agora + CODIGO_VALIDADE_MS,
    tentativas: 0,
    bloqueadoAte: null,
    usado: false,
  }
  return { ok: true, codigo, estado: { ...estado, codigos: [...estado.codigos.filter((c) => c.email !== alvo), novo] } }
}

const ERRO_CODIGO_INVALIDO = 'Código incorreto.'

export async function verificarCodigo(
  estado: EstadoAuth,
  email: string,
  codigo: string,
  parcial: Partial<Deps> = {},
): Promise<ResultadoAuth<{ conta: ContaPublica }>> {
  const d = deps(parcial)
  const alvo = normalizarEmail(email)
  const original = estado.codigos.find((x) => x.email === alvo)
  const conta = estado.contas.find((x) => x.email === alvo)
  // Bloqueio vencido: o relógio zera as tentativas. Sem isso o contador ficaria em 5
  // e o PRIMEIRO erro depois do prazo bloquearia de novo, sem chance de digitar o certo.
  const c =
    original && original.bloqueadoAte !== null && d.agora >= original.bloqueadoAte
      ? { ...original, tentativas: 0, bloqueadoAte: null }
      : original
  if (!c || c.usado || !conta) return falha(estado, 'inexistente', 'Código inválido ou expirado. Peça um novo.')

  // Bloqueio vem ANTES da comparação: com o código certo digitado depois da 5ª
  // falha a resposta tem que ser a mesma — senão o bloqueio vira um oráculo.
  if (c.bloqueadoAte && d.agora < c.bloqueadoAte)
    return falha(estado, 'bloqueado', msgBloqueio(c.bloqueadoAte - d.agora), {
      segundos: Math.ceil((c.bloqueadoAte - d.agora) / 1000),
    })
  if (d.agora >= c.expiraEm) return falha(estado, 'expirado', 'Este código expirou. Peça um novo.')

  const certo = iguaisConstante(await hashCodigo(c.salt, alvo, codigo.trim(), d.hash), c.codigoHash)
  if (certo) {
    return {
      ok: true,
      conta: { email: conta.email, nome: conta.nome, perfil: conta.perfil },
      estado: { ...estado, codigos: estado.codigos.map((x) => (x === original ? { ...c, usado: true, tentativas: 0 } : x)) },
    }
  }

  const tentativas = c.tentativas + 1
  const bloqueia = tentativas >= CODIGO_MAX_TENTATIVAS
  const atualizado: CodigoPendente = { ...c, tentativas, bloqueadoAte: bloqueia ? d.agora + d.bloqueioMs : null }
  const novo = { ...estado, codigos: estado.codigos.map((x) => (x === original ? atualizado : x)) }
  return bloqueia
    ? falha(novo, 'bloqueado', msgBloqueio(d.bloqueioMs), {
        segundos: d.bloqueioMs / 1000,
        restantes: 0,
      })
    : falha(novo, 'invalido', ERRO_CODIGO_INVALIDO, { restantes: CODIGO_MAX_TENTATIVAS - tentativas })
}
