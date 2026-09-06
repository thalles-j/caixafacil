export type ExplanatoryHelpTopic = {
  id: string;
  kind: 'explanation';
  title: string;
  summary: string;
  content: string;
  keywords: string[];
};

export type TutorialStep = {
  title: string;
  description: string;
  location: string;
};

export type TutorialHelpTopic = {
  id: string;
  kind: 'tutorial';
  title: string;
  summary: string;
  example: {
    title: string;
    situation: string;
    expectedResult: string;
  };
  steps: TutorialStep[];
  keywords: string[];
};

export type HelpTopic = ExplanatoryHelpTopic | TutorialHelpTopic;

export const helpTopics: HelpTopic[] = [
  {
    id: 'painel-inicial',
    kind: 'explanation',
    title: 'O que aparece no Painel Inicial?',
    summary: 'Entenda os números, avisos e atalhos da primeira tela.',
    content:
      'O Painel Inicial reúne vendas, despesas, lucro estimado, meta e movimentações recentes. Os avisos mostram contas que precisam de atenção, e os cartões levam direto para os detalhes. Nas Configurações, você escolhe se os números representam o dia atual ou os últimos sete dias.',
    keywords: ['dashboard', 'inicio', 'resumo', 'avisos', 'números', 'meta'],
  },
  {
    id: 'venda-entrada-despesa',
    kind: 'explanation',
    title: 'Venda, entrada e despesa: qual é a diferença?',
    summary: 'Saiba como cada movimentação afeta o caixa.',
    content:
      'Venda é a cobrança de um produto ou serviço. Entrada é qualquer outro valor recebido, como uma gorjeta ou aporte, enquanto despesa é um valor que saiu do negócio. Uma venda fiada só vira entrada quando o cliente paga.',
    keywords: ['lançamento', 'movimentação', 'receita', 'saída', 'dinheiro'],
  },
  {
    id: 'sessao-caixa',
    kind: 'explanation',
    title: 'Como funciona uma sessão de caixa?',
    summary: 'Veja por que abrir e fechar o caixa todos os dias.',
    content:
      'A sessão agrupa as vendas e movimentações feitas entre a abertura e o fechamento do caixa. O valor inicial representa o dinheiro físico disponível no começo. No fechamento, você confere o valor contado e identifica possíveis diferenças.',
    keywords: ['abrir', 'fechar', 'valor inicial', 'dinheiro contado', 'sessão'],
  },
  {
    id: 'pendencia-identificacao',
    kind: 'explanation',
    title: 'O que é uma pendência de identificação?',
    summary: 'Entenda por que alguns lançamentos precisam ser revisados.',
    content:
      'Uma pendência aparece quando uma entrada ou despesa foi registrada sem informação suficiente para classificá-la. Ela não é perdida: fica destacada para revisão durante o fechamento. Identificar as pendências mantém os relatórios mais claros.',
    keywords: ['pendente', 'identificar', 'classificar', 'revisar', 'fechamento'],
  },
  {
    id: 'venda-fiada',
    kind: 'explanation',
    title: 'Como funciona uma venda fiada?',
    summary: 'Entenda quando o valor entra no saldo.',
    content:
      'Na venda fiada, a cobrança fica vinculada a um cliente e aparece em A Receber. O valor ainda não entra no saldo do caixa. Quando o cliente pagar, dê baixa escolhendo a forma de recebimento para registrar a entrada corretamente.',
    keywords: ['fiado', 'cliente', 'dívida', 'receber', 'baixa', 'pagamento'],
  },
  {
    id: 'contas-pagar-receber',
    kind: 'explanation',
    title: 'Contas a pagar e a receber',
    summary: 'Diferencie compromissos do negócio e valores de clientes.',
    content:
      'A Pagar reúne despesas e compromissos do negócio, incluindo gastos fixos. A Receber mostra valores de vendas fiadas separados por cliente. As contas continuam pendentes até você confirmar o pagamento ou recebimento.',
    keywords: ['financeiro', 'vencimento', 'gasto fixo', 'cliente', 'dívida'],
  },
  {
    id: 'saldo-lucro',
    kind: 'explanation',
    title: 'Como são calculados saldo e lucro estimado?',
    summary: 'Entenda o que entra nos indicadores financeiros.',
    content:
      'O saldo considera as entradas recebidas e desconta as saídas pagas no período selecionado. O lucro estimado compara o que entrou com as despesas registradas. Vendas fiadas ainda não pagas ficam fora das entradas até receberem baixa.',
    keywords: ['cálculo', 'resultado', 'recebido', 'pago', 'indicador'],
  },
  {
    id: 'relatorios',
    kind: 'explanation',
    title: 'Para que servem os relatórios?',
    summary: 'Compare períodos e acompanhe o desempenho do negócio.',
    content:
      'Os relatórios organizam entradas, despesas, produtos vendidos e resultados por dia, semana ou mês. O relatório diário também mostra a conferência de cada caixa fechado. Qualquer relatório aberto pode ser impresso ou salvo em PDF.',
    keywords: ['diário', 'semanal', 'mensal', 'gráfico', 'pdf', 'imprimir'],
  },
  {
    id: 'backup-restauracao',
    kind: 'explanation',
    title: 'Como funcionam backup e restauração?',
    summary: 'Proteja os dados e saiba o que acontece ao importar.',
    content:
      'Exportar Dados cria um arquivo com as informações atuais do aplicativo para você guardar. Importar Dados substitui o conteúdo atual pelo arquivo escolhido, depois de uma confirmação. Faça um novo backup antes de restaurar um arquivo antigo.',
    keywords: ['exportar', 'importar', 'arquivo', 'segurança', 'restaurar'],
  },
  {
    id: 'abrir-caixa',
    kind: 'tutorial',
    title: 'Como abrir o caixa',
    summary: 'Inicie uma sessão com o valor correto em dinheiro.',
    example: {
      title: 'Abertura da Padaria da Ana',
      situation: 'Ana contou R$ 150,00 em notas e moedas antes de começar o atendimento da manhã.',
      expectedResult: 'A sessão começa com R$ 150,00 e esse valor será considerado na conferência do fechamento.',
    },
    keywords: ['iniciar', 'abertura', 'valor inicial', 'sessão'],
    steps: [
      {
        title: 'Entre na Frente de Caixa',
        description: 'Abra Caixa pelo menu principal. Se não houver uma sessão ativa, a tela mostrará que o caixa está fechado.',
        location: 'Menu Caixa',
      },
      {
        title: 'Toque em Abrir Caixa',
        description: 'Use o botão no alto da tela para abrir a janela de início da sessão.',
        location: 'Topo da Frente de Caixa · Abrir Caixa',
      },
      {
        title: 'Informe o valor inicial',
        description: 'Digite quanto existe em dinheiro físico no caixa. Se não houver nenhum valor, você pode informar zero.',
        location: 'Janela Abrir novo caixa · Valor inicial',
      },
      {
        title: 'Confirme a abertura',
        description: 'Finalize a abertura. O status “Caixa aberto” aparecerá e as opções de venda serão liberadas.',
        location: 'Janela Abrir novo caixa · botão de confirmação',
      },
    ],
  },
  {
    id: 'registrar-venda',
    kind: 'tutorial',
    title: 'Como registrar uma venda',
    summary: 'Adicione itens, escolha o pagamento e faça a cobrança.',
    example: {
      title: 'Dois cafés e uma fatia de bolo',
      situation: 'Um cliente pediu 2 cafés de R$ 8,00 e 1 fatia de bolo de R$ 12,00, pagando R$ 28,00 no Pix.',
      expectedResult: 'A venda de R$ 28,00 aparece nas entradas, e o estoque dos produtos vendidos é atualizado.',
    },
    keywords: ['produto', 'serviço', 'carrinho', 'cobrar', 'pagamento'],
    steps: [
      {
        title: 'Abra a Frente de Caixa',
        description: 'Entre em Caixa e confirme que existe uma sessão aberta antes de começar.',
        location: 'Menu Caixa · indicador Caixa aberto',
      },
      {
        title: 'Encontre o item',
        description: 'Digite o nome do produto ou serviço, ajuste a quantidade e toque no resultado para adicioná-lo.',
        location: 'Campo Buscar produto',
      },
      {
        title: 'Confira o carrinho',
        description: 'Revise os itens, quantidades e o total. Use a lixeira ao lado de um item caso precise removê-lo.',
        location: 'Lista de itens · Total a Pagar',
      },
      {
        title: 'Escolha como o cliente pagou',
        description: 'Selecione dinheiro, Pix, cartão ou fiado. No fiado, também será necessário escolher o cliente.',
        location: 'Opções de forma de pagamento',
      },
      {
        title: 'Conclua a cobrança',
        description: 'Toque em Cobrar e aguarde a confirmação. Pagamentos recebidos aparecem imediatamente nas movimentações.',
        location: 'Parte inferior da tela · Cobrar',
      },
    ],
  },
  {
    id: 'venda-avulsa',
    kind: 'tutorial',
    title: 'Como fazer uma venda avulsa',
    summary: 'Registre rapidamente um item que não está no catálogo.',
    example: {
      title: 'Cesta personalizada de R$ 85,00',
      situation: 'A loja montou uma cesta sob encomenda que ainda não existe como produto no catálogo.',
      expectedResult: 'A cobrança de R$ 85,00 é registrada normalmente, sem criar um produto permanente.',
    },
    keywords: ['sem cadastro', 'rápida', 'valor', 'item avulso'],
    steps: [
      {
        title: 'Abra o caixa',
        description: 'A venda avulsa só fica disponível quando existe uma sessão de caixa aberta.',
        location: 'Menu Caixa',
      },
      {
        title: 'Digite o valor',
        description: 'Na área Venda avulsa, informe o preço total do item que não está cadastrado.',
        location: 'Frente de Caixa · Venda avulsa',
      },
      {
        title: 'Adicione ao carrinho',
        description: 'Toque em Adicionar. O valor entrará no carrinho como um item avulso e poderá ser removido antes da cobrança.',
        location: 'Venda avulsa · Adicionar',
      },
      {
        title: 'Receba o pagamento',
        description: 'Escolha a forma de pagamento e toque em Cobrar para concluir normalmente.',
        location: 'Opções de pagamento · Cobrar',
      },
    ],
  },
  {
    id: 'vender-fiado',
    kind: 'tutorial',
    title: 'Como vender fiado e registrar o pagamento',
    summary: 'Vincule a cobrança ao cliente e dê baixa quando receber.',
    example: {
      title: 'Compra fiada da cliente Marta',
      situation: 'Marta levou R$ 72,00 em produtos hoje e combinou pagar o valor completo por Pix na sexta-feira.',
      expectedResult: 'Os R$ 72,00 ficam em A Receber e só entram no saldo quando a baixa do pagamento for confirmada.',
    },
    keywords: ['cliente', 'dívida', 'recebimento', 'baixa', 'a receber'],
    steps: [
      {
        title: 'Monte a venda',
        description: 'Na Frente de Caixa, adicione os produtos, serviços ou um valor avulso ao carrinho.',
        location: 'Menu Caixa · carrinho',
      },
      {
        title: 'Escolha Fiado',
        description: 'Selecione Fiado nas formas de pagamento. A tela pedirá quem é o cliente responsável.',
        location: 'Formas de pagamento · Fiado',
      },
      {
        title: 'Escolha ou cadastre o cliente',
        description: 'Pesquise um cliente já cadastrado ou use Cadastrar novo cliente. Confirme a pessoa antes de cobrar.',
        location: 'Área Quem é o cliente?',
      },
      {
        title: 'Registre a dívida',
        description: 'Toque em Cobrar. A venda aparecerá em Financeiro, na aba A Receber (Fiado), sem aumentar o saldo ainda.',
        location: 'Cobrar · depois Financeiro > A Receber',
      },
      {
        title: 'Dê baixa ao receber',
        description: 'Abra a conta do cliente, escolha a forma de recebimento e confirme a baixa. Só então o valor entra no caixa.',
        location: 'Financeiro · A Receber (Fiado) · Confirmar baixa',
      },
    ],
  },
  {
    id: 'lancar-entrada-despesa',
    kind: 'tutorial',
    title: 'Como lançar uma entrada ou despesa',
    summary: 'Registre dinheiro recebido ou gasto fora de uma venda.',
    example: {
      title: 'Taxa recebida e compra emergencial',
      situation: 'O negócio recebeu R$ 20,00 por uma entrega e gastou R$ 35,00 comprando embalagens de última hora.',
      expectedResult: 'A entrada e a despesa aparecem separadas, deixando o efeito líquido de menos R$ 15,00 no resultado.',
    },
    keywords: ['lançamento manual', 'receita', 'saída', 'gasto', 'nova entrada'],
    steps: [
      {
        title: 'Abra o lançamento rápido',
        description: 'No Painel Inicial, use o atalho de entrada ou despesa para abrir o formulário correspondente.',
        location: 'Painel Inicial · cartões Entradas ou Despesas',
      },
      {
        title: 'Informe o valor',
        description: 'Digite o valor recebido ou gasto usando reais e centavos.',
        location: 'Janela Nova Entrada ou Nova Despesa · Valor',
      },
      {
        title: 'Descreva o movimento',
        description: 'Use um nome que você reconheça depois, como “Gorjeta” ou “Conta de luz”.',
        location: 'Campo Descrição',
      },
      {
        title: 'Classifique e salve',
        description: 'Escolha o tipo da entrada ou a categoria da despesa. Se deixar sem classificação, ela ficará pendente para revisão.',
        location: 'Final do formulário · botão de salvar',
      },
    ],
  },
  {
    id: 'cadastrar-catalogo',
    kind: 'tutorial',
    title: 'Como cadastrar produtos, serviços e categorias',
    summary: 'Monte um catálogo organizado para agilizar as vendas.',
    example: {
      title: 'Cadastro de Bolo no Pote',
      situation: 'A confeitaria vende Bolo no Pote por R$ 12,00, começa com 20 unidades e quer organizá-lo na categoria Doces.',
      expectedResult: 'O item fica disponível na busca do caixa, com preço, categoria e quantidade inicial prontos para uso.',
    },
    keywords: ['catálogo', 'novo item', 'preço', 'categoria', 'serviço'],
    steps: [
      {
        title: 'Abra o Catálogo',
        description: 'Entre em Catálogo pelo menu. Ali ficam produtos e serviços do negócio.',
        location: 'Menu Catálogo',
      },
      {
        title: 'Crie categorias, se quiser',
        description: 'Abra Gerenciar categorias, digite um nome e adicione. Categorias ajudam a filtrar e encontrar itens.',
        location: 'Catálogo · Gerenciar categorias',
      },
      {
        title: 'Adicione um item',
        description: 'Toque em Novo item e escolha se ele é produto ou serviço.',
        location: 'Topo do Catálogo · Novo item',
      },
      {
        title: 'Preencha os dados',
        description: 'Informe nome, preço de venda e categoria. Para produtos, preencha também as informações de estoque; para serviços, você pode indicar a duração.',
        location: 'Janela Novo item',
      },
      {
        title: 'Salve o cadastro',
        description: 'Toque em Salvar. O item passará a aparecer na busca da Frente de Caixa.',
        location: 'Janela Novo item · Salvar',
      },
    ],
  },
  {
    id: 'controlar-estoque',
    kind: 'tutorial',
    title: 'Como controlar estoque',
    summary: 'Acompanhe quantidades e receba avisos de estoque baixo.',
    example: {
      title: 'Reposição de garrafas de água',
      situation: 'Há 12 garrafas em estoque e o aviso mínimo foi definido em 4 unidades. Depois de vender 9, restarão 3.',
      expectedResult: 'O produto passa a aparecer como Estoque baixo, indicando que já é hora de fazer a reposição.',
    },
    keywords: ['quantidade', 'mínimo', 'produto', 'baixo', 'inventário'],
    steps: [
      {
        title: 'Abra ou edite um produto',
        description: 'No Catálogo, crie um novo item do tipo produto ou toque para editar um produto existente.',
        location: 'Catálogo · produto',
      },
      {
        title: 'Informe a quantidade atual',
        description: 'Preencha quantas unidades existem agora. Serviços não usam controle de quantidade.',
        location: 'Formulário do produto · Estoque atual',
      },
      {
        title: 'Defina o estoque mínimo',
        description: 'Escolha a quantidade que deve gerar um aviso de reposição antes de o produto acabar.',
        location: 'Formulário do produto · Estoque mínimo',
      },
      {
        title: 'Salve e acompanhe',
        description: 'As vendas reduzem o estoque automaticamente. Itens no limite aparecem destacados como Estoque baixo no Catálogo.',
        location: 'Catálogo · filtro Estoque baixo',
      },
    ],
  },
  {
    id: 'contas-baixa',
    kind: 'tutorial',
    title: 'Como cadastrar e dar baixa em contas',
    summary: 'Controle vencimentos e confirme pagamentos ou recebimentos.',
    example: {
      title: 'Pagamento do aluguel',
      situation: 'O aluguel de R$ 900,00 vence no dia 10 e foi pago por Pix no próprio vencimento.',
      expectedResult: 'A conta deixa de aparecer como pendente e a saída de R$ 900,00 fica registrada na data do pagamento.',
    },
    keywords: ['financeiro', 'pagar', 'receber', 'vencimento', 'despesa fixa'],
    steps: [
      {
        title: 'Abra o Financeiro',
        description: 'Use A Pagar para despesas do negócio ou A Receber (Fiado) para cobranças de clientes.',
        location: 'Menu Finanças · abas A Pagar e A Receber',
      },
      {
        title: 'Cadastre uma despesa',
        description: 'Na aba A Pagar, toque em Nova Despesa e informe descrição, valor e vencimento.',
        location: 'Financeiro · A Pagar · Nova Despesa',
      },
      {
        title: 'Encontre a conta',
        description: 'Contas vencidas e próximas do vencimento aparecem destacadas. As vendas fiadas ficam agrupadas pelo cliente.',
        location: 'Lista de contas do Financeiro',
      },
      {
        title: 'Confirme a baixa',
        description: 'Use a ação de pagamento ou recebimento, escolha a forma usada e toque em Confirmar baixa.',
        location: 'Conta selecionada · Confirmar baixa',
      },
    ],
  },
  {
    id: 'pesquisar-movimentacoes',
    kind: 'tutorial',
    title: 'Como pesquisar movimentações',
    summary: 'Encontre registros por nome, período e pagamento.',
    example: {
      title: 'Conferência das vendas no Pix',
      situation: 'Você precisa localizar todas as vendas recebidas por Pix entre os dias 1 e 7 para comparar com o extrato bancário.',
      expectedResult: 'A lista mostra somente as movimentações em Pix dentro da semana escolhida, das mais recentes para as mais antigas.',
    },
    keywords: ['filtro', 'histórico', 'data', 'pagamento', 'entrada', 'saída'],
    steps: [
      {
        title: 'Abra a lista desejada',
        description: 'Entre em Entradas, Despesas ou Movimentações para escolher o tipo de histórico que deseja consultar.',
        location: 'Menu principal · Entradas, Despesas ou Movimentações',
      },
      {
        title: 'Pesquise por texto',
        description: 'Digite parte do nome ou da descrição. A lista será atualizada com os registros correspondentes.',
        location: 'Área Pesquisar · nome ou descrição',
      },
      {
        title: 'Limite o período',
        description: 'Use as datas inicial e final para mostrar apenas movimentações dentro desse intervalo.',
        location: 'Filtros · Data inicial e Data final',
      },
      {
        title: 'Filtre o pagamento',
        description: 'Se necessário, selecione dinheiro, Pix, cartão ou fiado para reduzir ainda mais os resultados.',
        location: 'Filtro Pagamento',
      },
    ],
  },
  {
    id: 'fechar-caixa',
    kind: 'tutorial',
    title: 'Como fechar o caixa e resolver pendências',
    summary: 'Revise o dia, confira o dinheiro e conclua a sessão.',
    example: {
      title: 'Conferência com diferença de R$ 5,00',
      situation: 'O caixa começou com R$ 100,00, recebeu R$ 250,00 em dinheiro e pagou R$ 40,00. O esperado é R$ 310,00, mas foram contados R$ 305,00.',
      expectedResult: 'O fechamento registra a diferença de menos R$ 5,00 para que ela possa ser conferida no histórico.',
    },
    keywords: ['conferência', 'dinheiro contado', 'diferença', 'pendente', 'encerrar'],
    steps: [
      {
        title: 'Comece o fechamento',
        description: 'Na Frente de Caixa, toque em Fechar Caixa para abrir a revisão da sessão atual.',
        location: 'Topo da Frente de Caixa · Fechar Caixa',
      },
      {
        title: 'Revise as movimentações',
        description: 'Confira entradas e saídas do dia. Use o Mini caixa caso tenha esquecido algum lançamento.',
        location: 'Fechamento · Movimentações de hoje e Mini caixa',
      },
      {
        title: 'Resolva as pendências',
        description: 'Identifique os lançamentos destacados. Se continuar com pendências, o aplicativo avisará antes da confirmação final.',
        location: 'Fechamento · Pendências do caixa',
      },
      {
        title: 'Conte o dinheiro físico',
        description: 'Informe o valor realmente encontrado no caixa. A tela mostrará qualquer diferença em relação ao valor esperado.',
        location: 'Conferência final · Dinheiro contado',
      },
      {
        title: 'Confirme o fechamento',
        description: 'Revise o resumo e toque em Confirmar fechamento. Se perceber um erro antes de abrir outro caixa, acesse Fechamentos e reabra somente o fechamento mais recente para corrigir e fechar novamente.',
        location: 'Conferência final · Confirmar fechamento',
      },
    ],
  },
  {
    id: 'gerar-relatorio',
    kind: 'tutorial',
    title: 'Como gerar e salvar um relatório em PDF',
    summary: 'Escolha um período e guarde uma cópia do relatório.',
    example: {
      title: 'Relatório mensal de agosto',
      situation: 'No fim do mês, você quer enviar ao contador o resumo de entradas, despesas e produtos vendidos em agosto.',
      expectedResult: 'Um PDF do relatório mensal é salvo no aparelho e fica pronto para arquivar ou compartilhar.',
    },
    keywords: ['diário', 'semanal', 'mensal', 'imprimir', 'download', 'pdf'],
    steps: [
      {
        title: 'Abra Relatórios',
        description: 'Entre em Relatórios pelo menu para ver as opções diária, semanal e mensal.',
        location: 'Menu Relatórios',
      },
      {
        title: 'Escolha o tipo e o período',
        description: 'Selecione uma data, semana ou mês no cartão do relatório que deseja consultar.',
        location: 'Cartão Diário, Semanal ou Mensal · Período do relatório',
      },
      {
        title: 'Abra o relatório completo',
        description: 'Toque em Abrir relatório para visualizar valores, produtos e comparações disponíveis.',
        location: 'Cartão do período · Abrir relatório',
      },
      {
        title: 'Abra a impressão',
        description: 'No fim do relatório, toque em Imprimir ou salvar em PDF.',
        location: 'Final do relatório · Imprimir ou salvar em PDF',
      },
      {
        title: 'Salve o arquivo',
        description: 'Na janela de impressão do navegador, escolha Salvar como PDF e indique onde guardar o documento.',
        location: 'Janela de impressão do navegador',
      },
    ],
  },
  {
    id: 'configurar-negocio',
    kind: 'tutorial',
    title: 'Como configurar meta, aparência e negócio',
    summary: 'Personalize os dados e a visão inicial do CaixaFácil.',
    example: {
      title: 'Configuração da Lanchonete da Ana',
      situation: 'Ana quer exibir o nome da lanchonete, acompanhar uma meta diária de R$ 600,00 e usar o modo escuro à noite.',
      expectedResult: 'O cabeçalho, a meta do painel e a aparência passam a refletir as preferências escolhidas.',
    },
    keywords: ['engrenagem', 'nome', 'ramo', 'meta diária', 'modo escuro', 'tema'],
    steps: [
      {
        title: 'Abra Configurações',
        description: 'Toque na engrenagem do cabeçalho para acessar as preferências da conta e do negócio.',
        location: 'Cabeçalho · engrenagem',
      },
      {
        title: 'Atualize o negócio',
        description: 'Na seção Negócio, altere nome, ramo de atuação e o que você oferece. As mudanças são salvas ao concluir cada campo.',
        location: 'Configurações · Negócio',
      },
      {
        title: 'Defina sua meta',
        description: 'Informe a Meta Diária de Vendas e escolha se o Painel Inicial deve mostrar o dia ou os últimos sete dias.',
        location: 'Configurações · Meta Diária e Painel Inicial',
      },
      {
        title: 'Ajuste a aparência',
        description: 'Ative ou desative o modo escuro na seção Aparência. O botão de sol ou lua no cabeçalho também troca o tema rapidamente.',
        location: 'Configurações · Aparência',
      },
    ],
  },
  {
    id: 'backup-dados',
    kind: 'tutorial',
    title: 'Como exportar e restaurar um backup',
    summary: 'Guarde uma cópia e restaure-a quando necessário.',
    example: {
      title: 'Troca para um aparelho novo',
      situation: 'Antes de trocar de aparelho, você exporta os dados atuais e guarda o arquivo em um local seguro.',
      expectedResult: 'Ao importar o arquivo no novo aparelho, o catálogo, as vendas e as configurações voltam para o estado salvo.',
    },
    keywords: ['importar', 'exportar', 'json', 'arquivo', 'restauração'],
    steps: [
      {
        title: 'Abra a área de Backup',
        description: 'Entre em Configurações e desça até a seção Backup.',
        location: 'Configurações · Backup',
      },
      {
        title: 'Exporte uma cópia',
        description: 'Toque em Exportar Dados e guarde o arquivo baixado em um local seguro.',
        location: 'Backup · Exportar Dados',
      },
      {
        title: 'Escolha um arquivo para restaurar',
        description: 'Quando precisar recuperar uma cópia, toque em Importar Dados e selecione o arquivo de backup.',
        location: 'Backup · Importar Dados',
      },
      {
        title: 'Confira antes de substituir',
        description: 'Leia a confirmação com atenção. A importação substitui os dados atuais, por isso mantenha uma cópia recente antes de continuar.',
        location: 'Janela Confirmar importação · Substituir Dados',
      },
    ],
  },
];

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function searchableContent(topic: HelpTopic): string {
  const details = topic.kind === 'explanation'
    ? topic.content
    : [
        topic.example.title,
        topic.example.situation,
        topic.example.expectedResult,
        ...topic.steps.map((step) => `${step.title} ${step.description} ${step.location}`),
      ].join(' ');

  return [topic.title, topic.summary, details, ...topic.keywords].join(' ');
}

export function filterHelpTopics(query: string, topics: HelpTopic[] = helpTopics): HelpTopic[] {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return topics;

  return topics.filter((topic) => {
    const content = normalizeSearchText(searchableContent(topic));
    return terms.every((term) => content.includes(term));
  });
}
