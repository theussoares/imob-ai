/**
 * Upload de imagem de marca (logo / foto do hero) para o Storage.
 *
 * As duas rotinas eram idênticas exceto por bucket, prefixo e tamanho — e
 * carregam decisões que não podem divergir entre elas:
 *
 * - redimensiona e converte pra WebP antes de subir (a foto original do celular
 *   tem 3–4 MB e era servida crua);
 * - `upsert: false` porque o path já é único por timestamp; com upsert o Supabase
 *   checa existência antes de sobrescrever, o que exige policy de SELECT em
 *   storage.objects que não temos — e falharia com erro de RLS;
 * - exige o slug do tenant: ele é a primeira pasta do path, e as policies de
 *   storage só autorizam a pasta do tenant do qual o usuário é membro.
 */
export function useBrandUpload(opts: {
  bucket: 'tenant-logos' | 'tenant-hero'
  prefix: string
  maxEdge: number
  onDone: (publicUrl: string) => void
}) {
  const tenant = useTenant()
  const toast = useToast()
  const uploading = ref(false)

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const slug = tenant.value?.slug
    if (!slug) {
      toast.error('Não foi possível identificar a imobiliária. Recarregue a página.')
      input.value = ''
      return
    }

    uploading.value = true
    try {
      const client = await getAdminSupabase()
      // Formato que o canvas não abre (SVG, HEIC): sobe como veio.
      const resizable = isResizableImage(file)
      const body: Blob = resizable ? await resizeToWebp(file, opts.maxEdge) : file
      const ext = resizable ? 'webp' : file.name.split('.').pop() || 'png'
      const path = `${slug}/${opts.prefix}-${Date.now()}.${ext}`

      const { error } = await client.storage.from(opts.bucket).upload(path, body, {
        upsert: false,
        cacheControl: '31536000',
        contentType: resizable ? 'image/webp' : file.type,
      })
      if (error) throw error

      opts.onDone(client.storage.from(opts.bucket).getPublicUrl(path).data.publicUrl)
    } catch (err: unknown) {
      const m = err as { message?: string }
      toast.error('Falha no upload da imagem: ' + (m?.message || 'erro'))
    } finally {
      uploading.value = false
      input.value = ''
    }
  }

  return { uploading, onFile }
}
