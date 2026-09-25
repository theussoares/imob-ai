import { readListQuery, writeListQuery } from "~~/shared/utils/list-query";

/**
 * Liga um objeto de filtros (todos string) à query da rota. Ver
 * shared/utils/list-query.ts para o porquê.
 *
 * `replace`, não `push`: cada letra da busca empilharia uma entrada no
 * histórico, e o "voltar" passaria a desfazer letra por letra.
 */
export function useListQuery<K extends string>(
  filters: Record<K, string>,
  keys: readonly K[],
  allowed: Partial<Record<K, readonly string[]>> = {},
) {
  const route = useRoute();
  const router = useRouter();

  Object.assign(filters, readListQuery(route.query, keys, allowed));

  watch(
    () => writeListQuery(filters, keys),
    (query) => {
      const resto = Object.fromEntries(
        Object.entries(route.query).filter(([k]) => !(keys as readonly string[]).includes(k)),
      );
      router.replace({ query: { ...resto, ...query } });
    },
    { deep: true },
  );
}
