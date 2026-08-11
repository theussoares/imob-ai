/** Favoritos do visitante, persistidos em localStorage (sem servidor). */
export function useFavorites() {
  const favs = useLocalStorage<string[]>('imob:favs', [])

  function toggle(code: string) {
    const i = favs.value.indexOf(code)
    if (i >= 0) favs.value.splice(i, 1)
    else favs.value.push(code)
  }

  function has(code: string) {
    return favs.value.includes(code)
  }

  return { favs, toggle, has }
}
