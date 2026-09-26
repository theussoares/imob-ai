/**
 * Upload de imagem de marca (logo / foto do hero) para o Storage.
 *
 * As duas rotinas eram idênticas exceto por bucket, prefixo e tamanho — e
 * carregam decisões que não podem divergir entre elas:
 *
 * - redimensiona e converte pra WebP antes de subir (a foto original do celular
 *   tem 3–4 MB e era servida crua), caindo para JPEG/PNG no navegador que não
 *   gera WebP — ver `encodeWithFallback`;
 * - `upsert: false` porque o path já é único por timestamp; com upsert o Supabase
 *   checa existência antes de sobrescrever, o que exige policy de SELECT em
 *   storage.objects que não temos — e falharia com erro de RLS;
 * - exige o slug do tenant: ele é a primeira pasta do path, e as policies de
 *   storage só autorizam a pasta do tenant do qual o usuário é membro.
 *
 * `onFile` aceita um destino por chamada. Uma tela com várias fotos (Quem
 * somos) guardava "o destino do upload em andamento" numa variável só: enviar
 * no bloco A e, antes de terminar, no bloco B gravava a foto de A em B e
 * descartava a de B. O destino tem que viajar junto com o arquivo.
 */
export function useBrandUpload(opts: {
  bucket: 'tenant-logos' | 'tenant-hero'
  prefix: string
  maxEdge: number
  /** Destino padrão; quem tem vários destinos passa o seu em cada `onFile`. */
  onDone?: (publicUrl: string) => void
}) {
  const tenant = useTenant()
  const toast = useToast()
  // Contador, não booleano: com dois envios simultâneos, o primeiro a terminar
  // apagaria o "Enviando..." do outro, que ainda está subindo.
  const emAndamento = ref(0)
  const uploading = computed(() => emAndamento.value > 0)

  async function onFile(e: Event, onDone = opts.onDone) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const slug = tenant.value?.slug
    if (!slug) {
      toast.error('Não foi possível identificar a imobiliária. Recarregue a página.')
      input.value = ''
      return
    }

    emAndamento.value += 1
    try {
      const client = await getAdminSupabase()
      // Formato que o canvas não abre (SVG, HEIC): sobe como veio.
      // Logo cai para PNG, não JPEG: o fundo transparente viraria preto.
      const encoded = isResizableImage(file)
        ? await resizeForUpload(file, opts.maxEdge, opts.bucket === 'tenant-logos' ? 'image/png' : 'image/jpeg')
        : { blob: file, ext: file.name.split('.').pop() || 'png', contentType: file.type }
      const path = `${slug}/${opts.prefix}-${Date.now()}.${encoded.ext}`

      const { error } = await client.storage.from(opts.bucket).upload(path, encoded.blob, {
        upsert: false,
        cacheControl: '31536000',
        contentType: encoded.contentType,
      })
      if (error) throw error

      onDone?.(client.storage.from(opts.bucket).getPublicUrl(path).data.publicUrl)
    } catch (err: unknown) {
      toast.error(friendlyErrorMessage(err, 'Não foi possível enviar a imagem. Tente novamente.'))
    } finally {
      emAndamento.value -= 1
      input.value = ''
    }
  }

  return { uploading, onFile }
}
