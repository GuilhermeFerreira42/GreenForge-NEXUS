# 📋 DOSSIÊ TÉCNICO DE ARQUITETURA DE INTERFACE
## Benchmark de Plataformas de Referência para Sistemas Multiagente
### *Formato: Markdown Estrito — Otimizado para Ingestão RAG/NotebookLM*

---

## PLATAFORMA 1: VERDENT AI (Referência Primária)

### 1.1 Topologia e Organização Espacial

Verdent AI é uma suíte de coding agêntico com agentes paralelos, Plan Mode, BYOK e Eco Mode — incluindo AI code review e orquestração de agentes para VS Code, JetBrains, Mac e Windows. Sua abordagem é fundamentalmente diferente das ferramentas tradicionais de chat+código.

**Paradigma Espacial: Task-First, não Chat-First.**

A maioria das ferramentas de IA de código começa com uma conversa. O Verdent começa com tarefas. Essa diferença filosófica define toda a topologia da interface. Quando um repositório é aberto, o usuário cria múltiplas tarefas diretamente — uma para repensar navegação e estrutura SEO, outra para explorar melhorias de layout na homepage, e uma terceira para revisar a organização de conteúdo existente. Cada tarefa imediatamente instancia seu próprio agente e workspace.

**Layout Físico — Verdent Deck:**

O Verdent Deck é um dashboard visual que permite orquestrar múltiplos projetos e agentes simultaneamente, com views de tarefas, diffs e documentação.

A interface se organiza em camadas hierárquicas:

| Zona | Conteúdo | Comportamento |
|---|---|---|
| Sidebar Esquerda | Lista de tarefas/agentes ativos | Navegação entre workspaces paralelos |
| Painel Central | Conversa da tarefa ativa + resultados do agente | Scroll linear, agrupado por ação |
| Painel Direito | Diff view, editor de arquivo, logs, DiffLens | Ativado contextualmente por ícones laterais |

O Verdent vem com tanto uma view de editor de arquivos quanto um terminal. Os ícones no lado direito também servem para Diff view e logs.

**Proporção Esquerda-Direita (Left-to-Right Flow):**

Finalmente, um layout da esquerda para a direita que faz sentido à medida que você se aprofunda nos detalhes. A hierarquia é: **Visão Geral (esquerda) → Contexto Conversacional (centro) → Detalhe Técnico (direita).**

### 1.2 Revelação Progressiva e Estados Mentais

A gestão de densidade informacional é o diferencial central do Verdent. O princípio operacional é:

Os detalhes não dominam mais, mas estão a apenas um clique de distância.

**Mecanismo de Agrupamento de Ações:**

O fluxo inteiro de conversa durante a execução de tarefas foi refinado. Cada ação agora é agrupada e exibida de forma mais clara, permitindo ver cada passo do processo e resultados do agente de relance. As tarefas se tornam mais fáceis de acompanhar, mais rápidas de escanear e mais transparentes.

**Plan Mode — Estrutura Visível do Raciocínio:**

O Plan Mode agora usa um layout mais estruturado e legível que torna cada plano mais fácil de entender. Objetivos, raciocínio e passos de execução são organizados de forma clara, ajudando a revisar e ajustar planos com mais confiança antes de executá-los.

**Pipeline de Agentes Especializados (Estados Mentais Visíveis):**

Quando o usuário submete uma requisição, o Verdent não a envia para um único modelo de IA. Em vez disso, roteia a requisição para o agente de IA mais apropriado para cada fase: o Planner Agent decompõe a requisição em passos lógicos, identifica dependências e faz perguntas clarificadoras; o Coder Agent escreve a implementação baseada no plano aprovado; o Verifier Agent verifica se a lógica do código é sólida e corresponde ao plano. Isso é mais inteligente porque cada agente é especializado para sua tarefa específica.

**DiffLens — Insight Contextual:**

O DiffLens analisa mudanças de código e seus efeitos instantaneamente, com execução transparente e sem caixas-pretas. A opção DiffLens adiciona mais informação, na forma de "por que fizemos o que fizemos" em oposição a "o que é isso".

### 1.3 Fluxo Human-in-the-Loop (HITL)

O HITL é implementado em três fases claramente delimitadas:

Fase 1 – Planejamento: O usuário descreve o que quer. O Verdent faz 5-7 perguntas clarificadoras. O usuário as responde. O Verdent cria um plano detalhado com diagramas de arquitetura, estrutura de código e passos de implementação. Fase 2 – Revisão: O usuário revisa o plano. Pode solicitar mudanças, adicionar mais detalhes ou ajustar o escopo.

**Mecanismo de Diff para Revisão:**

O usuário utiliza Code Review e DiffLens integrados para revisar o código gerado, ver o que mudou e por quê, e identificar problemas potenciais antecipadamente.

**Isolamento via Workspaces para Segurança:**

O Verdent resolve isso com Workspaces. Cada workspace é um ambiente de código isolado e independente com seu próprio histórico de mudanças, log de commits e branches. Isso não é apenas sobre separação — é sobre tornar mudanças concorrentes de código gerenciáveis.

O usuário define as tarefas, os agentes escrevem e verificam código, e o usuário revisa diffs antes que qualquer coisa seja mergeada.

### 1.4 Microinterações e Indicadores de Densidade

| Microinteração | Implementação |
|---|---|
| Notificações de Conclusão | Notificações de conclusão de tarefa em tempo real — defina uma tarefa, mantenha o foco, e o sistema notifica quando terminar. |
| Presets de Modelo | A seleção de modelo é facilitada com Model Presets. Troque rapidamente entre configurações predefinidas para diferentes cenários. Cada preset mostra claramente uso de créditos e detalhes. |
| Hierarquia Visual Refinada | Tanto o modo Light quanto Dark foram refinados, com layout mais compacto, interface mais clara e hierarquia visual melhorada. |
| Sintaxe no Plano | Syntax highlighting foi adicionado à janela de preview do Plan. |
| Navegação Rápida | Suporte ao atalho cmd + number para trocar rapidamente entre workspaces. |

---

## PLATAFORMA 2: BOLT.NEW / BOLT.DIY

### 2.1 Topologia e Organização Espacial

**Paradigma Espacial: Chat → Workbench (Dois Mundos Separados)**

A camada de interface do usuário fornece três superfícies de interação principais — o chat para conversar com a IA, o workbench para visualizar/editar código, e settings para configuração.

A interface do Bolt é modelada após uma IDE de código, com painéis para código, estrutura de arquivos e saída de terminal.

**Layout Físico:**

O Bolt apresenta aos usuários um ambiente simples baseado em chat no qual é possível instruir o agente para criar qualquer coisa imaginável. Features incluem: Split view — editor de código e preview lado a lado.

A estrutura de componentes do bolt.diy revela a organização:

A codebase segue uma estrutura com componentes React separados em: `chat/` (BaseChat, Messages, MessageActions), `editor/` (CodeMirrorEditor, EditorPanel), `workbench/` (Workbench.client, Preview, DiffView), `ui/` (componentes compartilhados) e `settings/`.

| Zona | Conteúdo | Proporção Estimada |
|---|---|---|
| Painel Esquerdo (Chat) | Histórico de conversa + input de prompt | ~35-40% |
| Painel Direito (Workbench) | Editor de código + Preview + Terminal | ~60-65% |

### 2.2 Revelação Progressiva e Estados Mentais

**Streaming Architecture como Indicador de Estado:**

As mensagens do usuário são enriquecidas com anexos de arquivo e templates antes de serem enviadas ao endpoint. O servidor realiza otimização de contexto para reduzir uso de tokens. A resposta do LLM é transmitida de volta via server-sent events. Conforme os chunks chegam, o parser detecta artefatos estruturados e ações, enfileirando-os para execução. O ActionRunner executa ações no WebContainer e atualiza a UI do Workbench com resultados.

O estado mental do agente é revelado **progressivamente através do streaming**: o código aparece gradualmente no editor enquanto a IA "pensa", criando um indicador de progresso orgânico.

**Modos de Discussão vs. Build:**

No canto inferior direito do chatbox, o usuário clica em "Discuss". Insere a pergunta ou prompt e lê a resposta. Pode então: continuar a discussão ou usar um dos botões de ação rápida para implementar a sugestão. O Discussion Mode destaca em azul quando ativo. Clique novamente para desligar e retornar ao Build mode.

Esta separação modal é crítica: a discussão (raciocínio) é isolada do build (execução) pela ação deliberada do usuário.

### 2.3 Fluxo Human-in-the-Loop (HITL)

**Diff View integrado:**

O bolt.diy oferece Diff view para ver as mudanças feitas pela IA.

**Reversão e Versionamento:**

O sistema permite reverter código para versões anteriores para debugging mais fácil e mudanças mais rápidas.

**Upload/Download como Ponte com o Ambiente Local:**

Os projetos podem ser baixados como ZIP para fácil portabilidade e sincronizados com uma pasta no host.

**Seleção de Elemento no Preview:**

O usuário clica no elemento, então, a partir do painel "Choose Element", seleciona a camada desejada. A seleção aparece acima do chatbox. O usuário insere seu prompt e submete.

**File Locking durante Geração:**

O bolt.diy inclui um sistema de file locking para prevenir conflitos durante a geração de código pela IA.

### 2.4 Microinterações e Densidade

| Microinteração | Implementação |
|---|---|
| Referência de Arquivos | Para mencionar um arquivo ou pasta do projeto no prompt, o usuário digita o símbolo `@` para taguear o recurso. |
| Enhance Prompt | O ícone "enhance" refina o prompt via IA antes do envio, editando os resultados antes de submeter. |
| Upload de Contexto | O usuário faz upload de assets como imagens, ZIPs, CSVs e JSON através do painel Files para dar mais contexto à IA. |
| Terminal Integrado | Terminal integrado para visualizar output de comandos executados pelo LLM. |

---

## PLATAFORMA 3: GOOGLE AI STUDIO

### 3.1 Topologia e Organização Espacial

**Paradigma Espacial: Prompt-Centric → Three-Panel Build Mode**

A interface do AI Studio consiste em uma área central de prompt e um painel de configurações para seleção de modelo e ajuste de parâmetros. A plataforma suporta chat prompts para conversas multi-turno e inclui instruções de sistema para definir comportamento, tom ou regras específicas do modelo.

**Build Mode — Evolução para Three-Panel:**

A interface do Build mode, lançada em outubro de 2024 e significativamente atualizada em março de 2026, é projetada em torno de um layout de três painéis que espelha ambientes de desenvolvimento profissionais.

| Zona | Conteúdo | Função |
|---|---|---|
| Painel de Chat/Prompt | Entrada de linguagem natural + instruções | Direcionamento |
| Painel de Código | Editor ao vivo com arquivos do projeto | Implementação |
| Painel de Preview | Renderização em tempo real da aplicação | Validação Visual |

**Decisão Arquitetural Crítica:**

A decisão arquitetural crítica é que o painel de código não é um viewer — é um editor ao vivo. Mudanças no painel de código refletem instantaneamente no preview, e mudanças solicitadas via Annotation Mode atualizam o painel de código. Esta sincronização bidirecional é alimentada por um sistema de gerenciamento de estado que rastreia dependências de arquivos e relacionamentos de componentes.

### 3.2 Revelação Progressiva e Estados Mentais

**Annotation Mode — Inovação UX:**

O Edit mode transforma o AI Studio de um chatbot em uma ferramenta de desenvolvimento visual completa. Com anotação, os desenvolvedores podem desenhar diretamente na interface da aplicação. Podem circular uma seção, marcar uma área, ou apontar para um componente e escrever notas como: "Faça isso maior", "mova isso para o topo" ou "reduza o espaçamento aqui". A IA interpreta a instrução visual e atualiza a aplicação conforme. Esta é uma melhoria importante porque muitas mudanças de UI são mais fáceis de mostrar do que explicar.

**Prompt Autocomplete ("Tab Tab Tab"):**

O recurso de autocomplete de prompt ajuda desenvolvedores a expandir ideias brutas em prompts mais fortes instantaneamente. Em vez de escrever um prompt detalhado do zero, o desenvolvedor começa com algo como "Create a clean SaaS dashboard..." e o AI Studio sugere detalhes de layout, direção de estilo, responsividade, componentes e fluxos de usuário. Isso transforma prompting em algo mais próximo de code autocomplete.

**Comportamento Agêntico (não Multiagente):**

O Build mode com integração Firebase é um exemplo de comportamento agêntico. Quando o usuário diz "adicionar contas de usuário", o agente não apenas diz como — ele provisiona Firebase, escreve código de autenticação e atualiza a UI.

Importante: o Google AI Studio **não** possui debate multiagente visível. É single-agent. Não há logs de deliberação entre agentes para gerenciar.

### 3.3 Fluxo Human-in-the-Loop (HITL)

O HITL no AI Studio é primariamente iterativo via prompt — não existe um sistema formal de "gates" de aprovação:

- **Annotation Mode**: feedback visual diretamente na preview
- **Code Panel ao vivo**: o desenvolvedor pode editar o código a qualquer momento
- **Iteração via Chat**: refinamento por follow-up prompts

Ferramentas adicionais incluem streaming em tempo real para compartilhamento de tela e análise ao vivo, execução de código em um ambiente Python sandboxed, grounding com Google Search para informações atuais, contexto de URL para análise de páginas web específicas e um thinking mode para tarefas de raciocínio complexo.

**Stitch → AI Studio Pipeline:**

O Stitch integra diretamente com o Google AI Studio. Uma vez gerado o design, pode ser exportado direto para o AI Studio, onde pode ser conectado à lógica Gemini ao vivo e testado como protótipo funcional. Isso encurta um loop que tradicionalmente leva dias. Em vez de projetar em uma ferramenta, fazer handoff para um desenvolvedor e esperar, é possível ir de conceito a interface clicável com IA sem sair do ecossistema Google.

### 3.4 Microinterações e Densidade

| Microinteração | Implementação |
|---|---|
| Geração de Imagens Inline | A integração Nano Banana resolve o problema de criação de assets visuais. O AI Studio agora gera imagens customizadas, logos, ícones, ilustrações e gráficos de UI enquanto a aplicação está sendo construída. |
| Action Bar Persistente | Interface de prompting refinada com workspace "Studio" mais limpo e barra de ação persistente no topo para tarefas comuns. Dashboard dedicado para acesso rápido a API keys e changelog. |
| Upload Multimodal | O Google AI Studio permite upload de arquivos de imagem e áudio, bem como conexão direta ao Google Drive pessoal. |
| Deploy para Cloud Run | O pipeline de deploy do AI Studio para Cloud Run é a peça final da arquitetura de produção. Para a maioria dos protótipos e aplicações em estágio inicial, isso significa custo zero além do free tier. |

---

## SEÇÃO COMPARATIVA: PADRÕES DE DESIGN CONVERGENTES

### O que TODAS as três plataformas fazem em comum:

| Padrão Convergente | Verdent | Bolt.new | Google AI Studio | Relevância para Sistema Multiagente |
|---|---|---|---|---|
| **Split Layout (Chat + Artefato)** | Tarefas (esq) + Diff (dir) | Chat (esq) + Workbench (dir) | Prompt (esq) + Code + Preview (dir) | **Crítica** — Define o grid base |
| **Diff como Gateway HITL** | DiffLens + Code Review | DiffView integrado | Edição bidirecional em Code Panel | **Crítica** — Mecanismo de confiança |
| **Terminal/Logs colapsáveis** | Logs em painel lateral direito | Terminal integrado colapsável | Python sandbox, thinking mode | **Alta** — Logs de debate devem seguir este padrão |
| **Referência a Arquivos via `@`** | `@` para arquivos em prompts | `@` para arquivos em prompts | Upload direto + URL context | **Alta** — Linguagem de referência universal |
| **Download/Export como ponte** | Git worktree + push para GitHub | Download ZIP + deploy Netlify | Export code + Cloud Run deploy | **Crítica** — Equivalente aos botões Upload/Download da sandbox |
| **Estado de Processamento Progressivo** | Ações agrupadas + streaming | Streaming de código em real-time | Live preview sync bidirecional | **Alta** — Revelação progressiva do raciocínio |

### Diferenciais Isolados (o que é único de cada plataforma):

| Diferencial | Plataforma | Análise Funcional | Aplicabilidade ao Projeto |
|---|---|---|---|
| **Paralelismo real de agentes em workspaces isolados** | Verdent | Cada agente roda em seu próprio workspace — essencialmente um branch ou worktree gerenciado automaticamente. | **Diretamente aplicável** — Cada agente no sistema precisa de indicador de workspace |
| **DiffLens (insight "por quê")** | Verdent | Vai além do "o quê mudou" para explicar a razão da mudança | **Essencial** — A tag inline no editor deve exibir "por quê" o agente mudou a linha |
| **Plan Mode com fases explícitas** | Verdent | Planos podem ser salvos como templates, clicando na opção "Save as Template" na fase de revisão do plano. | **Alta** — O debate entre agentes produz um "plano" que pode ser versionado |
| **Annotation Mode (desenhar no preview)** | Google AI Studio | Comunicação visual direta na UI renderizada | **Baixa** — Complexidade alta para MVP, mas referência futura |
| **Discussion Mode separado de Build** | Bolt.new | Separação modal explícita entre raciocinar e executar | **Média** — Valida a separação "debate colapsado" vs "código visível" |
| **File Locking durante geração** | Bolt.diy | Previne conflitos enquanto IA escreve | **Alta** — Essencial quando múltiplos agentes editam simultaneamente |
| **WebContainer (sandbox no browser)** | Bolt.diy | Todo AI-generated action é executado através de uma fila de execução global para prevenir race conditions e garantir execução sequencial. | **Crítica** — Padrão para a sandbox do sistema |

---

## IMPLICAÇÕES PARA O SISTEMA MULTIAGENTE — SÍNTESE DECISIONAL

### O que a pesquisa valida das escolhas anteriores de design:

1. **Tag Inline no Editor (tipo DiffLens):** O Verdent prova que exibir o "por quê" de uma mudança *ao lado do código* reduz drasticamente o context switching. A `InlineAgentTag` proposta na Seção 4 do relatório anterior tem precedente direto.

2. **Debate colapsável no Chat:** O Bolt.new valida que separar "discussão" de "execução" como modos distintos é funcional. O accordion de debate colapsado no painel de chat é a versão integrada desse padrão.

3. **Botões Upload/Download como ações primárias:** Todas as três plataformas tratam a transferência de artefatos (ZIP, Git push, Cloud Run deploy) como ações de alta visibilidade, nunca enterradas em menus. Confirma a decisão de tratá-los como ações primárias no File Explorer.

4. **Indicadores de agente por workspace:** O Verdent demonstra que, com múltiplos agentes paralelos, a capacidade de ver o "big picture" e rodar mais tarefas em paralelo sem se perder durante o context switching é o poder central da plataforma. Os dots de status na StatusBar e a tab "Mission Control" são a resposta para esse problema.

### O que a pesquisa revela de NOVO (não coberto no relatório anterior):

| Insight Novo | Fonte | Impacto no Design |
|---|---|---|
| **Fila de execução global** | Bolt.diy (WorkbenchStore) | Implementar ActionQueue no backend para serializar ações de agentes ao mesmo arquivo |
| **Atalho `cmd+number` para workspaces** | Verdent changelog | Adicionar atalhos de teclado para trocar entre agentes ativos — `Ctrl+1` para Agente 1, etc. |
| **Plan como artefato salvável** | Verdent Plan Mode | O consenso do debate multiagente deve ser exportável como template |
| **Annotation visual** | Google AI Studio | Para v2+: permitir ao usuário circular elementos na preview e perguntar ao agente |
| **File Locking** | Bolt.diy | Indicador visual de "arquivo bloqueado pelo Agente 2" no File Explorer durante edição |

---

## FORMATO DE METADADOS PARA NOTEBOOKLM

```yaml
document_type: technical_dossier
version: 1.0.0
scope: UI/UX architecture benchmark
platforms_analyzed:
  - name: "Verdent AI / Verdent Deck"
    relevance: primary
    pattern: task-first-multiagent
  - name: "Bolt.new / bolt.diy"
    relevance: secondary
    pattern: chat-workbench-sandbox
  - name: "Google AI Studio"
    relevance: tertiary
    pattern: prompt-centric-three-panel
key_concepts:
  - progressive_disclosure
  - human_in_the_loop
  - multiagent_state_management
  - information_density_management
  - sandbox_trust_indicators
  - diff_as_approval_gateway
applicable_to: "Sistema Multiagente v2.1.1 - Interface Design Phase"
```

---

## RESPOSTA À PERGUNTA ESTRATÉGICA

> *"Qual o nível de granularidade que você pretende exigir nas consultas para extrair o layout final?"*

Com base na pesquisa realizada, a recomendação é operar em **duas camadas de consulta ao NotebookLM**:

### Camada 1 — Validação de Componentes Isolados (Primeira Passada)
Consultas do tipo:
- *"Como o Verdent trata a visualização de ações dos agentes durante a execução de tarefas?"*
- *"Qual o mecanismo de file locking do Bolt.diy e como ele se aplica a edições multiagente?"*
- *"O Google AI Studio usa indicadores visuais para distinguir ambiente sandbox de ambiente local?"*

Isso produz **validação ponto-a-ponto** de cada componente do esquema React/Tailwind.

### Camada 2 — Wireframes Textuais Compostos (Segunda Passada)
Após validar componentes, consultas de síntese:
- *"Combinando o padrão de DiffLens do Verdent com o Discussion Mode do Bolt, como deveria funcionar o painel de debate colapsável no Chat?"*
- *"Baseado nas três plataformas, qual é o melhor posicionamento para indicadores de status de agentes em um layout de três colunas?"*

Isso produz **wireframes textuais compostos** prontos para serem convertidos em componentes ShadCN/Tailwind pela IA Número 3.

### O Gap que permanece:
A tradução de princípios ergonômicos para componentes React/ShadCN exigirá uma **camada de síntese** onde o NotebookLM fornecerá os princípios e o prompt da IA Número 3 receberá tanto os princípios quanto o esquema de componentes definido na Seção 9 do relatório anterior. A cola entre essas camadas é o mapeamento `Padrão Ergonômico → Componente React → Props de Configuração`.