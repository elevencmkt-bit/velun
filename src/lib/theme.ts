// Tema da tela: claro, escuro ou o do sistema (padrão). A escolha fica
// neste aparelho (localStorage) e o script do <head> aplica antes de a
// página aparecer, pra não piscar branco ao abrir no escuro.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "velun:theme";

// Roda no <head>, antes de pintar: põe ou tira a classe `dark` do <html>.
// No "sistema", também acompanha a troca do sistema com a página aberta.
export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function pref(){try{return localStorage.getItem("${THEME_KEY}")||"system"}catch(e){return "system"}}
function apply(){var p=pref();d.dataset.theme=p;d.classList.toggle("dark",p==="dark"||(p==="system"&&m.matches))}
apply();m.addEventListener("change",apply);window.__velunApplyTheme=apply;
}catch(e){}})()`;

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Sem localStorage (aba anônima restrita): vale só até recarregar.
  }
  const apply = (window as unknown as { __velunApplyTheme?: () => void }).__velunApplyTheme;
  if (apply) apply();
  else {
    const dark =
      choice === "dark" ||
      (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }
}
