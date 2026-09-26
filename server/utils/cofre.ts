import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Cifra a chave de API do provedor de pagamento de cada imobiliária.
 *
 * A chave do Asaas emite, cancela e estorna cobrança no CNPJ do cliente. Com
 * ela em texto puro no banco, qualquer vazamento do banco — um dump, um backup,
 * um select esquecido num log — vira poder de mexer no dinheiro de quatro
 * imobiliárias. Cifrada, o banco sozinho não basta: falta a chave-mestra, que
 * mora só no ambiente do servidor.
 *
 * AES-256-GCM e não CBC: o GCM AUTENTICA. Um texto cifrado adulterado no banco
 * falha ao decifrar em vez de devolver lixo que viraria cabeçalho HTTP.
 *
 * A chave-mestra passa por sha256 em vez de exigir 32 bytes exatos em base64:
 * um formato rígido é o tipo de coisa que quebra em produção porque alguém
 * colou com uma quebra de linha (ver `segredo.ts`). O custo é nenhum — a
 * entropia vem do valor, e o mínimo de 32 caracteres a garante.
 */

const VERSAO = 'v1'

function chaveMestra(): Buffer {
  const bruta = segredoDeRuntime(useRuntimeConfig().paymentsEncryptionKey, 'PAYMENTS_ENCRYPTION_KEY')
  if (bruta.length < 32) {
    logError('cofre.chave_ausente', { dica: 'Defina NUXT_PAYMENTS_ENCRYPTION_KEY (32+ caracteres) e faça redeploy.' })
    throw createError({
      statusCode: 503,
      statusMessage: 'A cobrança ainda não está habilitada nesta plataforma. Fale com o suporte.',
    })
  }
  return createHash('sha256').update(bruta).digest()
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chaveMestra(), iv)
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [VERSAO, iv.toString('base64'), c.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':')
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, cifrado] = guardado.split(':')
  if (versao !== VERSAO || !iv || !tag || !cifrado) throw new Error('cofre: formato desconhecido')
  const d = createDecipheriv('aes-256-gcm', chaveMestra(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64')), d.final()]).toString('utf8')
}

/** sha256 hex — para o segredo do webhook, que só precisa ser COMPARADO. */
export function hashDeSegredo(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex')
}

/**
 * Segredo novo para o webhook. 48 bytes em base64url = 64 caracteres, dentro
 * da faixa de 32 a 255 que o Asaas exige para o `authToken`.
 */
export function novoSegredoDeWebhook(): string {
  return randomBytes(48).toString('base64url')
}
