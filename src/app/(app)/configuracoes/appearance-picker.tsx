"use client";

import { ThemeSwitch } from "@/components/theme-switch";

// Claro, escuro ou o do sistema, em Configurações › Aparência. O mesmo
// seletor aparece compacto no pé do menu lateral e no "Mais" do celular.
export function AppearancePicker() {
  return <ThemeSwitch />;
}
