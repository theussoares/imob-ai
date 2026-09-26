export type ToastKind = "error" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Botão dentro do aviso — hoje só o "Desfazer" de quem apaga sem confirmar. */
  action?: { label: string; run: () => void };
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

  function push(kind: ToastKind, message: string, ttl: number | null, action?: Toast["action"]) {
    // O mesmo erro de novo não empilha outro card: clicar "Salvar" três vezes
    // com o CPF errado deixava três avisos iguais para fechar um a um.
    const repetido = items.value.find((t) => t.kind === kind && t.message === message && !action);
    if (repetido && ttl === null) return repetido.id;
    seq.value += 1;
    const id = seq.value;
    items.value = [...items.value, { id, kind, message, action }];
    if (ttl !== null) setTimeout(() => dismiss(id), ttl);
    return id;
  }

  /**
   * Some com os erros que ficaram na tela. Erro não tem prazo (ver `error`),
   * mas um erro já resolvido é pior que nenhum: "CPF inválido" continuava lá
   * depois de a pessoa corrigir e salvar. Chamado pela tela quando a ação que
   * falhou dá certo, e pelo layout a cada troca de página.
   */
  function clearErrors() {
    items.value = items.value.filter((t) => t.kind !== "error");
  }

  return {
    items,
    dismiss,
    clearErrors,
    /**
     * Fica na tela até ser dispensado. Erro que some sozinho passa
     * despercebido, e a pessoa segue achando que salvou.
     */
    error: (message: string) => push("error", message, null),
    /** Confirmação some sozinha: se perder, nada de ruim aconteceu. */
    success: (message: string) => push("success", message, 3500),
    /**
     * Ação já feita, com volta por alguns segundos. É a alternativa ao
     * `confirm()` antes de apagar: o diálogo vira reflexo de "OK" e ninguém lê,
     * enquanto o desfazer só cobra algo de quem errou. 6s e não 3,5s: a pessoa
     * precisa ler, perceber o engano e alcançar o botão.
     *
     * Devolve o id para a tela dispensar o aviso ao sair — o desfazer de uma
     * tela que já fechou mexeria num formulário que não existe mais.
     */
    undoable: (message: string, onUndo: () => void) =>
      push("success", message, 6000, { label: "Desfazer", run: onUndo }),
  };
}
