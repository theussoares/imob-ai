export interface ConfirmRequest {
  title: string;
  /** Consequência da ação, quando não é óbvia pelo título. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva: botão vermelho. */
  danger?: boolean;
}

/**
 * Guarda o `resolve` da promise em aberto.
 *
 * Fica em variável de módulo (e não em `useState`) porque função não é
 * serializável no payload do SSR. É seguro aqui porque só é atribuída dentro de
 * um handler de clique — nenhuma requisição de servidor chega a vê-la
 * preenchida. O pedido em si vai para `useState`, que é o que a tela renderiza.
 */
let pending: ((ok: boolean) => void) | null = null;

/**
 * Confirmação de ação destrutiva — o que antes era `confirm()`.
 *
 * Construída sobre o `<dialog>` nativo (ver AdminConfirmDialog) por causa do
 * foco: ele dá focus trap, Esc e backdrop de graça. Modal artesanal sem focus
 * trap seria acessivelmente PIOR que o `confirm()` que está saindo — trocaria
 * feio por quebrado.
 *
 * Diferente do `confirm()`, é assíncrona: quem chama precisa de `await`.
 *
 *   if (!(await askConfirm({ title: 'Excluir o imóvel NC-0231?' }))) return
 */
export function useConfirm() {
  const request = useState<ConfirmRequest | null>("admin-confirm", () => null);

  function askConfirm(req: ConfirmRequest): Promise<boolean> {
    // Um pedido por vez: se outro estiver aberto, ele é cancelado em vez de
    // ficar com a promise pendurada para sempre.
    settle(false);
    request.value = req;
    return new Promise<boolean>((resolve) => {
      pending = resolve;
    });
  }

  /** Fecha o pedido atual. Ignorado se não houver nenhum em aberto. */
  function settle(ok: boolean) {
    const resolve = pending;
    pending = null;
    request.value = null;
    resolve?.(ok);
  }

  return { request, askConfirm, settle };
}
