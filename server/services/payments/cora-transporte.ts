import { createHash } from 'node:crypto'
import { Agent, request } from 'node:https'
import type { PaymentEnvironment } from '~~/shared/models/cobranca'
import { ErroDoProvedor } from './provider'

/**
 * Transporte da Cora: mTLS + token, isolados por conta.
 *
 * Cada imobiliária tem o PRÓPRIO certificado, então não existe agente nem token
 * global: a requisição de uma conta nunca pode sair com a credencial de outra.
 * O cache é por `tenantId + hash das credenciais` — trocar o certificado muda a
 * chave, e a entrada antiga é fechada na hora (um agente com o certificado
 * velho vivo na memória é exatamente o que "troquei e ainda falha" esconde).
 *
 * `node:https` e não o `fetch` global: o fetch do Node só aceita certificado de
 * cliente por `dispatcher` de um `undici` que o projeto não tem como dependência,
 * e importá-lo de fora com versão diferente da embutida é fonte de erro
 * silencioso. `https.Agent({ cert, key })` é o caminho sem dependência nova.
 *
 * Hosts: a doc pública só lista o de token (`matls-clients`). Assumimos que a
 * Integração Direta usa o mesmo host mTLS para as chamadas de API — conferir no
 * primeiro teste em stage (ver spec 06/10, "Pendências").
 */

export const BASE_CORA: Record<PaymentEnvironment, string> = {
  sandbox: 'https://matls-clients.api.stage.cora.com.br',
  producao: 'https://matls-clients.api.cora.com.br',
}

/** O token vale 24h; renovamos antes para uma requisição não cair no limite. */
const MARGEM_DO_TOKEN_MS = 5 * 60_000
/** Teto de contas em memória por instância serverless: a mais antiga sai primeiro. */
const MAX_CONTAS = 50
const TIMEOUT_MS = 15_000

export interface CredenciaisCora {
  clientId: string
  certificatePem: string
  privateKeyPem: string
}

export interface RequisicaoCrua {
  metodo: string
  url: string
  cabecalhos: Record<string, string>
  corpo?: string
}

export interface RespostaCrua {
  status: number
  texto: string
}

/** Quem de fato fala TLS. Injetável: os testes não abrem socket. */
export type Enviar = (agente: Agent, req: RequisicaoCrua) => Promise<RespostaCrua>

export interface RespostaDaCora {
  status: number
  json: Record<string, unknown> | null
}

export interface TransporteCora {
  /** Token válido (cache + um refresh só em voo). Falha com `credencialInvalida` se a Cora recusa o certificado. */
  token(): Promise<string>
  chamar(metodo: string, caminho: string, corpo?: unknown, cabecalhos?: Record<string, string>): Promise<RespostaDaCora>
}

interface Entrada {
  agente: Agent
  token: { valor: string; expiraEm: number } | null
  emVoo: Promise<string> | null
  usadoEm: number
}

const contas = new Map<string, Entrada>()

/** Para testes: esvazia o cache e fecha os agentes. */
export function limparCacheDaCora(): void {
  for (const e of contas.values()) e.agente.destroy()
  contas.clear()
}

export function tamanhoDoCacheDaCora(): number {
  return contas.size
}

export function chaveDaConta(tenantId: string, c: CredenciaisCora, ambiente: PaymentEnvironment): string {
  // O ambiente entra na chave: o mesmo certificado reconectado de sandbox para
  // produção não pode herdar o token de stage em cache.
  const h = createHash('sha256').update(`${ambiente}\n${c.clientId}\n${c.certificatePem}\n${c.privateKeyPem}`).digest('hex').slice(0, 24)
  return `${tenantId}:${h}`
}

function entradaDaConta(tenantId: string, c: CredenciaisCora, ambiente: PaymentEnvironment, agora: number): Entrada {
  const chave = chaveDaConta(tenantId, c, ambiente)
  // Credencial trocada: derruba o que sobrou deste tenant.
  for (const [k, e] of contas) {
    if (k.startsWith(`${tenantId}:`) && k !== chave) {
      e.agente.destroy()
      contas.delete(k)
    }
  }
  let entrada = contas.get(chave)
  if (!entrada) {
    if (contas.size >= MAX_CONTAS) {
      const [maisAntiga] = [...contas.entries()].sort((a, b) => a[1].usadoEm - b[1].usadoEm)
      if (maisAntiga) {
        maisAntiga[1].agente.destroy()
        contas.delete(maisAntiga[0])
      }
    }
    entrada = {
      agente: new Agent({ cert: c.certificatePem, key: c.privateKeyPem, keepAlive: true, maxSockets: 4 }),
      token: null,
      emVoo: null,
      usadoEm: agora,
    }
    contas.set(chave, entrada)
  }
  entrada.usadoEm = agora
  return entrada
}

const enviarPorHttps: Enviar = (agente, req) =>
  new Promise((resolve, reject) => {
    const r = request(
      req.url,
      { method: req.metodo, headers: req.cabecalhos, agent: agente, timeout: TIMEOUT_MS },
      (res) => {
        const partes: Buffer[] = []
        res.on('data', (p: Buffer) => partes.push(p))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, texto: Buffer.concat(partes).toString('utf8') }))
        res.on('error', reject)
      },
    )
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))
    r.on('error', reject)
    if (req.corpo !== undefined) r.write(req.corpo)
    r.end()
  })

function lerJson(texto: string): Record<string, unknown> | null {
  if (!texto) return null
  try {
    const j = JSON.parse(texto)
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null
  } catch {
    // Página de erro HTML do balanceador (502/503): sem JSON, cai no status.
    return null
  }
}

export interface OpcoesTransporte {
  tenantId: string
  credenciais: CredenciaisCora
  ambiente: PaymentEnvironment
  enviar?: Enviar
  agora?: () => number
}

export function criarTransporteCora(op: OpcoesTransporte): TransporteCora {
  const enviar = op.enviar ?? enviarPorHttps
  const agora = op.agora ?? Date.now
  const base = BASE_CORA[op.ambiente]
  const entrada = entradaDaConta(op.tenantId, op.credenciais, op.ambiente, agora())

  async function enviarOuFalhar(req: RequisicaoCrua): Promise<RespostaCrua> {
    try {
      return await enviar(entrada.agente, req)
    } catch (e) {
      const nome = (e as Error).name
      const codigo = (e as { code?: string }).code ?? ''
      // Certificado recusado no handshake: a Cora derruba a conexão, não responde 401.
      if (/CERT|SSL|ALERT|HANDSHAKE/i.test(codigo)) {
        throw new ErroDoProvedor('A Cora recusou o certificado. Confira se ele é do ambiente escolhido e se não foi revogado.', true)
      }
      throw new ErroDoProvedor(`Não foi possível falar com a Cora agora (${nome}). Tente de novo.`)
    }
  }

  async function buscarToken(): Promise<string> {
    const res = await enviarOuFalhar({
      metodo: 'POST',
      url: `${base}/token`,
      cabecalhos: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      corpo: new URLSearchParams({ grant_type: 'client_credentials', client_id: op.credenciais.clientId }).toString(),
    })
    const json = lerJson(res.texto)
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new ErroDoProvedor('A Cora recusou o client_id ou o certificado. Confira se são do ambiente escolhido e não foram revogados.', true)
    }
    const token = json?.access_token
    if (res.status < 200 || res.status >= 300 || typeof token !== 'string') {
      throw new ErroDoProvedor(`A Cora respondeu ${res.status} ao pedir o token.`)
    }
    const segundos = typeof json?.expires_in === 'number' ? json.expires_in : 86_400
    entrada.token = { valor: token, expiraEm: agora() + segundos * 1000 - MARGEM_DO_TOKEN_MS }
    return token
  }

  async function token(): Promise<string> {
    if (entrada.token && entrada.token.expiraEm > agora()) return entrada.token.valor
    // Dez requisições com o token vencido fazem UM pedido de token, não dez.
    entrada.emVoo ??= buscarToken().finally(() => {
      entrada.emVoo = null
    })
    return entrada.emVoo
  }

  async function chamar(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}, repetiu = false): Promise<RespostaDaCora> {
    const t = await token()
    const res = await enviarOuFalhar({
      metodo,
      url: `${base}${caminho}`,
      cabecalhos: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/json',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...cabecalhos,
      },
      corpo: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    if (res.status === 401 && !repetiu) {
      // Token revogado ou vencido antes da hora: descarta e tenta uma vez.
      entrada.token = null
      return chamar(metodo, caminho, corpo, cabecalhos, true)
    }
    if (res.status === 401 || res.status === 403) {
      throw new ErroDoProvedor('A Cora recusou as credenciais. Reconecte a conta em Configurações → Cobrança.', true)
    }
    return { status: res.status, json: lerJson(res.texto) }
  }

  return { token, chamar }
}

/**
 * UUID estável a partir de um texto. A Cora exige `Idempotency-Key` em UUID, e
 * um aleatório por tentativa não protege nada: o retry de uma emissão que a
 * rede derrubou geraria OUTRO boleto. Derivado da cobrança, o retry reencontra
 * o mesmo.
 */
export function uuidDeterministico(semente: string): string {
  const h = createHash('sha256').update(semente).digest('hex')
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`
}
