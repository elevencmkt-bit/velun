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

  // Educação e creche
  "8351": "Educação", // creche e berçário
  "8211": "Educação", // escola
  "8220": "Educação", // faculdade
  "8249": "Educação", // escola técnica
  "8299": "Educação", // ensino diverso

  // Trabalho e serviços profissionais
  "7311": "Trabalho", // agência de publicidade
  "7399": "Trabalho", // serviços para empresas
  "7392": "Trabalho", // consultoria
  "7338": "Trabalho", // gráfica e cópia
  "8111": "Trabalho", // advocacia
  "8931": "Trabalho", // contabilidade
  "5943": "Trabalho", // papelaria e material de escritório

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
  "5734": "Assinaturas", // loja de software (SaaS cobra aqui)

  // Compras
  "5311": "Compras", // loja de departamento
  "5651": "Compras", // vestuário
  "5621": "Compras", // moda feminina
  "5661": "Compras", // calçados
  "5977": "Compras", // cosméticos
  "5732": "Compras", // eletrônicos
  // 5045 é loja de computador e periférico: cobre tanto compra de
  // equipamento quanto software vendido por ela. "Compras" é a leitura
  // honesta do código — software recorrente que caia aqui sai da
  // revisão com um clique.
  "5045": "Compras", // informática e periféricos
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
 * Encontra o MCC dentro da descrição do lançamento.
 *
 * Não dá pra pegar o primeiro número de 4 dígitos: muito
 * estabelecimento carrega número de loja com 4 dígitos antes do código
 * ("Racetrac 2603 5541", "Outback 1069 5812"), e aí o número da loja
 * ganharia do MCC.
 *
 * A regra é pegar o token de 4 dígitos que EXISTE nesta tabela, e entre
 * vários o último — o MCC vem depois do nome e do número da loja.
 * Número de loja quase nunca coincide com um código válido, e se
 * coincidir, o de verdade está mais à direita.
 *
 * MCC não mapeado some aqui, o que não custa nada: sem entrada na
 * tabela não haveria categoria a sugerir de qualquer jeito.
 */
export function findMccInDescription(description: string): string | null {
  let found: string | null = null;
  for (const token of description.split(/\s+/)) {
    if (/^\d{4}$/.test(token) && token in MCC_TO_CATEGORY) found = token;
  }
  return found;
}

/**
 * Resolve o id da categoria do household a partir do MCC. Devolve null
 * quando o MCC não é conhecido OU quando o household não tem categoria
 * com aquele nome — melhor deixar sem sugestão do que sugerir errado.
 *
 * `direction` não é opcional de propósito. Todo MCC desta tabela aponta
 * pra categoria de despesa, mas estorno de cartão vem com o MESMO
 * código e direção invertida ("Card Credit Manus Ai 5734 ..."). Sem o
 * filtro, um reembolso de $20 entrava classificado como Assinaturas, o
 * seletor da revisão ficava em branco (ele só lista categoria da
 * direção certa, e não encontrava a que estava marcada) e o relatório
 * passava a mostrar Assinaturas como receita.
 *
 * Estorno fica sem sugestão, que é o certo: não existe código de
 * categoria que diga de onde o dinheiro está voltando.
 */
export function suggestCategoryId(
  mcc: string | null,
  categories: Map<string, { id: string; kind: string }>,
  direction: "in" | "out",
): string | null {
  const name = categoryNameForMcc(mcc);
  if (!name) return null;

  const category = categories.get(name.toLowerCase());
  if (!category) return null;

  const wanted = direction === "in" ? "income" : "expense";
  return category.kind === wanted ? category.id : null;
}
