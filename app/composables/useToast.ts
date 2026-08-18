export type ToastKind = "error" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/**
 * Avisos do painel — o que antes era `alert()`.
 *
 * `alert()` trava a thread, mostra o domínio no topo em mobile e não aceita
 * estilo: num painel que o cliente abre todo dia isso parece erro do navegador,
 * não do produto.
 *
 * Toast, e não modal, porque estes casos não pedem decisão nenhuma — "não foi
 * possível excluir" só precisa ser lido. Modal cobraria um clique a mais para
 * dispensar. Quando há decisão a tomar, o certo é [[useConfirm]].
 */
export function useToast() {
  const items = useState<Toast[]>("admin-toasts", () => []);
  // Contador em useState (e não em variável de módulo) para não ser
  // compartilhado entre requisições no SSR.
  const seq = useState<number>("admin-toast-seq", () => 0);

  function dismiss(id: number) {
    items.value = items.value.filter((t) => t.id !== id);
  }

  function push(kind: ToastKind, message: string, ttl: number | null) {
    seq.value += 1;
    const id = seq.value;
    items.value = [...items.value, { id, kind, message }];
    if (ttl !== null) setTimeout(() => dismiss(id), ttl);
  }

  return {
    items,
    dismiss,
    /**
     * Fica na tela até ser dispensado. Erro que some sozinho passa
     * despercebido, e a pessoa segue achando que salvou.
     */
    error: (message: string) => push("error", message, null),
    /** Confirmação some sozinha: se perder, nada de ruim aconteceu. */
    success: (message: string) => push("success", message, 3500),
  };
}
