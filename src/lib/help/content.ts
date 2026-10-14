// Central de ajuda: assuntos, artigos, perguntas frequentes e o resumo
// do "?" de cada tela. Tudo aqui é texto pra quem usa o app, escrito a
// partir do que o app faz de verdade. Mudou o comportamento de uma
// tela? Mude o artigo junto.
//
// Formato dos blocos de um artigo:
//   { h2, id }      título de seção (vira âncora e entra em "Neste artigo")
//   { p }           parágrafo
//   { list }        lista com marcadores
//   { steps }       passo a passo numerado
//   { tip }         caixinha de dica
//   { table }       pares "nome → explicação"
// Dentro do texto, **assim** vira negrito.

export type HelpBlock =
  | { h2: string; id: string }
  | { p: string }
  | { list: string[] }
  | { steps: string[] }
  | { tip: string }
  | { table: [string, string][] };

export type HelpTopicIcon =
  | "start"
  | "couple"
  | "transactions"
  | "import"
  | "cards"
  | "due"
  | "flow"
  | "reports"
  | "goals"
  | "settings";

export type HelpTopic = {
  slug: string;
  title: string;
  description: string;
  icon: HelpTopicIcon;
};

export type HelpArticle = {
  slug: string;
  topic: string;
  title: string;
  /** Uma frase: aparece na busca e na lista do assunto. */
  summary: string;
  body: HelpBlock[];
  /** Outros artigos ("assunto/artigo") pra "Veja também". */
  related?: string[];
};

export const HELP_TOPICS: HelpTopic[] = [
  { slug: "primeiros-passos", title: "Primeiros passos", description: "Criar contas, saldo inicial e o primeiro lançamento.", icon: "start" },
  { slug: "casal-e-privacidade", title: "Casal e privacidade", description: "Convite, conta do casal, conta pessoal e quem vê o quê.", icon: "couple" },
  { slug: "lancamentos", title: "Lançamentos e transações", description: "Entrada, saída, transferência, parcelas, filtros e categorizar em lote.", icon: "transactions" },
  { slug: "importar", title: "Importar extratos", description: "Extratos aceitos, revisão, repetidos e como desfazer.", icon: "import" },
  { slug: "cartoes", title: "Cartões e faturas", description: "Fechamento, vencimento, parcelas, pagar e adiantar.", icon: "cards" },
  { slug: "a-vencer", title: "A vencer e recorrências", description: "Contas fixas, salário e o que vence nos próximos 30 dias.", icon: "due" },
  { slug: "dashboard-e-fluxo", title: "Dashboard e fluxo de caixa", description: "Saldo de hoje, projeção e quando o saldo fica negativo.", icon: "flow" },
  { slug: "relatorios", title: "Relatórios e PDF", description: "Por categoria, períodos longos e o PDF pro contador.", icon: "reports" },
  { slug: "metas", title: "Metas", description: "Juntar dinheiro, limite de gasto e quitar dívida.", icon: "goals" },
  { slug: "configuracoes", title: "Categorias e configurações", description: "Subcategorias, moeda, fuso, tema e zona de risco.", icon: "settings" },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Primeiros passos ────────────────────────────────────────────────
  {
    slug: "criar-contas",
    topic: "primeiros-passos",
    title: "Criar suas contas",
    summary: "Conta corrente, poupança, cartão, dinheiro vivo ou investimento: cada uma com dono e saldo próprio.",
    body: [
      { p: "Tudo no Velun acontece dentro de uma conta. Comece cadastrando as contas que você usa no dia a dia." },
      { h2: "Como criar", id: "como-criar" },
      { steps: [
        "Abra **Contas** no menu e toque em **Nova conta**.",
        "Dê um nome (por exemplo, \"Nubank\" ou \"Carteira\") e escolha o **Tipo**: Conta corrente, Poupança, Cartão de crédito, Dinheiro vivo ou Investimento.",
        "Em **De quem é esta conta**, escolha **Conta do casal** ou **Conta pessoal (minha)**.",
        "Informe o **Saldo inicial**: quanto a conta tem hoje.",
        "Salve. A conta já aparece no Dashboard e pode receber lançamentos.",
      ] },
      { h2: "Cartão de crédito", id: "cartao" },
      { p: "Pra cartão, o formulário pede também **Fecha todo dia**, **Vence todo dia**, o limite e de qual conta a fatura costuma ser paga (**Fatura paga com**). No lugar do saldo inicial, informe **quanto você deve hoje** no cartão." },
      { h2: "Arquivar em vez de apagar", id: "arquivar" },
      { p: "Conta que você não usa mais pode ser **arquivada** no menu ⋯ da conta. Ela sai dos totais, mas o histórico continua nos relatórios." },
    ],
    related: ["primeiros-passos/saldo-inicial", "casal-e-privacidade/conta-do-casal-ou-pessoal", "cartoes/como-o-velun-calcula-a-fatura"],
  },
  {
    slug: "saldo-inicial",
    topic: "primeiros-passos",
    title: "Saldo inicial e conta no vermelho",
    summary: "O ponto de partida da conta. Dá pra começar negativo, com o botão de menos.",
    body: [
      { p: "O **Saldo inicial** é quanto a conta tinha no dia em que você começou a usar o Velun. Daí pra frente, o saldo é ele mais as entradas menos as saídas confirmadas." },
      { h2: "Conta que começa negativa", id: "negativa" },
      { p: "Se a conta começa no vermelho (cheque especial, por exemplo), toque no **−** ao lado do valor antes de salvar. O **+** é o padrão." },
      { h2: "O saldo não bate com o banco", id: "nao-bate" },
      { list: [
        "Confira se há lançamentos **pendentes**: eles ainda não entram no saldo.",
        "Veja se algum lançamento ficou em outra conta.",
        "Se faltar um valor que você não consegue explicar, ajuste o saldo inicial em **Contas › ⋯ › Editar**.",
      ] },
    ],
    related: ["primeiros-passos/criar-contas", "lancamentos/pendente-e-confirmado"],
  },
  {
    slug: "primeiro-lancamento",
    topic: "primeiros-passos",
    title: "Fazer o primeiro lançamento",
    summary: "O botão + Lançamento (ou a tecla N) registra saídas, entradas e transferências.",
    body: [
      { p: "No computador, use o botão **+ Lançamento** no topo ou aperte a tecla **N**. No celular, é o **+** no meio da barra de baixo." },
      { h2: "Passo a passo", id: "passo-a-passo" },
      { steps: [
        "Escolha **Saída**, **Entrada** ou **Transferência**.",
        "Digite o **Valor** (aceita vírgula: 85,15) e confira a **Data**.",
        "Escreva uma **Descrição** curta, como \"Mercado\".",
        "Escolha a **Conta** e a **Categoria**. As que você mais usa ficam à mostra; as outras estão em **Outras**, com busca. Se a categoria tiver subcategorias, elas aparecem logo abaixo.",
        "Salve.",
      ] },
      { h2: "Opções", id: "opcoes" },
      { table: [
        ["Ainda não caiu", "Salva como pendente: aparece em A vencer, mas ainda não mexe no saldo."],
        ["Repetir esse lançamento", "Vira uma recorrência semanal, mensal ou anual, com data pra terminar se quiser."],
        ["Parcelas", "Só em saída no cartão: divide o total em até 24 vezes, uma em cada fatura."],
        ["+ Adicionar nota", "Um comentário seu sobre o lançamento."],
      ] },
      { tip: "Você só lança em contas do casal e nas suas contas pessoais. As contas pessoais de quem divide a casa com você são só leitura." },
    ],
    related: ["lancamentos/entrada-saida-e-transferencia", "lancamentos/pendente-e-confirmado", "a-vencer/recorrencias"],
  },
  {
    slug: "ocultar-valores-e-calculadora",
    topic: "primeiros-passos",
    title: "Ocultar valores e usar a calculadora",
    summary: "O olho no topo esconde os valores da tela; a calculadora abre ali mesmo.",
    body: [
      { h2: "Ocultar valores", id: "ocultar" },
      { p: "O ícone de olho no topo borra todos os valores do app, inclusive nos gráficos. É útil pra mostrar a tela a alguém ou usar em público. A escolha fica guardada neste navegador." },
      { h2: "Calculadora", id: "calculadora" },
      { p: "O ícone de calculadora, ao lado do olho, abre uma calculadora pequena por cima da tela. Dá pra usar o teclado do computador, e o botão de copiar leva o resultado pra área de transferência." },
      { list: [
        "Porcentagem: **200 + 10%** dá 220 (10% de 200 somado).",
        "A conta continua lá se você fechar e abrir de novo.",
      ] },
    ],
  },

  // ── Casal e privacidade ─────────────────────────────────────────────
  {
    slug: "convidar",
    topic: "casal-e-privacidade",
    title: "Convidar quem divide a casa",
    summary: "Gere um link de convite em Configurações e mande você mesmo.",
    body: [
      { steps: [
        "Abra **Configurações** e vá em **Pessoas da casa**.",
        "Toque em **Convidar alguém**. Se quiser, informe o email da pessoa: aí só esse email consegue usar o link.",
        "Toque em **Gerar convite** e depois em **Copiar link**.",
        "Mande o link pelo WhatsApp, email ou como preferir. O Velun não envia o convite sozinho.",
      ] },
      { p: "A pessoa abre o link, coloca o nome, o email e cria uma senha (mínimo de 6 caracteres). Ela já entra na casa na hora." },
      { h2: "Validade", id: "validade" },
      { list: [
        "O link vale por **7 dias** e funciona **uma vez só**.",
        "Mudou de ideia? Use **Revogar convite**.",
        "Se aparecer \"link inválido\", \"já usado\" ou \"expirado\", gere um novo.",
      ] },
    ],
    related: ["casal-e-privacidade/quem-ve-o-que", "casal-e-privacidade/conta-do-casal-ou-pessoal"],
  },
  {
    slug: "conta-do-casal-ou-pessoal",
    topic: "casal-e-privacidade",
    title: "Conta do casal ou conta pessoal",
    summary: "Conta do casal os dois usam por inteiro; a pessoal é sua, e você decide o que mostrar.",
    body: [
      { table: [
        ["Conta do casal", "Os dois veem tudo e os dois podem lançar, editar e importar extrato."],
        ["Conta pessoal", "Só você lança e edita. Você escolhe o que o outro vê dela."],
      ] },
      { p: "Você escolhe isso em **De quem é esta conta**, ao criar ou editar a conta. Em Contas, elas aparecem em grupos: **Do casal**, **Minhas** e as de quem divide a casa com você." },
      { tip: "Na dúvida, deixe a conta como pessoal e escolha mostrar \"Saldo e categorias\". Dá pra mudar depois." },
    ],
    related: ["casal-e-privacidade/quem-ve-o-que"],
  },
  {
    slug: "quem-ve-o-que",
    topic: "casal-e-privacidade",
    title: "Quem vê o quê no casal",
    summary: "Cada conta tem dono, e o dono decide o que o outro enxerga: nada, saldo, categorias ou tudo.",
    body: [
      { p: "O Velun foi feito pra dividir a casa sem precisar dividir tudo. Cada conta tem dono, e o dono decide o que o outro enxerga." },
      { h2: "Contas do casal", id: "casal" },
      { p: "Os dois veem tudo: saldo, categorias e cada lançamento. Os dois também podem lançar, editar e importar extrato nelas." },
      { h2: "Contas pessoais", id: "pessoal" },
      { p: "Só você lança e edita. Quem divide a casa com você vê o que você escolher em **Contas › ⋯ › Editar › O que o outro membro vê**:" },
      { table: [
        ["Ninguém mais vê", "A conta não aparece pro outro em lugar nenhum, nem nos totais."],
        ["Só o saldo", "Aparece o saldo e entra no fluxo de caixa. Nada de categorias ou lançamentos."],
        ["Saldo e categorias", "Também entra nos totais do mês e nos relatórios por categoria, sem mostrar cada lançamento. É o padrão."],
        ["Tudo visível", "Mostra cada lançamento, como numa conta do casal, mas continua só leitura pro outro."],
      ] },
      { tip: "Quando você muda o que o outro vê, ele recebe um aviso no sininho. Você não recebe aviso das suas próprias mudanças." },
      { h2: "Cartões pessoais", id: "cartao" },
      { p: "Valem as mesmas escolhas. Com \"só o saldo\" ou \"saldo e categorias\", o outro vê o total de cada fatura. As compras uma a uma aparecem só com \"tudo visível\"." },
      { h2: "Relatórios e PDF", id: "pdf" },
      { p: "O PDF segue as mesmas regras da tela: ninguém vê no relatório o que não veria no app." },
    ],
    related: ["casal-e-privacidade/convidar", "casal-e-privacidade/conta-do-casal-ou-pessoal", "cartoes/como-o-velun-calcula-a-fatura"],
  },
  {
    slug: "apagar-ou-arquivar-conta",
    topic: "casal-e-privacidade",
    title: "Apagar ou arquivar uma conta",
    summary: "Arquivar guarda o histórico. Apagar só vale pra conta sem lançamentos, e a do casal precisa do aval dos dois.",
    body: [
      { h2: "Arquivar", id: "arquivar" },
      { p: "No menu ⋯ da conta, **Arquivar** tira a conta dos totais e das listas do dia a dia, mas mantém os lançamentos no histórico. **Reativar** traz de volta." },
      { h2: "Excluir", id: "excluir" },
      { list: [
        "**Excluir conta** só funciona em conta **sem lançamentos**. Apague ou mova os lançamentos antes.",
        "As recorrências da conta são apagadas junto.",
        "Numa conta do casal, quando há duas pessoas na casa, o botão vira **Pedir pra excluir**: a outra pessoa aprova ou recusa pelo sininho ou pelo menu ⋯ da conta.",
      ] },
    ],
  },

  // ── Lançamentos ─────────────────────────────────────────────────────
  {
    slug: "entrada-saida-e-transferencia",
    topic: "lancamentos",
    title: "Entrada, saída e transferência",
    summary: "Transferência entre suas contas não conta como gasto nem como receita.",
    body: [
      { table: [
        ["Saída", "Dinheiro que saiu: compra, conta, saque."],
        ["Entrada", "Dinheiro que entrou: salário, reembolso, venda."],
        ["Transferência", "Dinheiro que mudou de conta, de \"Sai de\" pra \"Vai pra\". Não é gasto nem receita."],
      ] },
      { h2: "Por que transferência é diferente", id: "por-que" },
      { p: "Se você passa $500 da conta corrente pra poupança, você não gastou nada. Registrando como transferência, o Velun move o saldo entre as contas sem inflar as entradas e saídas do mês." },
      { list: [
        "Pagar a fatura do cartão também é uma transferência (da conta pro cartão).",
        "Lançamentos numa categoria do tipo **Entre contas** também ficam fora de receita e despesa.",
        "Apagar uma transferência apaga as duas pontas. Transferência não se edita: apague e lance de novo.",
      ] },
    ],
    related: ["configuracoes/categorias-e-subcategorias", "cartoes/pagar-a-fatura"],
  },
  {
    slug: "pendente-e-confirmado",
    topic: "lancamentos",
    title: "Lançamento pendente e confirmado",
    summary: "Pendente é o que ainda vai acontecer; só o confirmado mexe no saldo e nos totais.",
    body: [
      { p: "Todo lançamento é **pendente** (ainda não caiu) ou **confirmado** (já aconteceu)." },
      { list: [
        "O saldo, o Dashboard e os relatórios de \"Realizado\" contam só o confirmado.",
        "Pendentes aparecem em **A vencer** e no **Fluxo de caixa**, como previsão.",
        "Pendente com data que já passou fica em **Atrasadas**.",
      ] },
      { h2: "Como confirmar", id: "confirmar" },
      { list: [
        "Em **Transações**, toque no ✓ da linha (\"Confirmar: já caiu na conta\").",
        "Em **A vencer**, use **Pagar** ou **Recebi**.",
        "Pra vários de uma vez: selecione e use **Confirmar**.",
        "Ao importar o extrato, a previsão que bate com uma linha do banco é quitada sozinha.",
      ] },
    ],
    related: ["a-vencer/o-que-aparece-em-a-vencer", "importar/repetidos-e-previsoes"],
  },
  {
    slug: "ler-recibo-ou-print",
    topic: "lancamentos",
    title: "Ler recibo ou print",
    summary: "Escolha a foto do recibo ou o print do app e o Velun preenche valor, data e loja pra você conferir.",
    body: [
      { steps: [
        "Em **+ Lançamento**, toque em **Ler recibo ou print**.",
        "Escolha a imagem. No celular, dá pra tirar a foto na hora.",
        "Espere alguns segundos. Na primeira vez demora um pouco mais.",
        "Confira os campos marcados com **✦ do recibo**, ajuste o que precisar e lance.",
      ] },
      { list: [
        "O Velun procura o **total** (\"Total\", \"Amount\", \"Valor\"), a **data** e o **nome da loja** ou de quem recebeu.",
        "A categoria vem da que você já usou pra essa loja, quando houver.",
        "**Desfazer** volta o formulário como estava antes da leitura.",
      ] },
      { h2: "Pra ler melhor", id: "dicas" },
      { list: [
        "Print de app (Zelle, banco, e-mail de compra) funciona melhor que foto.",
        "Foto: recibo reto, inteiro, bem iluminado e sem reflexo.",
        "Recibo apagado, amassado ou torto pode sair com erro. Nada é lançado sem você conferir.",
      ] },
      { tip: "A imagem é lida no seu próprio aparelho e não fica guardada em lugar nenhum. Só o nome da loja vai pro Velun, pra sugerir a categoria." },
    ],
    related: ["primeiros-passos/primeiro-lancamento", "lancamentos/categorizar-varios"],
  },
  {
    slug: "compra-parcelada",
    topic: "lancamentos",
    title: "Compra parcelada no cartão",
    summary: "Digite o total e escolha as parcelas: cada uma entra na fatura do seu mês.",
    body: [
      { steps: [
        "Em **+ Lançamento**, escolha **Saída** e um **cartão de crédito** como conta.",
        "Digite o **valor total** da compra.",
        "Em **Parcelas**, escolha de 2 a 24 vezes.",
        "Salve.",
      ] },
      { list: [
        "Cada parcela vira um lançamento no mês certo, e entra na fatura daquele mês.",
        "Se a divisão não for exata, os centavos que sobram vão na primeira parcela.",
        "As parcelas futuras já ocupam o limite do cartão e aparecem em **Parcelas que ainda vêm**.",
      ] },
    ],
    related: ["cartoes/como-o-velun-calcula-a-fatura", "cartoes/limite-e-parcelas"],
  },
  {
    slug: "buscar-e-filtrar",
    topic: "lancamentos",
    title: "Buscar e filtrar transações",
    summary: "Busca por texto, filtros por conta, categoria, status, quem lançou e período.",
    body: [
      { p: "Em **Transações** você vê tudo o que entrou e saiu, com o total de **Entrou**, **Saiu** e **Saldo do período**." },
      { table: [
        ["Status", "Todas, Atrasadas, Pendentes ou Confirmadas."],
        ["Conta e categoria", "Filtrar por uma categoria inclui as subcategorias dela. Há também \"Sem categoria\"."],
        ["Mais filtros", "Quem lançou, Origem (manual ou importado), entradas x saídas e o período."],
        ["Período", "O mês do seletor, \"Todo o período\" ou datas de/até."],
      ] },
      { p: "No computador, a caixa **Buscar transações** no topo leva direto pra Transações com a busca feita." },
      { tip: "Listas longas aparecem em blocos de 200. Use **Mostrar mais** no fim da lista." },
    ],
  },
  {
    slug: "categorizar-varios",
    topic: "lancamentos",
    title: "Categorizar vários de uma vez",
    summary: "Selecione, escolha a categoria e aplique. O Velun também aprende a categoria de cada loja.",
    body: [
      { steps: [
        "Em **Transações**, marque os lançamentos (ou **Selecionar todas**).",
        "Em **Recategorizar para...**, escolha a categoria.",
        "Toque em **Aplicar**.",
      ] },
      { h2: "O Velun aprende", id: "aprende" },
      { p: "Quando você categoriza um lançamento que veio do banco, os outros da mesma loja ainda sem categoria recebem a mesma, e as próximas importações já chegam categorizadas. Cada pessoa da casa tem a sua própria memória." },
      { tip: "No Dashboard e em Relatórios, o aviso de \"sem categoria\" leva direto pra esses lançamentos." },
    ],
    related: ["configuracoes/categorias-e-subcategorias"],
  },

  // ── Importar ────────────────────────────────────────────────────────
  {
    slug: "extratos-aceitos",
    topic: "importar",
    title: "Quais extratos dá pra importar",
    summary: "Extrato em PDF do Regions e da Nomad, e fatura do cartão Nubank. Mais bancos em breve.",
    body: [
      { table: [
        ["Regions", "Extrato da conta. O Velun refaz o saldo dia a dia pra conferir que nada ficou de fora."],
        ["Nomad", "Extrato da conta. Linhas canceladas ficam de fora; as \"Processando\" entram."],
        ["Nubank (cartão)", "Fatura do cartão de crédito. Só numa conta do tipo cartão; ajusta os dias de fechamento e vencimento pelos da fatura."],
      ] },
      { h2: "O que não funciona", id: "nao-funciona" },
      { list: [
        "PDF escaneado (foto do papel) ou protegido por senha.",
        "Fatura de cartão numa conta corrente, ou extrato de conta num cartão.",
        "Outros bancos, por enquanto. Lance à mão enquanto isso.",
      ] },
      { h2: "Seu arquivo", id: "arquivo" },
      { p: "O PDF é lido no seu navegador. Só o texto das linhas vai pro Velun, e o arquivo não fica guardado." },
    ],
    related: ["importar/revisar-antes-de-confirmar"],
  },
  {
    slug: "revisar-antes-de-confirmar",
    topic: "importar",
    title: "Revisar antes de confirmar",
    summary: "Nada entra sem você ver: confira o saldo, marque o que entra e ajuste nomes e categorias.",
    body: [
      { steps: [
        "Em **Importar**, escolha de qual conta é o extrato.",
        "Mande o PDF e toque em **Ler e revisar**.",
        "Na revisão, confira o aviso de saldo: \"O saldo bate com o extrato\" ou \"não bate\".",
        "Desmarque o que não deve entrar, ajuste nomes e categorias. As sugestões automáticas vêm com ✦.",
        "Toque em **Confirmar** pra lançar tudo de uma vez, ou **Descartar** pra desistir.",
      ] },
      { tip: "Cada conta pode ter uma revisão aberta por vez. Termine ou descarte antes de importar outro extrato da mesma conta." },
    ],
    related: ["importar/repetidos-e-previsoes", "importar/desfazer"],
  },
  {
    slug: "repetidos-e-previsoes",
    topic: "importar",
    title: "Repetidos, previsões e lançamentos à mão",
    summary: "Importar o mesmo extrato duas vezes não duplica; previsões e lançamentos à mão são reconhecidos.",
    body: [
      { h2: "Já existe", id: "ja-existe" },
      { p: "Linhas que já estão no Velun vêm **desmarcadas** com a marca **Já existe**. O Velun compara conta, data, valor e o texto do banco, e conta quantas vezes cada uma aparece: três saques iguais no mesmo dia continuam sendo três." },
      { h2: "Previsões", id: "previsoes" },
      { p: "Uma linha do banco com o mesmo valor de uma recorrência prevista, perto da data (até 3 dias pra semanal, 5 pras outras), aparece como **Quita**: ao confirmar, a previsão vira o lançamento real. Use **Separar** se não for a mesma coisa." },
      { h2: "Lançados à mão", id: "a-mao" },
      { p: "Se você já lançou à mão algo que está no extrato (mesmo valor, até 7 dias de diferença), a linha vem desmarcada com a opção **Juntar**." },
      { h2: "Pagamento de fatura", id: "fatura" },
      { p: "No extrato da conta, o pagamento do cartão é reconhecido e vira transferência pro cartão. Se não for, toque em **Não é pagamento**." },
    ],
    related: ["importar/revisar-antes-de-confirmar", "lancamentos/pendente-e-confirmado"],
  },
  {
    slug: "desfazer",
    topic: "importar",
    title: "Desfazer uma importação",
    summary: "Em Importações recentes, Desfazer apaga tudo o que aquela importação criou.",
    body: [
      { p: "Na tela **Importar**, a lista **Importações recentes** mostra as últimas cinco. **Desfazer** apaga tudo o que aquela importação lançou, inclusive o que você editou depois, e devolve as previsões que ela tinha quitado." },
      { tip: "Desfazer não tem volta. Se só algumas linhas estão erradas, é mais simples corrigir ou apagar essas linhas em Transações." },
    ],
  },

  // ── Cartões ─────────────────────────────────────────────────────────
  {
    slug: "como-o-velun-calcula-a-fatura",
    topic: "cartoes",
    title: "Como o Velun calcula a fatura",
    summary: "Compra no dia do fechamento entra na fatura que fecha; o que sobra sem pagar passa pra próxima.",
    body: [
      { p: "A fatura é calculada a partir das compras do cartão, com os dias de **fechamento** e **vencimento** que você cadastrou." },
      { list: [
        "Compra feita **no dia do fechamento** ainda entra na fatura que está fechando.",
        "O vencimento é o primeiro dia de vencimento depois do fechamento. Dia 31 vira o último dia em meses mais curtos.",
        "Estornos aparecem como **Estorno** e abatem da fatura.",
        "O que ficar sem pagar passa pra fatura seguinte como **Saldo da fatura anterior**.",
      ] },
      { h2: "Situação da fatura", id: "situacao" },
      { table: [
        ["Aberta", "Ainda recebendo compras."],
        ["Fechada", "Fechou e espera o pagamento."],
        ["Paga", "Quitada."],
        ["Vencida", "Passou do vencimento sem pagamento completo."],
      ] },
    ],
    related: ["cartoes/pagar-a-fatura", "lancamentos/compra-parcelada"],
  },
  {
    slug: "pagar-a-fatura",
    topic: "cartoes",
    title: "Pagar ou adiantar a fatura",
    summary: "O pagamento é uma transferência da conta pro cartão, então não conta como gasto de novo.",
    body: [
      { steps: [
        "Em **Cartões**, abra a fatura e toque em **Pagar fatura** (ou **Adiantar pagamento**, com a fatura ainda aberta).",
        "Confira o **Valor**, a conta em **Sai de** e a **Data**.",
        "Toque em **Registrar pagamento**.",
      ] },
      { p: "Os gastos já foram contados quando você fez cada compra. Por isso o pagamento vira uma transferência: o saldo da conta cai, a dívida do cartão diminui e nada é contado duas vezes." },
      { tip: "Pagou só uma parte? O resto aparece na próxima fatura como \"Saldo da fatura anterior\"." },
    ],
    related: ["cartoes/como-o-velun-calcula-a-fatura", "lancamentos/entrada-saida-e-transferencia"],
  },
  {
    slug: "limite-e-parcelas",
    topic: "cartoes",
    title: "Limite e parcelas que ainda vêm",
    summary: "O limite livre já desconta as parcelas futuras.",
    body: [
      { list: [
        "Com o limite cadastrado, o cartão mostra quanto está **livre**.",
        "Parcelas de meses futuros já ocupam o limite, como no banco.",
        "**Parcelas que ainda vêm** lista o que vai cair nas próximas faturas.",
      ] },
      { h2: "Cartão de quem divide a casa", id: "do-outro" },
      { p: "No cartão pessoal do outro, você vê o que ele escolheu mostrar. Normalmente é só o total de cada fatura; as compras uma a uma aparecem só se ele deixar \"tudo visível\"." },
    ],
    related: ["lancamentos/compra-parcelada", "casal-e-privacidade/quem-ve-o-que"],
  },

  // ── A vencer ────────────────────────────────────────────────────────
  {
    slug: "o-que-aparece-em-a-vencer",
    topic: "a-vencer",
    title: "O que aparece em A vencer",
    summary: "Tudo o que sai e entra nos próximos 30 dias: pendentes, recorrências e faturas.",
    body: [
      { p: "**A vencer** junta o que está previsto pros próximos 30 dias, separado em **Atrasadas**, **Esta semana** e **Mais adiante**. As abas filtram por **A pagar**, **A receber** e **Recorrências**." },
      { list: [
        "Cada **fatura de cartão** aparece numa linha só, com a situação (aberta ou fechada), e não compra por compra.",
        "**Pagar** e **Recebi** confirmam o lançamento na hora.",
        "Se o saldo projetado ficar negativo em algum dia, um aviso mostra quando.",
        "O filtro de conta, ao lado das abas, mostra só o que sai ou entra numa conta. Escolhendo uma conta, as faturas dos cartões pagos por ela entram junto.",
      ] },
    ],
    related: ["a-vencer/recorrencias", "lancamentos/pendente-e-confirmado"],
  },
  {
    slug: "recorrencias",
    topic: "a-vencer",
    title: "Contas fixas e salário (recorrências)",
    summary: "Cadastre uma vez e o Velun prevê as próximas ocorrências.",
    body: [
      { p: "Aluguel, internet, assinatura, salário: o que se repete vira uma **recorrência**. As próximas ocorrências entram como pendentes e aparecem em A vencer e no Fluxo de caixa." },
      { h2: "Como criar", id: "criar" },
      { steps: [
        "Em **A vencer**, abra a aba **Recorrências** e toque em **Nova recorrência**.",
        "Preencha descrição, valor, conta, categoria e a **Frequência** (semanal, mensal ou anual).",
        "Na mensal, escolha o **Dia do mês**. Dia 31 cai no último dia dos meses mais curtos.",
        "Se tiver fim, preencha **Termina em**.",
      ] },
      { p: "Também dá pra criar na hora de lançar: marque **Repetir esse lançamento** no + Lançamento." },
      { tip: "Quando o extrato chega, a previsão que bate com a linha do banco é quitada sozinha." },
    ],
    related: ["a-vencer/mudar-ou-parar-recorrencia", "importar/repetidos-e-previsoes"],
  },
  {
    slug: "mudar-ou-parar-recorrencia",
    topic: "a-vencer",
    title: "Mudar de conta ou parar uma recorrência",
    summary: "Mover leva as próximas ocorrências pra outra conta; Desativar apaga as que ainda não aconteceram.",
    body: [
      { table: [
        ["Mover", "Leva a recorrência e as ocorrências previstas pra outra conta. O que já foi pago fica onde aconteceu."],
        ["Desativar", "Para a recorrência e apaga as ocorrências pendentes de hoje em diante. O histórico fica."],
      ] },
      { p: "Pra mudar só uma ocorrência (um mês com valor diferente, por exemplo), edite aquele lançamento em Transações." },
    ],
  },

  // ── Dashboard e fluxo ───────────────────────────────────────────────
  {
    slug: "entender-o-dashboard",
    topic: "dashboard-e-fluxo",
    title: "Entender o Dashboard",
    summary: "Saldo de hoje, quanto sobrou no mês, para onde foi o dinheiro e o que vence.",
    body: [
      { table: [
        ["Saldo total · hoje", "A soma das contas que você vê, com a previsão pra daqui a 30 dias."],
        ["Sobrou", "Entradas menos saídas confirmadas no mês, comparado com o mês anterior."],
        ["Contas", "Toque numa conta pra filtrar o Dashboard por ela."],
        ["Próximos vencimentos", "O que vence nos próximos 30 dias, inclusive o atrasado."],
        ["Para onde foi", "Gastos por categoria. Toque numa categoria pra ver os lançamentos."],
      ] },
      { list: [
        "O Dashboard conta só o que já foi **confirmado**.",
        "Transferências entre contas ficam fora de entradas e saídas.",
        "Se uma conta pessoal do outro ficar fora do total, o card avisa \"1 conta pessoal fora deste total\".",
      ] },
      { tip: "Clique no nome do mês pra pular pra qualquer mês ou ano." },
    ],
    related: ["dashboard-e-fluxo/fluxo-de-caixa", "casal-e-privacidade/quem-ve-o-que"],
  },
  {
    slug: "fluxo-de-caixa",
    topic: "dashboard-e-fluxo",
    title: "Fluxo de caixa e saldo projetado",
    summary: "Quanto vai ter na conta nos próximos dias, contando o que já está previsto.",
    body: [
      { p: "O **Fluxo de caixa** pega o saldo de hoje e soma o que está previsto, dia a dia, por 30, 60 ou 90 dias, ou 6 meses." },
      { table: [
        ["Menor saldo", "O ponto mais baixo do período e quando acontece."],
        ["Dias no negativo", "Quantos dias o saldo projetado fica abaixo de zero."],
        ["Próximos eventos", "O que mexe no saldo, em ordem."],
      ] },
      { list: [
        "Compras no cartão não tiram dinheiro da conta na hora: o que sai é o pagamento da fatura, no vencimento.",
        "Lançamentos atrasados ficam de fora da projeção. O aviso no topo deixa incluir com **Incluir na projeção**.",
        "O filtro de conta mostra a projeção de uma conta só, com as faturas dos cartões que ela paga.",
        "Se alguma conta fica no vermelho no período, mesmo com o total positivo, um aviso no topo diz qual e quando. O banco cobra o cheque especial conta por conta.",
      ] },
    ],
    related: ["a-vencer/o-que-aparece-em-a-vencer"],
  },

  // ── Relatórios ──────────────────────────────────────────────────────
  {
    slug: "por-categoria",
    topic: "relatorios",
    title: "Relatório por categoria",
    summary: "Quanto entrou e saiu em cada categoria, com comparação e subcategorias.",
    body: [
      { list: [
        "**Realizado** mostra o que já aconteceu; **A vencer** mostra o que está previsto.",
        "Em **Por categoria**, alterne entre valor e percentual.",
        "A comparação com o período anterior mostra o que subiu, desceu ou é novo.",
        "Categoria com subcategorias abre a divisão por sub ao tocar.",
        "Toque numa categoria (ou sub) pra ver os lançamentos num painel ao lado.",
      ] },
      { tip: "Se mais de 20% dos gastos estiverem sem categoria, um aviso leva direto pra categorizar." },
    ],
    related: ["relatorios/periodos", "configuracoes/categorias-e-subcategorias"],
  },
  {
    slug: "periodos",
    topic: "relatorios",
    title: "Mês, ano, todo o período ou datas",
    summary: "O seletor de período troca entre um mês, um ano, tudo ou um intervalo seu.",
    body: [
      { table: [
        ["Mês", "Um mês, com comparação com o anterior."],
        ["Ano", "Os 12 meses do ano, com a evolução mês a mês."],
        ["Tudo", "Desde o primeiro lançamento."],
        ["De / até", "Um intervalo que você escolhe. Há atalhos pros últimos 3 e 12 meses."],
      ] },
      { p: "Em períodos longos, o gráfico de evolução mostra mês a mês e os destaques resumem o período inteiro." },
    ],
    related: ["relatorios/baixar-pdf"],
  },
  {
    slug: "baixar-pdf",
    topic: "relatorios",
    title: "Baixar o relatório em PDF",
    summary: "Escolha período, completo ou resumo, e as contas. Serve também pro contador.",
    body: [
      { steps: [
        "Em **Relatórios**, toque em **Baixar PDF**.",
        "Escolha o período: o mês, o ano ou datas.",
        "Escolha **Completo** (com o detalhamento de cada categoria) ou **Só o resumo**.",
        "Marque as contas que entram e toque em **Gerar PDF**.",
        "Na janela de impressão que abre, escolha **Salvar como PDF**.",
      ] },
      { list: [
        "O PDF é montado no seu navegador; nenhum serviço de fora vê seus dados.",
        "Segue as mesmas regras de privacidade da tela.",
        "Na parte de contas, as transferências aparecem, porque mudam o saldo de cada conta.",
      ] },
    ],
  },

  // ── Metas ───────────────────────────────────────────────────────────
  {
    slug: "tipos-de-meta",
    topic: "metas",
    title: "Tipos de meta",
    summary: "Juntar dinheiro, limite de gasto por categoria ou quitar uma dívida.",
    body: [
      { table: [
        ["Juntar dinheiro", "Um valor pra chegar até uma data: viagem, reserva, entrada de um carro."],
        ["Limite de gasto", "Um teto mensal pra uma categoria. Fica amarelo ao chegar em 80%. Limite numa categoria inclui as subcategorias."],
        ["Quitar dívida", "Quanto falta pagar de um empréstimo ou financiamento."],
      ] },
      { h2: "De quem é", id: "de-quem" },
      { p: "Meta **Do casal** os dois veem. Meta **Minha** é sua; marque \"Quem divide a casa pode ver\" se quiser mostrar." },
      { p: "O andamento aparece como **No ritmo**, **Abaixo do ritmo** ou **Concluída**." },
    ],
    related: ["metas/acompanhar"],
  },
  {
    slug: "acompanhar",
    topic: "metas",
    title: "Guardar valor e acompanhar",
    summary: "Registre os valores à mão, ligue um lançamento ou siga o saldo de uma conta.",
    body: [
      { p: "Em **Como acompanhar**, escolha entre registrar os valores você mesmo ou seguir o saldo de uma conta (uma poupança, por exemplo)." },
      { list: [
        "**Guardar valor** (ou **Registrar pagamento**, em dívida): digite o valor ou ligue a um lançamento que você já fez.",
        "Valor com data futura fica como agendado até o dia chegar.",
        "**Tirar da meta** desfaz um valor guardado.",
        "Quando um lançamento parece ser da meta, o Velun sugere: \"Parece pagamento desta meta\".",
        "**Editar e histórico** mostra tudo o que entrou na meta.",
      ] },
    ],
    related: ["metas/programar-transferencia"],
  },
  {
    slug: "programar-transferencia",
    topic: "metas",
    title: "Programar uma transferência mensal",
    summary: "Em meta que segue o saldo de uma conta, programe \"todo dia 5, $500 pra poupança\".",
    body: [
      { p: "Numa meta de juntar dinheiro que segue o saldo de uma conta, **Programar transferência** cria transferências mensais previstas de outra conta pra ela. Elas aparecem em Transações, A vencer e no Fluxo de caixa. Confirmadas, o saldo da conta sobe e a meta anda sozinha." },
      { list: [
        "Meta do casal só programa a partir de conta do casal.",
        "**Apagar as pendentes** cancela a programação e apaga o que ainda não caiu.",
      ] },
    ],
  },

  // ── Configurações ───────────────────────────────────────────────────
  {
    slug: "categorias-e-subcategorias",
    topic: "configuracoes",
    title: "Categorias e subcategorias",
    summary: "Despesa, receita ou entre contas; subcategorias com um nível só.",
    body: [
      { p: "Em **Configurações › Categorias**, as abas separam **Despesa**, **Receita** e **Entre contas**. Categoria \"Entre contas\" não conta como receita nem despesa." },
      { h2: "Subcategorias", id: "subcategorias" },
      { list: [
        "Uma categoria pode ter subcategorias, como **Transporte › Gasolina**. É um nível só: sub não tem sub.",
        "Nos relatórios e no Dashboard, a sub soma na categoria principal; ao abrir a categoria, aparece a divisão.",
        "Categoria \"Entre contas\" não tem subcategoria.",
        "Dá pra criar uma sub na hora de lançar, nos botões abaixo da categoria.",
      ] },
      { h2: "Apagar", id: "apagar" },
      { list: [
        "Apagar uma **sub** leva os lançamentos dela pra categoria principal.",
        "Apagar uma **categoria principal** deixa os lançamentos sem categoria, e as subs dela viram categorias principais.",
      ] },
    ],
    related: ["lancamentos/categorizar-varios", "relatorios/por-categoria"],
  },
  {
    slug: "moeda-fuso-e-aparencia",
    topic: "configuracoes",
    title: "Moeda, fuso e aparência",
    summary: "A moeda e o fuso valem pra casa toda; o tema claro ou escuro é de cada aparelho.",
    body: [
      { table: [
        ["País", "EUA ou Brasil."],
        ["Fuso horário", "Decide o que é \"hoje\" pra casa: o que vence hoje, o que está atrasado."],
        ["Moeda", "Como os valores aparecem. Trocar a moeda não converte nada: só muda o símbolo."],
        ["Aparência", "Sistema, Claro ou Escuro. Vale só pro aparelho em que você escolheu. Também dá pra trocar no pé do menu lateral (ou no \"Mais\", no celular)."],
      ] },
      { p: "Em **Perfil**, você muda seu nome e sua foto (PNG, JPG ou WEBP, até 2 MB)." },
    ],
  },
  {
    slug: "zona-de-risco",
    topic: "configuracoes",
    title: "Apagar transações ou resetar tudo",
    summary: "Duas formas de recomeçar, sem volta. Leia antes de usar.",
    body: [
      { table: [
        ["Apagar transações", "Apaga lançamentos, recorrências e importações, e zera os saldos iniciais. Contas e categorias ficam."],
        ["Resetar tudo", "Apaga lançamentos, recorrências, categorias e contas."],
      ] },
      { tip: "As duas são definitivas: não há como desfazer. Se a ideia é só corrigir uma importação, use Desfazer na tela Importar." },
    ],
  },
];

export type HelpFaq = { q: string; a: string; link?: string };

export const HELP_FAQ: HelpFaq[] = [
  {
    q: "Quem divide a casa comigo vê tudo o que eu gasto?",
    a: "Não necessariamente. Contas do casal os dois veem por inteiro. Numa conta pessoal, você escolhe o que o outro vê: nada, só o saldo, saldo e categorias, ou tudo. E ele nunca lança nem edita na sua conta pessoal.",
    link: "casal-e-privacidade/quem-ve-o-que",
  },
  {
    q: "O Velun se conecta ao meu banco?",
    a: "Não. Você importa o PDF do extrato ou lança à mão. O Velun nunca pede a senha do seu banco.",
    link: "importar/extratos-aceitos",
  },
  {
    q: "De quais bancos dá pra importar extrato?",
    a: "Por enquanto: extrato do Regions e da Nomad, e fatura do cartão Nubank, sempre em PDF. Outros bancos estão a caminho.",
    link: "importar/extratos-aceitos",
  },
  {
    q: "Se eu importar o mesmo extrato duas vezes, duplica?",
    a: "Não. O que já está no Velun vem desmarcado com a marca \"Já existe\", e só entra se você marcar de propósito.",
    link: "importar/repetidos-e-previsoes",
  },
  {
    q: "Transferência entre minhas contas conta como gasto?",
    a: "Não. Transferência só move o dinheiro de uma conta pra outra. Pagar a fatura do cartão também é transferência, então a compra não é contada duas vezes.",
    link: "lancamentos/entrada-saida-e-transferencia",
  },
  {
    q: "Meus extratos ficam guardados no Velun?",
    a: "Não. O PDF é lido no seu navegador, só o texto das linhas vai pro Velun, e o arquivo não é guardado.",
    link: "importar/extratos-aceitos",
  },
  {
    q: "Como desfaço uma importação que deu errado?",
    a: "Na tela Importar, em Importações recentes, toque em Desfazer. Tudo o que aquela importação criou é apagado.",
    link: "importar/desfazer",
  },
  {
    q: "Esqueci minha senha. E agora?",
    a: "Na tela de entrar, toque em \"Esqueci minha senha\" e informe seu email. Chega um link pra criar uma senha nova; ele vale por 1 hora. Abra no mesmo navegador em que pediu.",
  },
  {
    q: "Trocar a moeda converte os valores?",
    a: "Não. A moeda só muda o símbolo e o formato dos números. Os valores continuam os mesmos.",
    link: "configuracoes/moeda-fuso-e-aparencia",
  },
];

/** O "?" de cada tela: três pontos e o artigo que aprofunda. */
export type ScreenHelpKey =
  | "mes"
  | "transacoes"
  | "a-vencer"
  | "cartoes"
  | "fluxo-de-caixa"
  | "relatorios"
  | "metas"
  | "contas"
  | "importar"
  | "configuracoes";

export const SCREEN_HELP: Record<ScreenHelpKey, { title: string; points: string[]; article: string }> = {
  mes: {
    title: "Como funciona o Dashboard",
    points: [
      "Conta só o que já foi confirmado; o previsto fica em A vencer.",
      "Transferências entre contas não entram em entradas e saídas.",
      "Toque numa conta ou categoria pra ver só ela.",
    ],
    article: "dashboard-e-fluxo/entender-o-dashboard",
  },
  transacoes: {
    title: "Como funciona Transações",
    points: [
      "Pendente ainda não mexe no saldo; confirme quando cair.",
      "Selecione vários pra recategorizar ou confirmar de uma vez.",
      "Filtrar por uma categoria inclui as subcategorias dela.",
    ],
    article: "lancamentos/buscar-e-filtrar",
  },
  "a-vencer": {
    title: "Como funciona A vencer",
    points: [
      "Mostra o que sai e entra nos próximos 30 dias.",
      "Cada fatura de cartão aparece numa linha só.",
      "Recorrências viram previsões aqui; Pagar ou Recebi confirma.",
    ],
    article: "a-vencer/o-que-aparece-em-a-vencer",
  },
  cartoes: {
    title: "Como funcionam os cartões",
    points: [
      "Compra no dia do fechamento ainda entra na fatura que está fechando.",
      "Pagar a fatura é uma transferência da conta pro cartão: não conta como gasto de novo.",
      "O que ficar sem pagar passa pra próxima fatura como \"Saldo da fatura anterior\".",
    ],
    article: "cartoes/como-o-velun-calcula-a-fatura",
  },
  "fluxo-de-caixa": {
    title: "Como funciona o fluxo de caixa",
    points: [
      "Parte do saldo de hoje e soma o que está previsto, dia a dia.",
      "Compra no cartão só sai da conta no vencimento da fatura.",
      "Atrasados ficam de fora, a menos que você inclua.",
    ],
    article: "dashboard-e-fluxo/fluxo-de-caixa",
  },
  relatorios: {
    title: "Como funcionam os relatórios",
    points: [
      "Realizado é o que aconteceu; A vencer é o que está previsto.",
      "Toque numa categoria pra ver os lançamentos e as subcategorias.",
      "Baixar PDF monta o relatório no seu navegador.",
    ],
    article: "relatorios/por-categoria",
  },
  metas: {
    title: "Como funcionam as metas",
    points: [
      "Juntar dinheiro, limite de gasto por categoria ou quitar dívida.",
      "Acompanhe à mão ou pelo saldo de uma conta.",
      "Meta do casal os dois veem; a sua, só se você deixar.",
    ],
    article: "metas/tipos-de-meta",
  },
  contas: {
    title: "Como funcionam as contas",
    points: [
      "Conta do casal os dois usam; a pessoal só você lança.",
      "Em conta pessoal, você escolhe o que o outro vê.",
      "Arquivar tira dos totais sem apagar o histórico.",
    ],
    article: "casal-e-privacidade/conta-do-casal-ou-pessoal",
  },
  importar: {
    title: "Como funciona a importação",
    points: [
      "Aceita PDF do Regions, da Nomad e a fatura do Nubank.",
      "Nada entra sem você revisar; repetidos vêm desmarcados.",
      "Importações recentes podem ser desfeitas.",
    ],
    article: "importar/extratos-aceitos",
  },
  configuracoes: {
    title: "Como funcionam as configurações",
    points: [
      "Moeda e fuso valem pra casa toda; o tema é de cada aparelho.",
      "Subcategorias têm um nível só.",
      "A zona de risco apaga de vez. Leia antes.",
    ],
    article: "configuracoes/categorias-e-subcategorias",
  },
};

// ── Consultas ─────────────────────────────────────────────────────────

export function topicBySlug(slug: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.slug === slug);
}

export function articlesOf(topic: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.topic === topic);
}

/** "assunto/artigo" → artigo. */
export function articleByPath(path: string): HelpArticle | undefined {
  const [topic, slug] = path.split("/");
  return HELP_ARTICLES.find((a) => a.topic === topic && a.slug === slug);
}

export function articleHref(a: Pick<HelpArticle, "topic" | "slug">): string {
  return `/ajuda/${a.topic}/${a.slug}`;
}

/** Texto corrido do artigo, sem marcação: alimenta a busca. */
export function articlePlainText(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary];
  for (const b of a.body) {
    if ("p" in b) parts.push(b.p);
    else if ("h2" in b) parts.push(b.h2);
    else if ("tip" in b) parts.push(b.tip);
    else if ("list" in b) parts.push(...b.list);
    else if ("steps" in b) parts.push(...b.steps);
    else if ("table" in b) parts.push(...b.table.flat());
  }
  return parts.join(" ").replace(/\*\*/g, "");
}

/** Minúsculas e sem acento, pra "fatura" achar "Fatura" e "previsao" achar "previsão". */
export function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type HelpSearchEntry = {
  href: string;
  title: string;
  topic: string;
  summary: string;
  text: string;
};

export function helpSearchIndex(): HelpSearchEntry[] {
  return HELP_ARTICLES.map((a) => ({
    href: articleHref(a),
    title: a.title,
    topic: topicBySlug(a.topic)?.title ?? "",
    summary: a.summary,
    text: articlePlainText(a),
  }));
}

/**
 * Busca simples: todas as palavras precisam aparecer. Título pesa mais
 * que o resumo, que pesa mais que o corpo.
 */
export function searchHelp(index: HelpSearchEntry[], query: string, limit = 6): HelpSearchEntry[] {
  const words = foldText(query).split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const scored: { e: HelpSearchEntry; score: number }[] = [];
  for (const e of index) {
    const title = foldText(e.title);
    const summary = foldText(e.summary);
    const text = foldText(e.text);
    let score = 0;
    let all = true;
    for (const w of words) {
      if (title.includes(w)) score += 10;
      else if (summary.includes(w)) score += 4;
      else if (text.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.e);
}
