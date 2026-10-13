// Cores que vêm de dados (categoria, banco, cartão) e não de token: no
// tema claro ficam exatamente como são; no escuro, o fundo pastel vira
// um véu translúcido da própria cor e o texto clareia pra ser lido.
//
// Usa `light-dark()`, que segue o `color-scheme` da página (globals.css
// liga `dark` junto com o tema escuro). As cores gravadas no banco e as
// do PDF continuam em hex — isto é só pra pintar a tela.

export type ColorPair = { bg: string; fg: string };

/** Texto/ícone saturado: igual no claro, mais claro no escuro. */
export function themedFg(fg: string): string {
  return `light-dark(${fg}, color-mix(in srgb, ${fg} 58%, white))`;
}

/** Fundo suave: o pastel no claro; véu da cor `fg` no escuro. */
export function themedBg(bg: string, fg: string, strength = 18): string {
  return `light-dark(${bg}, color-mix(in srgb, ${fg} ${strength}%, transparent))`;
}

export function themedPair<T extends ColorPair>(pair: T): T {
  return { ...pair, bg: themedBg(pair.bg, pair.fg), fg: themedFg(pair.fg) };
}
