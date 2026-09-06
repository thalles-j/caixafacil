# Relatório de reprodução — Central de Ajuda do CaixaFácil

## 1. Objetivo

Este documento descreve como reconstruir a Central de Ajuda do CaixaFácil em
outro projeto React. A funcionalidade mantém o usuário na tela atual e oferece:

- um botão `?` no cabeçalho;
- busca por título, resumo, palavras-chave e conteúdo;
- respostas explicativas curtas;
- tutoriais práticos passo a passo;
- exemplos reais com situação e resultado esperado;
- funcionamento responsivo, em modo claro e escuro;
- navegação acessível por teclado.

O código de referência está nestes arquivos:

- `frontend/src/components/HelpCenter.tsx` — interface e comportamento;
- `frontend/src/lib/helpContent.ts` — textos, exemplos, passos e busca;
- `frontend/src/components/Layout.tsx` — integração do botão no cabeçalho;
- `frontend/src/components/HelpCenter.test.tsx` — testes do painel;
- `frontend/src/lib/helpContent.test.ts` — testes do conteúdo e da busca.

## 2. Resultado visual e posição

O botão de ajuda deve ficar no grupo de ações do cabeçalho, nesta ordem:

```text
Tema (sol/lua) → Ajuda (?) → Configurações (engrenagem) → Notificações
```

O botão segue as mesmas dimensões dos outros controles do cabeçalho: círculo de
36 × 36 pixels, ícone de 20 pixels e estados de foco e `hover` consistentes.

Ao clicar, abre-se um painel modal. Em telas pequenas, ele ocupa a tela inteira.
Em telas maiores, aparece centralizado, com largura máxima e cantos arredondados.
O usuário nunca é levado para outra rota.

## 3. Stack e dependências

Implementação original:

- React 19;
- TypeScript;
- Tailwind CSS 4;
- `@phosphor-icons/react` para os ícones;
- Vitest;
- Testing Library.

Ícones utilizados:

- `Question`;
- `X`;
- `ArrowLeft`;
- `MagnifyingGlass`;
- `BookOpenText`;
- `ListNumbers`;
- `CaretRight`;
- `CursorClick`;
- `Lightbulb`;
- `CheckCircle`.

## 4. Arquitetura

### 4.1 Separação de responsabilidades

O conteúdo não deve ficar misturado ao JSX. Separe a implementação em duas
partes:

1. `helpContent.ts`: tipos, tópicos, exemplos e função de busca.
2. `HelpCenter.tsx`: botão, modal, listagem, explicações e tutorial.

Essa separação permite adicionar ou alterar tutoriais sem modificar a lógica da
interface.

### 4.2 Modelo de tópico explicativo

```ts
type ExplanatoryHelpTopic = {
  id: string;
  kind: 'explanation';
  title: string;
  summary: string;
  content: string;
  keywords: string[];
};
```

Regras de conteúdo:

- título em formato de dúvida comum;
- resumo com uma frase;
- resposta final com duas a quatro frases;
- linguagem cotidiana;
- palavras-chave com sinônimos que o usuário pode pesquisar.

### 4.3 Modelo de tutorial prático

```ts
type TutorialStep = {
  title: string;
  description: string;
  location: string;
};

type TutorialHelpTopic = {
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
```

Cada tutorial precisa conter:

- um caso real, com nomes e valores quando fizer sentido;
- o resultado esperado ao final;
- entre quatro e cinco passos;
- título curto para cada passo;
- descrição do que fazer;
- localização exata do controle na aplicação.

Exemplo resumido:

```ts
{
  id: 'registrar-venda',
  kind: 'tutorial',
  title: 'Como registrar uma venda',
  summary: 'Adicione itens, escolha o pagamento e faça a cobrança.',
  example: {
    title: 'Dois cafés e uma fatia de bolo',
    situation: 'O cliente comprou 2 cafés de R$ 8,00 e 1 bolo de R$ 12,00.',
    expectedResult: 'A venda de R$ 28,00 aparece nas entradas.',
  },
  keywords: ['produto', 'carrinho', 'cobrar', 'pagamento'],
  steps: [
    {
      title: 'Encontre o item',
      description: 'Pesquise o produto e ajuste a quantidade.',
      location: 'Frente de Caixa · campo Buscar produto',
    },
  ],
}
```

## 5. Conteúdo criado para o CaixaFácil

### 5.1 Tópicos explicativos

1. O que aparece no Painel Inicial?
2. Venda, entrada e despesa: qual é a diferença?
3. Como funciona uma sessão de caixa?
4. O que é uma pendência de identificação?
5. Como funciona uma venda fiada?
6. Contas a pagar e a receber.
7. Como são calculados saldo e lucro estimado?
8. Para que servem os relatórios?
9. Como funcionam backup e restauração?

### 5.2 Tutoriais práticos

1. Como abrir o caixa.
2. Como registrar uma venda.
3. Como fazer uma venda avulsa.
4. Como vender fiado e registrar o pagamento.
5. Como lançar uma entrada ou despesa.
6. Como cadastrar produtos, serviços e categorias.
7. Como controlar estoque.
8. Como cadastrar e dar baixa em contas.
9. Como pesquisar movimentações.
10. Como fechar o caixa e resolver pendências.
11. Como gerar e salvar um relatório em PDF.
12. Como configurar meta, aparência e negócio.
13. Como exportar e restaurar um backup.

### 5.3 Exemplos práticos utilizados

- abertura de caixa com R$ 150,00;
- venda de dois cafés e uma fatia de bolo por R$ 28,00 no Pix;
- venda avulsa de uma cesta personalizada por R$ 85,00;
- compra fiada de R$ 72,00 vinculada à cliente Marta;
- entrada de R$ 20,00 e despesa emergencial de R$ 35,00;
- cadastro de Bolo no Pote por R$ 12,00, com 20 unidades;
- aviso de estoque baixo após a venda de garrafas de água;
- pagamento de aluguel de R$ 900,00 por Pix;
- conferência das vendas em Pix entre os dias 1 e 7;
- fechamento com diferença negativa de R$ 5,00;
- geração do relatório mensal de agosto;
- configuração da Lanchonete da Ana com meta de R$ 600,00;
- exportação e restauração de dados durante a troca de aparelho.

## 6. Funcionamento da busca

A busca deve considerar:

- título;
- resumo;
- resposta explicativa;
- título e descrição do exemplo;
- resultado esperado;
- títulos, descrições e localizações dos passos;
- palavras-chave.

Normalize o texto antes de comparar:

```ts
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
```

Assim, `relatorio`, `RELATÓRIO` e `Relatório` produzem o mesmo resultado. Quando
a consulta tiver várias palavras, todas devem existir no tópico, mesmo que
apareçam em campos diferentes.

## 7. Estados do componente

O componente precisa manter estes estados:

```ts
const [open, setOpen] = useState(false);
const [query, setQuery] = useState('');
const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null);
const [stepIndex, setStepIndex] = useState(0);
```

Fluxos principais:

- abrir: mostrar a página inicial e focar a busca;
- pesquisar: filtrar as duas categorias ao digitar;
- selecionar explicação: abrir a resposta no mesmo painel;
- selecionar tutorial: iniciar no passo 1;
- avançar ou voltar: atualizar `stepIndex`;
- concluir: oferecer “Voltar à busca” e “Fechar ajuda”;
- fechar: limpar busca e seleção, retornar o foco ao botão `?`.

## 8. Estrutura da interface

### 8.1 Página inicial

Ordem dos elementos:

1. cabeçalho com ícone, título e botão de fechar;
2. campo de pesquisa destacado;
3. quantidade de resultados;
4. seção “Entenda o CaixaFácil”;
5. seção “Aprenda fazendo”.

Cada resultado deve ser um botão completo, não somente um texto clicável. Use
um ícone diferente para explicações e tutoriais.

### 8.2 Explicação

Exiba apenas:

- ícone;
- título;
- texto curto;
- botão “Voltar à busca”.

### 8.3 Tutorial

Exiba um passo por vez:

- “Passo X de Y”;
- porcentagem e barra de progresso;
- título e descrição do passo;
- cartão “Exemplo prático”;
- situação concreta;
- resultado esperado;
- bloco “Onde encontrar”;
- botões “Anterior” e “Próximo”.

No último passo, troque “Próximo” por “Voltar à busca” e mostre a ação “Fechar
ajuda”.

### 8.4 Espaço para imagens futuras

O bloco “Onde encontrar” usa borda tracejada e um ícone de clique. Ele funciona
como orientação textual agora e pode receber uma captura de tela no futuro.
Substitua apenas o conteúdo interno desse bloco, preservando o texto alternativo
e a localização escrita.

## 9. Integração no cabeçalho

Importe o componente:

```tsx
import HelpCenter from './HelpCenter';
```

Insira-o imediatamente depois do botão de tema e antes do botão de
configurações:

```tsx
<button aria-label="Ativar modo escuro">
  <Moon size={20} />
</button>

<HelpCenter />

<button aria-label="Configurações">
  <GearSix size={20} />
</button>
```

## 10. Renderização do modal

Use `createPortal` para renderizar o painel diretamente em `document.body`:

```tsx
{open && createPortal(<div role="dialog">...</div>, document.body)}
```

Isso evita que propriedades visuais do cabeçalho, como `backdrop-filter`,
limitem um elemento `position: fixed`. Sem o portal, o painel pode ocupar apenas
a área do cabeçalho em alguns navegadores.

## 11. Acessibilidade obrigatória

O botão de ajuda deve possuir:

```tsx
aria-label="Ajuda"
aria-haspopup="dialog"
aria-expanded={open}
```

O painel deve possuir:

```tsx
role="dialog"
aria-modal="true"
aria-labelledby={titleId}
```

Também implemente:

- foco automático no campo de busca;
- fechamento pela tecla `Escape`;
- retenção de `Tab` dentro do painel;
- retorno do foco ao botão de ajuda ao fechar;
- títulos focáveis programaticamente com `tabIndex={-1}`;
- `aria-live="polite"` na contagem de resultados;
- `role="progressbar"` com valores mínimo, máximo e atual;
- rótulos textuais nos botões que possuem somente ícone;
- contraste adequado em tema claro e escuro.

Enquanto o modal estiver aberto, defina `document.body.style.overflow = 'hidden'`
e restaure o valor anterior ao fechar.

## 12. Responsividade

### Celular

- painel em tela cheia;
- cabeçalho e rodapé fixos dentro do painel;
- conteúdo central com rolagem;
- botões de navegação ocupando a largura disponível;
- textos sem largura fixa.

### Tablet e desktop

- painel centralizado;
- largura máxima aproximada de 576 pixels;
- altura limitada à janela;
- borda, sombra e cantos arredondados;
- clique fora fecha o painel.

## 13. Identidade visual

Reutilize os tokens do aplicativo:

- `paper` e `paper-raised` para fundos;
- `ink` e `ink-soft` para textos;
- `line` para bordas;
- `ledger` para ações principais;
- `brass` para tutoriais e exemplos;
- `stamp` apenas para alertas ou erros.

O cartão de exemplo usa fundo `brass/10`, enquanto explicações usam destaque
`ledger/10`. Isso diferencia o tipo de conteúdo sem criar outro sistema visual.

## 14. Testes necessários

### 14.1 Conteúdo e busca

Verifique:

- quantidade esperada de explicações e tutoriais;
- presença de exemplo completo em todo tutorial;
- pesquisa sem diferença de maiúsculas e acentos;
- pesquisa pelo conteúdo dos passos;
- pesquisa pelo conteúdo dos exemplos;
- consulta com várias palavras.

### 14.2 Componente

Verifique:

- abertura do modal;
- foco automático na busca;
- fechamento com `Escape`;
- retorno de foco ao botão `?`;
- filtro de tópicos;
- abertura de explicação;
- abertura de tutorial;
- exibição do exemplo prático;
- atualização da barra de progresso;
- navegação para o próximo passo;
- retorno à busca.

Após cada teste, execute `cleanup()` para impedir que componentes de um caso
permaneçam no DOM durante o próximo.

## 15. Comandos de validação

```bash
npm test
npm run build
npm run lint
```

Na implementação original, o resultado esperado foi:

- 9 arquivos de teste aprovados;
- 59 testes aprovados;
- build de produção concluído;
- lint concluído sem erros.

## 16. Roteiro completo para reproduzir

1. Liste todas as funcionalidades reais da aplicação.
2. Separe dúvidas conceituais de ações práticas.
3. Escreva respostas explicativas curtas e definitivas.
4. Transforme cada ação prática em quatro ou cinco passos.
5. Crie um cenário real para cada tutorial.
6. Informe o resultado esperado de cada cenário.
7. Defina a localização exata de cada ação na interface.
8. Crie os tipos e o array de conteúdo em um arquivo separado.
9. Implemente a normalização e o filtro de busca.
10. Construa o botão e o painel modal.
11. Implemente as três visualizações: início, explicação e tutorial.
12. Adicione progresso e navegação entre passos.
13. Renderize o modal com portal no `body`.
14. Implemente foco automático, `Escape` e retenção de foco.
15. Integre o botão na posição correta do cabeçalho.
16. Escreva testes de busca e interação.
17. Valide em celular, desktop, modo claro e modo escuro.
18. Execute testes, build e lint.

## 17. Checklist de aceite

- [ ] O botão `?` está entre tema e configurações.
- [ ] O painel abre sem mudar de rota.
- [ ] A busca recebe foco ao abrir.
- [ ] A busca encontra título, conteúdo, passos e exemplos.
- [ ] Explicações possuem texto final, sem placeholders.
- [ ] Todo tutorial tem exemplo real e resultado esperado.
- [ ] Somente um passo aparece por vez.
- [ ] O progresso mostra passo atual e porcentagem.
- [ ] “Anterior” fica desativado no primeiro passo.
- [ ] O último passo oferece voltar à busca e fechar.
- [ ] `Escape` fecha o painel.
- [ ] O foco permanece dentro do modal.
- [ ] O foco volta ao botão `?` após fechar.
- [ ] O painel funciona em celular e desktop.
- [ ] O painel funciona em tema claro e escuro.
- [ ] Testes, build e lint são aprovados.

## 18. Manutenção futura

Para adicionar um tópico, inclua um novo objeto em `helpTopics`. A interface e a
busca não precisam ser alteradas.

Ao mudar um fluxo do aplicativo:

1. atualize a descrição dos passos;
2. atualize `location` com o novo caminho visual;
3. revise o exemplo e o resultado esperado;
4. atualize palavras-chave;
5. execute os testes.

Evite criar tutoriais genéricos. Um bom exemplo informa quem está realizando a
ação, quais valores ou itens estão envolvidos e o que deve aparecer no sistema
depois da conclusão.
