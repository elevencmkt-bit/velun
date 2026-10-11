import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse resolve dependências com require() de nome variável, que
  // nenhum bundler consegue seguir estaticamente. Empacotado, ele quebra
  // em runtime. Esta opção faz o Next deixar o pacote de fora do bundle
  // e carregá-lo com require nativo do Node.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
