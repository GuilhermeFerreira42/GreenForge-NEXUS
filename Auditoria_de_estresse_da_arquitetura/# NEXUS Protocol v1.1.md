# NEXUS Protocol v1.1
**Meta-Comando Consolidado de Geração de Documentação Arquitetural de Excelência**

> Origem: Engenharia reversa do PRD NEXUS + fusão de 3 meta-comandos validados em produção
> Versão 1.1: integração com Sistema de Arquivamento Progressivo + instrução de parada por informação faltante
> Uso: Entregar a qualquer modelo frontier (Claude Opus, Gemini Ultra, GPT-4o) com a descrição do projeto

---

## CONTEXTO DO PROJETO

Preencha os campos abaixo antes de enviar este comando. Quanto mais contexto você fornecer, menos perguntas o modelo precisará fazer antes de gerar.

´´´
PROJETO: [Descreva o projeto em linguagem natural. Pode ser vago — o sistema fará perguntas antes de gerar.]

ESTADO ATUAL:
- Já existe PRD anterior? [Sim / Não]
- Fases já implementadas: [liste ou escreva "nenhuma"]
- Decisões arquiteturais já tomadas: [liste ou escreva "nenhuma"]
- Restrições conhecidas (tecnologia, prazo, equipe): [descreva ou escreva "nenhuma"]
´´´

> Se não houver estado anterior, deixe os campos como "nenhuma". O NEXUS gerará o documento do zero.
> Se houver estado anterior, o NEXUS incorporará as decisões já tomadas e não as questionará sem motivo.

---

## TAREFA

Gerar documentação completa — PRD + Projeto Arquitetônico + Plano de Implementação — para o projeto descrito acima, seguindo o padrão de qualidade e estrutura definidos abaixo.

---

## PADRÃO DE QUALIDADE

O documento gerado deve satisfazer simultaneamente três critérios:

**REPLICABILIDADE:** Um engenheiro pleno que nunca viu o projeto pode iniciar implementação usando APENAS este documento.

**DETERMINISMO:** Uma IA executora pode implementar a solução integralmente sem realizar inferências, suposições ou decisões arquiteturais próprias.

**AUDITABILIDADE:** Cada decisão é rastreável, cada requisito tem teste correspondente, cada mudança declara impacto.

---

## REGRAS INVIOLÁVEIS DE FORMATO

- PROIBIDO parágrafos narrativos com mais de 3 linhas. Usar tabelas, bullets e listas numeradas.
- PROIBIDO generalidades como "implementar funcionalidades robustas" ou "garantir boa performance". Cada afirmação deve ser verificável com critério binário (passou/não passou).
- PROIBIDO schemas JSON incompletos. Todo exemplo deve ser funcional, copiável e com valores realistas.
- PROIBIDO diagramas apenas mencionados. Todo diagrama deve estar presente em Mermaid renderizável.
- PROIBIDO decisões sem justificativa. Cada escolha tecnológica deve ter alternativa rejeitada documentada com motivo.
- PROIBIDO seções vazias ou com "A DEFINIR". Se a informação não existe, **PARAR e PERGUNTAR** ao usuário antes de continuar — mesmo que isso interrompa a geração no meio.
- PROIBIDO comportamento não especificado. O que não for explicitamente autorizado deve ser considerado proibido.
- OBRIGATÓRIO que cada requisito tenha ID único (RF-XX, RNF-XX) e critério de aceite verificável programaticamente.
- OBRIGATÓRIO que cada requisito tenha teste correspondente na matriz de rastreabilidade.
- OBRIGATÓRIO responder em Português (pt-BR).

---

## REGRA DE PARADA POR INFORMAÇÃO FALTANTE

Antes de gerar cada seção, verificar se há informação suficiente para preenchê-la sem inventar.

Se não houver:
1. Parar a geração naquele ponto
2. Listar as perguntas necessárias no formato:
   ´´´
   --- INFORMAÇÃO NECESSÁRIA ANTES DE CONTINUAR ---
   Seção bloqueada: [nome da seção]
   Perguntas:
   1. [pergunta objetiva]
   2. [pergunta objetiva]
   Aguardando resposta para continuar.
   ´´´
3. Aguardar resposta do usuário
4. Retomar a partir da seção bloqueada

Esta regra tem precedência sobre a regra de geração contínua. É preferível pausar do que gerar conteúdo inventado.

---

## ESTRUTURA OBRIGATÓRIA DO DOCUMENTO

### PARTE 1 — VISÃO DO PRODUTO

**1.1 Identidade**
- Codinome interno (nome memorável, não genérico)
- Versão atual (extraída do package.json, pyproject.toml ou equivalente, se existir)
- Declaração de visão: 1 frase, máximo 30 palavras, verbo no infinitivo, que capture o diferencial

**1.2 Problema e Solução**

Tabela obrigatória (mínimo 4 linhas):

| Problema | Impacto | Como o Sistema Resolve |
|---|---|---|

**1.3 Público-Alvo**

Tabela obrigatória (mínimo 3 segmentos):

| Segmento | Perfil (nome fictício + dor específica) | Prioridade (P0/P1/P2) |
|---|---|---|

**1.4 Princípios Arquiteturais**

Tabela obrigatória (mínimo 5 princípios):

| Princípio | Descrição Concreta | Implicação Técnica |
|---|---|---|

Cada princípio deve ter uma DECISÃO ARQUITETURAL CRÍTICA associada: uma regra verificável por testes automatizados ou auditoria.

**1.5 Diferenciais**

Tabela comparativa vs soluções existentes ou abordagens manuais:

| Abordagem Atual | Problema | Como Este Sistema Supera |
|---|---|---|

---

### PARTE 2 — ARQUITETURA DE COMPONENTES

Para CADA componente principal do sistema:

**Ficha Técnica (tabela)**

| Atributo | Valor |
|---|---|
| ID interno | [identificador único] |
| Classe Base | [herança, se houver] |
| Dependências | [lista explícita] |
| Modo de Operação | [síncrono/assíncrono, stateful/stateless] |
| Permissões | [leitura, escrita, execução — o que pode acessar] |

**Responsabilidade**
1 parágrafo máximo, sem generalidades. Formato: "Receber X, processar Y, produzir Z."

**Inputs Detalhados**

| Input | Tipo | Descrição | Origem |
|---|---|---|---|

**Output**
Exemplo JSON completo e funcional (não esqueleto) com valores realistas.

**Configuração/System Prompt (se aplicável)**
Texto completo com regras invioláveis numeradas. Incluir placeholders dinâmicos com sintaxe `{{VARIAVEL}}`.

**Budget de Recursos**

Tabela de alocação percentual (tokens, memória, tempo — conforme aplicável ao domínio):

| Componente | Alocação | % |
|---|---|---|

---

### PARTE 3 — FLUXO DE COMUNICAÇÃO E CONTRATOS

**3.1 Diagrama de Sequência**
Diagrama Mermaid completo (`sequenceDiagram`) mostrando TODAS as interações entre componentes para o fluxo principal.

**3.2 Diagrama de Estado**
Diagrama Mermaid (`stateDiagram-v2`) para o ciclo de vida da unidade principal de trabalho do sistema. Incluir:
- Todos os estados possíveis
- Todas as transições com evento disparador
- Estados terminais (sucesso e falha)

**3.3 Tabela de Transições de Estado**

| Estado Atual | Evento | Estado Novo | Condição | Ação |
|---|---|---|---|---|

**3.4 Schemas de Mensagens**
Para CADA tipo de mensagem trocada entre componentes:
- JSON Schema completo com campos `required`, `types`, `patterns` de validação
- Exemplo concreto preenchido com valores realistas
- Regras de validação (o que acontece se o schema for violado)

---

### PARTE 4 — INFRAESTRUTURA E INTEGRAÇÃO

**4.1 Diagrama de Infraestrutura**
Diagrama Mermaid mostrando todos os componentes de infraestrutura e suas conexões.

**4.2 Requisitos de Hardware/Ambiente**

Tabela com mínimo 3 perfis:

| Perfil | Especificações | Notas |
|---|---|---|

**4.3 Integrações Externas**
Para cada integração:
- O que é e por que foi escolhida (com alternativa rejeitada)
- Variáveis de ambiente exatas necessárias
- Como configurar (passo a passo)
- Como estender (ex: novo provedor)
- Fallback se indisponível

**4.4 Configuração Completa**
- Arquivo de configuração principal em JSON com comentários explicativos em CADA campo usando `"comment*"`
- Valores pré-configurados para o caso de uso padrão
- Arquivo `.env.example` com TODAS as variáveis documentadas e explicadas

**4.5 Segurança**
- Fluxo completo de autenticação/autorização (se aplicável)
- Proteções implementadas (tabela com ameaça → mitigação)
- Regras de sandbox/isolamento (tabela com o que é permitido vs bloqueado)
- Tratamento de dados sensíveis

---

### PARTE 5 — RECUPERAÇÃO DE ERROS E RESILIÊNCIA

**5.1 Classificação de Erros**

Tabela completa (mínimo 5 níveis):

| Nível | Tipo | Exemplos Concretos | Ação Automática | Timeout | Máx Tentativas |
|---|---|---|---|---|---|

**5.2 Fluxo de Self-Healing**
Diagrama Mermaid (`flowchart`) mostrando o caminho de decisão desde a detecção do erro até a resolução ou escalação.

**5.3 Padrões de Recuperação**
Para cada padrão de erro identificado:
- DETECTOR: como o erro é identificado
- PATTERN: assinatura do erro (mensagem, código, tipo)
- FLUXO: passos numerados de recuperação (1, 2, 3...)

**5.4 Mapa de Falhas**
Diagrama Mermaid conectando cada modo de falha à sua estratégia de recuperação.

**5.5 Tabela Resumo de Resiliência**

| Cenário | Detecção | Recovery Automático | Tempo Máximo | Intervenção Humana |
|---|---|---|---|---|

---

### PARTE 6 — REQUISITOS FUNCIONAIS E NÃO-FUNCIONAIS

**6.1 Requisitos Funcionais**

Tabela completa:

| ID | Requisito | Critério de Aceite (verificável) | Prioridade (MoSCoW) | Complexidade |
|---|---|---|---|---|

Mínimo: cobrir todos os fluxos identificados na arquitetura. Cada RF deve referenciar o componente responsável.

**6.2 Requisitos Não-Funcionais**

Tabela completa:

| ID | Categoria | Requisito | Métrica | Target |
|---|---|---|---|---|

Categorias obrigatórias (quando aplicáveis): Performance, Segurança, Escalabilidade, Compatibilidade, Usabilidade, Observabilidade.

**6.3 Matriz de Rastreabilidade**

Tabela obrigatória:

| RF/RNF | Componente | Arquivo | Método/Função | Teste que Valida | Critério Binário de Aceite |
|---|---|---|---|---|---|

Nenhum requisito pode ficar sem teste correspondente.

---

### PARTE 7 — ÁRVORE DE ARQUIVOS E BLUEPRINT ESTRUTURAL

**7.1 Árvore Completa**
Estrutura de diretórios com TODOS os arquivos do projeto.

**7.2 Descrição por Arquivo**
Para cada arquivo crítico:
- Propósito (2-3 linhas)
- Dependências (`Deps:` lista)
- Interfaces públicas expostas (`Interfaces:` assinaturas de métodos/funções com tipos)
- Quem usa este arquivo e quando

**7.3 Convenções de Nomenclatura**
Regras de nomes para: arquivos, classes, funções, variáveis, branches, commits.

---

### PARTE 8 — DECISÕES ARQUITETURAIS (ADRs)

Para cada decisão significativa (mínimo 6):

| Campo | Valor |
|---|---|
| Status | ACEITA / REJEITADA / PROPOSTA |
| Data | [data] |
| Contexto | [o problema que motivou a decisão] |
| Decisão | [o que foi escolhido] |
| Alternativas Rejeitadas | [opções descartadas com motivo] |
| Consequências | [prós e contras da decisão] |
| Mitigação | [como os contras são tratados] |

---

### PARTE 9 — PLANO DE IMPLEMENTAÇÃO

**9.1 Definição do MVP**

Lista explícita em dois blocos:
- O QUE ESTÁ NO MVP: [lista com checkmarks]
- O QUE NÃO ESTÁ NO MVP: [lista com X]

**9.2 Critérios de Aceitação do MVP**

Cenários concretos em formato Gherkin ou equivalente:
´´´
DADO [contexto]
QUANDO [ação]
ENTÃO [resultado esperado com critério mensurável]
´´´

**9.3 Fases de Implementação**

Cronograma sequencial com dependência estrita (mínimo 4 fases):

| Fase | Duração | Entregas | Critério de Conclusão | Dependência |
|---|---|---|---|---|

Cada fase só inicia após a conclusão da anterior. Incluir para cada fase:
- Lista exata de arquivos criados/modificados
- Testes obrigatórios
- Critério de aceite da fase

**9.4 Métricas de Sucesso**

| Métrica | Target | Como Medir |
|---|---|---|

**9.5 Riscos Técnicos**

Tabela (mínimo 8 riscos):

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|

---

### PARTE 10 — PADRÕES E BLINDAGEM ESTRUTURAL

**10.1 Padrões Arquiteturais Adotados**
Lista com nome do padrão e onde/como é aplicado.

**10.2 Design Patterns Permitidos e Proibidos**

| Permitido | Onde se Aplica | Proibido | Motivo da Proibição |
|---|---|---|---|

**10.3 Regras de Modularização**
- Acoplamento máximo permitido entre módulos
- Regras de dependência (quem pode importar quem)

**10.4 Observabilidade**
- Estratégia de logging (formato, níveis, destinos)
- Estratégia de auditoria (o que é registrado, retenção)
- Monitoramento (métricas coletadas, alertas)

**10.5 Escopo Congelado**
- Lista explícita de alterações proibidas
- Lista de arquivos protegidos (não podem ser modificados sem ADR)

---

### PARTE 11 — GUIA DE REPLICAÇÃO

Passo a passo independente e autocontido:

1. Pré-requisitos COMPLETOS (linguagens com versão exata, ferramentas, SDKs, gerenciadores de pacote)
2. Comando de clone (instrução simulada com URL placeholder)
3. Comandos de inicialização de infraestrutura
4. Instalação de dependências (comando EXATO)
5. Configuração de `.env` (instruções por variável)
6. Build (comando EXATO)
7. Execução (comando EXATO)
8. Testes (como rodar + como validar manualmente a funcionalidade principal)
9. Acesso à interface ou API (URLs, portas, credenciais padrão)
10. Verificação pós-deploy (health check, smoke test)

---

### PARTE 12 — EXTENSIBILIDADE

- Como adicionar um novo módulo/componente em 5 passos (tutorial)
- Como adicionar uma nova integração externa
- Pontos de extensão documentados (plugins, hooks, middlewares, configurações dinâmicas)

---

### PARTE 13 — LIMITAÇÕES CONHECIDAS

- Bugs conhecidos com severidade e workaround
- Limites técnicos do sistema (formatos não suportados, escalas não testadas)
- Dependências obsoletas ou com vulnerabilidades conhecidas
- Race conditions, memory leaks ou problemas de concorrência identificados

---

### PARTE 14 — ROADMAP INFERIDO

Baseado nas limitações e na arquitetura, sugerir próximas versões:

| Versão | Foco | Features Principais | Estimativa |
|---|---|---|---|

---

## CLÁUSULA DE INTEGRIDADE

Ao final do documento, incluir:

**Checklist de Completude**
- [ ] Todo requisito tem ID único e critério de aceite verificável
- [ ] Todo requisito tem teste na matriz de rastreabilidade
- [ ] Toda decisão arquitetural tem ADR com alternativa rejeitada
- [ ] Todo componente tem ficha técnica, inputs, outputs e exemplo JSON
- [ ] Todo diagrama está em Mermaid renderizável
- [ ] Todo schema de mensagem tem exemplo concreto preenchido
- [ ] Todo cenário de falha tem estratégia de recuperação documentada
- [ ] O guia de replicação é autocontido (não requer acesso ao código original)
- [ ] Nenhuma seção contém "A DEFINIR", generalidades ou placeholders

**Declaração de Determinismo**
Este documento foi estruturado para eliminar ambiguidade operacional. Se qualquer seção permitir múltiplas interpretações, ela deve ser expandida até que reste apenas uma forma implementável. Toda decisão é rastreável, testável e verificável. O documento é auto-suficiente, auditável e imune a interpretações criativas.

---

## INSTRUÇÕES DE INTEGRAÇÃO COM O SISTEMA DE ARQUIVAMENTO

Após este documento ser gerado, aprovado e revisado pelo usuário, ele alimenta diretamente o Sistema de Arquivamento Progressivo (Comando 1). O mapeamento é:

| Seção do NEXUS | Destino no Arquivamento |
|---|---|
| Partes 1-8 (Visão, Arquitetura, ADRs) | `CURRENT_STATE.md` — estado inicial do projeto |
| Parte 8 (ADRs) | `DECISION_LOG.md` — decisões da Fase 0 (planejamento) |
| Parte 9.3 (Fases de Implementação) | `BACKLOG_FUTURO.md` — ondas e critérios de aceite |
| Parte 7 (Árvore de Arquivos) | `CURRENT_STATE.md` — módulos e contratos vigentes |
| Parte 9.1 (MVP) | `BACKLOG_FUTURO.md` — meta da Onda 1 |

Ao executar o Comando 1 logo após aprovar este documento, instrua a IA a usar estas seções como insumo direto em vez de ler blueprints históricos — pois o NEXUS recém-gerado já é o estado inicial consolidado.

---

## REGRAS DE GERAÇÃO

1. Gere até o limite de tokens.
2. Ao parar, encerre com: `--- CONTINUAÇÃO PENDENTE (próximo: [seção ou subseção]) ---`
3. O usuário dirá "continue" para retomar.
4. Use markdown, tabelas, Mermaid, blocos de código.
5. Seja técnico, didático e preciso.
6. 100% baseado no que foi descrito ou inferível — sem achismo.
7. Se não souber: PARE e PERGUNTE ao usuário antes de inventar. Esta regra tem precedência sobre a regra 1.

**GERE O DOCUMENTO COMPLETO AGORA.**