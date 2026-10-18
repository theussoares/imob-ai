import { X509Certificate, createPrivateKey } from 'node:crypto'

/**
 * Confere o par certificado + chave privada que a imobiliária subiu e devolve
 * a validade.
 *
 * Por que aqui e não só deixar a Cora recusar: um PEM trocado, truncado ou
 * com a chave de outro certificado só apareceria como erro de handshake TLS,
 * sem dizer qual dos dois está errado — e o dono da conta não sabe o que é
 * handshake. Validar no upload troca isso por uma frase que ele entende.
 */
export function validarCertificado(certificatePem: string, privateKeyPem: string): { validoAte: Date } {
  let cert: X509Certificate
  try {
    cert = new X509Certificate(certificatePem)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'O certificado não é um PEM válido. Use o arquivo .pem que a Cora gerou (começa com -----BEGIN CERTIFICATE-----).' })
  }
  let chave
  try {
    chave = createPrivateKey(privateKeyPem)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'A chave privada não é um PEM válido. Use o arquivo .key que a Cora gerou (começa com -----BEGIN ... PRIVATE KEY-----).' })
  }
  if (!cert.checkPrivateKey(chave)) {
    throw createError({ statusCode: 422, statusMessage: 'A chave privada não corresponde a este certificado. Envie os dois arquivos do mesmo par.' })
  }
  const validoAte = new Date(cert.validTo)
  if (!(validoAte.getTime() > Date.now())) {
    throw createError({ statusCode: 422, statusMessage: 'Este certificado já venceu. Gere um novo na Cora.' })
  }
  return { validoAte }
}
