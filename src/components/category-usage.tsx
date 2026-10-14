"use client";

import { createContext, useContext } from "react";

// Quantas vezes cada categoria principal foi usada nos lançamentos
// recentes (sub conta pra principal). Vem do layout do app e serve pros
// formulários mostrarem primeiro as categorias do dia a dia.
const CategoryUsageContext = createContext<Record<string, number>>({});

export function CategoryUsageProvider({
  usage,
  children,
}: {
  usage: Record<string, number>;
  children: React.ReactNode;
}) {
  return <CategoryUsageContext.Provider value={usage}>{children}</CategoryUsageContext.Provider>;
}

export function useCategoryUsage() {
  return useContext(CategoryUsageContext);
}
