// Categorização por MCC (Merchant Category Code).
//
// O extrato da Regions traz o código da categoria do cartão dentro da
// descrição ("DD *Doordash Ta 5812 Doordash.Com CA 94107"). É um padrão
// ISO, igual em qualquer banco e qualquer maquininha do mundo.
//
// Isso muda a categorização de adivinhação por nome de estabelecimento
// para consulta em tabela: acerta de primeira inclusive em comércio que
// o usuário nunca viu, e não depende de aprender nada antes.
//
// O mapa aponta para NOMES de categoria, não ids: cada household tem as
// suas, e o casamento é feito por nome no momento da importação. Nome
// que não existir no household cai em "sem sugestão", nunca numa
// categoria errada.

const MCC_TO_CATEGORY: Record<string, string> = {
  // Alimentação fora de casa
  "5812": "Restaurante", // restaurantes
  "5813": "Restaurante", // bares
  "5814": "Restaurante", // fast food
  "7299": "Restaurante", // serviços diversos (apps de entrega cobram aqui)

  // Mercado e conveniência
  "5411": "Mercado", // supermercado
  "5422": "Mercado", // açougue
  "5441": "Mercado", // confeitaria
  "5451": "Mercado", // laticínios
  "5462": "Mercado", // padaria
  "5499": "Mercado", // mercearia e conveniência
  "5331": "Mercado", // loja de variedades
  "5993": "Mercado", // tabacaria

  // Transporte
  "5541": "Transporte", // posto de gasolina com serviço
  "5542": "Transporte", // posto automático
  "4121": "Transporte", // táxi e transporte por app
  "4111": "Transporte", // transporte público
  "7523": "Transporte", // estacionamento
  "4784": "Transporte", // pedágio
  "5533": "Transporte", // autopeças
  "7538": "Transporte", // oficina

  // Saúde
  "5912": "Saúde", // farmácia
  "8011": "Saúde", // consultório médico
  "8021": "Saúde", // dentista
  "8062": "Saúde", // hospital
  "8071": "Saúde", // laboratório

  // Moradia e utilidades
  "4900": "Moradia", // água, luz, gás
  "6513": "Moradia", // aluguel
  "5200": "Moradia", // material de construção
  "5712": "Moradia", // móveis

  // Assinaturas e serviços digitais
  "4899": "Assinaturas", // TV a cabo e streaming
  "4814": "Assinaturas", // telefonia
  "4816": "Assinaturas", // serviços de rede e computação
  "5815": "Assinaturas", // mídia digital
  "5816": "Assinaturas", // jogos digitais
  "5817": "Assinaturas", // aplicativos
  "5818": "Assinaturas", // bens digitais diversos
  "7372": "Assinaturas", // programação e software

  // Compras
  "5311": "Compras", // loja de departamento
  "5651": "Compras", // vestuário
  "5621": "Compras", // moda feminina
  "5661": "Compras", // calçados
  "5977": "Compras", // cosméticos
  "5732": "Compras", // eletrônicos
  "5942": "Compras", // livraria
  "5944": "Compras", // joalheria
  "5964": "Compras", // venda por catálogo
  "5968": "Compras", // assinaturas por catálogo
  "5999": "Compras", // varejo diverso

  // Lazer
  "7832": "Lazer", // cinema
  "7922": "Lazer", // teatro e shows
  "7991": "Lazer", // atrações turísticas
  "7997": "Lazer", // clubes
  "7011": "Lazer", // hotelaria
  "4722": "Lazer", // agência de viagem
  "5941": "Lazer", // artigos esportivos
};

/** Nome de categoria sugerido para um MCC, ou null se não mapeado. */
export function categoryNameForMcc(mcc: string | null): string | null {
  if (!mcc) return null;
  return MCC_TO_CATEGORY[mcc] ?? null;
}

/**
 * Resolve o id da categoria do household a partir do MCC. Devolve null
 * quando o MCC não é conhecido OU quando o household não tem categoria
 * com aquele nome — melhor deixar sem sugestão do que sugerir errado.
 */
export function suggestCategoryId(
  mcc: string | null,
  categoriesByName: Map<string, string>,
): string | null {
  const name = categoryNameForMcc(mcc);
  if (!name) return null;
  return categoriesByName.get(name.toLowerCase()) ?? null;
}
