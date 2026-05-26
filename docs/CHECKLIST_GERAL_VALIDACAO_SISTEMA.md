# 📋 Checklist Geral de Validação — GreenForge NEXUS v2.3

> **Objetivo:** Este checklist permite validar o estado atual do sistema GreenForge IDE dentro do Google AI Studio antes de migrar para execução local.  
> **Como usar:** Marque cada item com ✅ (Funcionando), ⚠️ (Parcial/Problemas) ou ❌ (Não Funciona/Não Implementado)  
> **Data da Validação:** ___/___/_____  
> **Validador:** ___________________

---

## 🎯 SUMÁRIO EXECUTIVO

| Módulo | Status Geral | Prioridade | Observações |
|--------|-------------|------------|-------------|
| **1. Sistema de Arquivos (VFS)** | ◻️ | CRÍTICA | |
| **2. Editor de Código** | ◻️ | CRÍTICA | |
| **3. Chat com IA (Núcleo Adversarial)** | ◻️ | CRÍTICA | |
| **4. Terminal** | ◻️ | ALTA | |
| **5. Controle de Versão (Git)** | ◻️ | ALTA | |
| **6. Persistência de Dados** | ◻️ | CRÍTICA | |
| **7. Interface e Layout** | ◻️ | MÉDIA | |
| **8. Segurança e Hardening** | ◻️ | CRÍTICA | |
| **9. Integração IA ↔ IDE** | ◻️ | CRÍTICA | |
| **10. Fluxo Completo End-to-End** | ◻️ | CRÍTICA | |

**Legenda de Status:**
- ✅ = Funcionando corretamente e validado
- ⚠️ = Funcionalidade parcial ou com problemas conhecidos
- ❌ = Não implementado ou não funcional
- 🔵 = Em desenvolvimento
- 🟡 = Aguardando validação humana

---

## 1️⃣ SISTEMA DE ARQUIFOS (VFS — Virtual File System)

### 1.1 Criação Manual de Arquivos e Pastas

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **VFS-001** | Criar arquivo na raiz via botão "+" no Explorador | ◻️ | |
| **VFS-002** | Criar pasta na raiz via botão "+" no Explorador | ◻️ | |
| **VFS-003** | Criar arquivo dentro de pasta existente | ◻️ | |
| **VFS-004** | Criar subpasta dentro de pasta existente | ◻️ | |
| **VFS-005** | Nomear arquivo com extensão (.ts, .js, .md, etc.) | ◻️ | |
| **VFS-006** | Cancelar criação de arquivo/pasta (botão "Cancelar") | ◻️ | |
| **VFS-007** | Validar se nomes vazios são rejeitados | ◻️ | |
| **VFS-008** | Validar se nomes duplicados são tratados | ◻️ | |

### 1.2 Manipulação de Arquivos Existentes

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **VFS-010** | Renomear arquivo existente (duplo clique ou ícone) | ◻️ | |
| **VFS-011** | Renomear pasta existente | ◻️ | |
| **VFS-012** | Excluir arquivo individual | ◻️ | |
| **VFS-013** | Excluir pasta com conteúdo (recursivo) | ◻️ | |
| **VFS-014** | Mover arquivo entre pastas (drag-and-drop ou UI) | ◻️ | |
| **VFS-015** | Abrir arquivo ao clicar (cria tab no editor) | ◻️ | |
| **VFS-016** | Expandir/recolher pastas (chevron) | ◻️ | |
| **VFS-017** | Ícones corretos por tipo de arquivo (TS, JS, CSS, etc.) | ◻️ | |

### 1.3 Persistência do Sistema de Arquivos

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **VFS-020** | Arquivos persistem após refresh da página (localStorage) | ◻️ | |
| **VFS-021** | Estrutura de pastas persiste após refresh | ◻️ | |
| **VFS-022** | Conteúdo dos arquivos persiste após refresh | ◻️ | |
| **VFS-023** | Exportar workspace como ZIP funciona | ◻️ | |
| **VFS-024** | Importar workspace ZIP (se houver funcionalidade) | ◻️ | |
| **VFS-025** | Limite de armazenamento do navegador é respeitado | ◻️ | |
| **VFS-026** | Mensagem de erro quando quota excede | ◻️ | |

---

## 2️⃣ EDITOR DE CÓDIGO

### 2.1 Funcionalidades Básicas do Editor

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **EDT-001** | Syntax highlighting funciona para TypeScript/JavaScript | ◻️ | |
| **EDT-002** | Syntax highlighting para outras linguagens (CSS, HTML, MD, JSON) | ◻️ | |
| **EDT-003** | Numeração de linhas visível e correta | ◻️ | |
| **EDT-004** | Cursor e seleção de texto funcionam | ◻️ | |
| **EDT-005** | Digitação e edição de conteúdo em tempo real | ◻️ | |
| **EDT-006** | Undo/Redo (Ctrl+Z / Ctrl+Y) funcionam | ◻️ | |
| **EDT-007** | Buscar/substituir no arquivo (se implementado) | ◻️ | |
| **EDT-008** | Indentação automática | ◻️ | |
| **EDT-009** | Auto-complete básico (se implementado) | ◻️ | |

### 2.2 Gerenciamento de Tabs

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **EDT-010** | Abrir múltiplos arquivos em tabs separadas | ◻️ | |
| **EDT-011** | Fechar tab individual (X no tab) | ◻️ | |
| **EDT-012** | Alternar entre tabs clicando | ◻️ | |
| **EDT-013** | Tab ativo destacado visualmente | ◻️ | |
| **EDT-014** | Indicador de arquivo modificado (dirty state) | ◻️ | |
| **EDT-015** | Salvar arquivo manualmente (Ctrl+S ou botão) | ◻️ | |
| **EDT-016** | Auto-save após edição (se implementado) | ◻️ | |

---

## 3️⃣ CHAT COM INTELIGÊNCIA ARTIFICIAL (NÚCLEO ADVERSARIAL)

### 3.1 Interface do Chat

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **CHAT-001** | Área de input de mensagem visível e funcional | ◻️ | |
| **CHAT-002** | Enviar mensagem (Enter ou botão Send) | ◻️ | |
| **CHAT-003** | Mensagens do usuário exibidas corretamente | ◻️ | |
| **CHAT-004** | Mensagens da IA exibidas com avatar/nome do agente | ◻️ | |
| **CHAT-005** | Timestamp nas mensagens | ◻️ | |
| **CHAT-006** | Scroll automático para última mensagem | ◻️ | |
| **CHAT-007** | Indicador de "digitando..." ou loading | ◻️ | |
| **CHAT-008** | **Botão visível para "Nova Conversa" ou "Reiniciar Sessão"** | ◻️ | |
| **CHAT-009** | Histórico de conversas anteriores (se implementado) | ◻️ | |
| **CHAT-010** | Limpar histórico de mensagens atuais | ◻️ | |

### 3.2 Agentes e Debate Adversarial

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **CHAT-020** | ManagerAgent realiza pré-análise do objetivo | ◻️ | |
| **CHAT-021** | Perguntas de clarificação quando confidence < 0.85 | ◻️ | |
| **CHAT-022** | Propositor gera proposta de código | ◻️ | |
| **CHAT-023** | Crítico analisa e identifica issues | ◻️ | |
| **CHAT-024** | Árbitro (Judge) sintetiza debate | ◻️ | |
| **CHAT-025** | Múltiplos rounds de debate (até 3) | ◻️ | |
| **CHAT-026** | Convergência antecipada quando sem high severity issues | ◻️ | |
| **CHAT-027** | FORCE_DECISION após Round 3 sem consenso | ◻️ | |
| **CHAT-028** | Status do debate visível (badge/timeline) | ◻️ | |
| **CHAT-029** | Cores e ícones distintos por agente | ◻️ | |

### 3.3 Approval Cards (Gates HITL)

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **CHAT-030** | Approval Card exibido após convergência do debate | ◻️ | |
| **CHAT-031** | Executive Summary visível (Nível 1) | ◻️ | |
| **CHAT-032** | Rationale em 3 camadas expansível (Nível 2) | ◻️ | |
| **CHAT-033** | Plan Breakdown com arquivos e diffs (Nível 3) | ◻️ | |
| **CHAT-034** | Red Flags destacadas com severidade | ◻️ | |
| **CHAT-035** | Botão "APROVAR" habilitado apenas após expandir Nível 2 | ◻️ | |
| **CHAT-036** | Botão "EDITAR PLANO" funcional | ◻️ | |
| **CHAT-037** | Botão "MAIS UMA RODADA" funcional | ◻️ | |
| **CHAT-038** | Botão "REJEITAR" funcional | ◻️ | |
| **CHAT-039** | Estimativa de tokens e tempo exibida | ◻️ | |
| **CHAT-040** | Aviso de que estimativa é especulativa | ◻️ | |

---

## 4️⃣ TERMINAL

### 4.1 Funcionalidade do Terminal

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **TERM-001** | Input de comandos funcional | ◻️ | |
| **TERM-002** | Executar comando com Enter | ◻️ | |
| **TERM-003** | Comando `help` lista comandos disponíveis | ◻️ | |
| **TERM-004** | Comando `ls` ou equivalente lista arquivos VFS | ◻️ | |
| **TERM-005** | Comando `cd` navega entre diretórios (se aplicável) | ◻️ | |
| **TERM-006** | Comando `clear` ou Ctrl+L limpa terminal | ◻️ | |
| **TERM-007** | Histórico de comandos (setas ↑/↓) | ◻️ | |
| **TERM-008** | Output colorido (ANSI codes) renderizado | ◻️ | |
| **TERM-009** | Indicador de loading durante execução | ◻️ | |
| **TERM-010** | Mensagens de erro exibidas em vermelho | ◻️ | |

### 4.2 Integração Terminal ↔ VFS

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **TERM-020** | Criar arquivo via comando reflete no Explorador | ◻️ | |
| **TERM-021** | Deletar arquivo via comando reflete no Explorador | ◻️ | |
| **TERM-022** | Ler conteúdo de arquivo via comando | ◻️ | |
| **TERM-023** | Comandos do Git via terminal (git status, git add, etc.) | ◻️ | |
| **TERM-024** | Terminal executa comandos reais do sistema ou é simulado? | ◻️ | |
| **TERM-025** | Sandbox de segurança para comandos perigosos | ◻️ | |
| **TERM-026** | Bloqueio de comandos destrutivos (rm -rf /, etc.) | ◻️ | |

---

## 5️⃣ CONTROLE DE VERSÃO (GIT)

### 5.1 Interface Git

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **GIT-001** | Panel Git visível e acessível | ◻️ | |
| **GIT-002** | Branch atual exibido | ◻️ | |
| **GIT-003** | Dropdown para trocar de branch | ◻️ | |
| **GIT-004** | Troca de branch funcional | ◻️ | |
| **GIT-005** | Lista de branches mockada ou real? | ◻️ | |

### 5.2 Staging e Commit

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **GIT-010** | Arquivos modificados aparecem na lista | ◻️ | |
| **GIT-011** | Stage individual de arquivo (+) | ◻️ | |
| **GIT-012** | Unstage individual de arquivo (X) | ◻️ | |
| **GIT-013** | Stage all files | ◻️ | |
| **GIT-014** | Unstage all files | ◻️ | |
| **GIT-015** | Input de mensagem de commit | ◻️ | |
| **GIT-016** | Botão de commit habilitado apenas com staged files | ◻️ | |
| **GIT-017** | Commit cria novo registro no histórico | ◻️ | |
| **GIT-018** | Histórico de commits exibido | ◻️ | |
| **GIT-019** | Expandir/recolver histórico de commits | ◻️ | |
| **GIT-020** | Hash, autor e data do commit visíveis | ◻️ | |

### 5.3 Persistência e Realidade do Git

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **GIT-030** | Commits persistem após refresh | ◻️ | |
| **GIT-031** | Git Panel reflete mudanças reais do VFS | ◻️ | |
| **GIT-032** | Novo arquivo aparece como "added" | ◻️ | |
| **GIT-033** | Arquivo editado aparece como "modified" | ◻️ | |
| **GIT-034** | Arquivo deletado aparece como "deleted" | ◻️ | |
| **GIT-035** | Git é real ou simulação visual? | ◻️ | |
| **GIT-036** | Integração com git real do sistema (se aplicável) | ◻️ | |
| **GIT-037** | secureGit wrapper em uso (validação de segurança) | ◻️ | |

---

## 6️⃣ PERSISTÊNCIA DE DADOS

### 6.1 LocalStorage e Estado

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **PERS-001** | Files do VFS salvos no localStorage | ◻️ | |
| **PERS-002** | Git files salvos no localStorage | ◻️ | |
| **PERS-003** | Git commits salvos no localStorage | ◻️ | |
| **PERS-004** | Git branch atual salvo no localStorage | ◻️ | |
| **PERS-005** | Tema (dark/light) persiste | ◻️ | |
| **PERS-006** | Layout preferences (largura de painéis) persistem | ◻️ | |
| **PERS-007** | Mensagens do chat persistem após refresh | ◻️ | |
| **PERS-008** | Sessão de debate persiste após refresh | ◻️ | |
| **PERS-009** | Dados corrompidos são tratados gracefully | ◻️ | |
| **PERS-010** | Limpeza de localStorage funciona | ◻️ | |

### 6.2 SQLite / Database (se implementado)

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **PERS-020** | SQLite inicializa corretamente | ◻️ | |
| **PERS-021** | DebateSession persistida no DB | ◻️ | |
| **PERS-022** | AuditLog registrado no DB | ◻️ | |
| **PERS-023** | WAL (Write-Ahead Log) para resiliência | ◻️ | |
| **PERS-024** | BootReconciler recupera estado após crash | ◻️ | |
| **PERS-025** | Intents pendentes processados no boot | ◻️ | |

---

## 7️⃣ INTERFACE E LAYOUT

### 7.1 Layout Principal da IDE

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **UI-001** | Sidebar esquerda (Explorador) visível | ◻️ | |
| **UI-002** | Área central (Editor + Chat) funcional | ◻️ | |
| **UI-003** | Painel direito (Agents/Details) visível | ◻️ | |
| **UI-004** | Painel inferior (Terminal) visível | ◻️ | |
| **UI-005** | Redimensionar painéis (drag resize) | ◻️ | |
| **UI-006** | Esconder/mostrar painéis (toggle) | ◻️ | |
| **UI-007** | Layout responsivo em diferentes telas | ◻️ | |
| **UI-008** | Tema dark funcionando | ◻️ | |
| **UI-009** | Tema light funcionando (se implementado) | ◻️ | |
| **UI-010** | Ícones e cores consistentes | ◻️ | |

### 7.2 Componentes Específicos

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **UI-020** | Command Palette (Ctrl+Shift+P) funcional | ◻️ | |
| **UI-021** | Search Panel busca no código | ◻️ | |
| **UI-022** | Agents Panel mostra status dos agentes | ◻️ | |
| **UI-023** | Diff Lens mostra diffs chunk-by-chunk | ◻️ | |
| **UI-024** | Problems Panel lista erros/warnings | ◻️ | |
| **UI-025** | Animações e transições suaves | ◻️ | |
| **UI-026** | Tooltips explicativos | ◻️ | |
| **UI-027** | Acessibilidade (keyboard navigation) | ◻️ | |

---

## 8️⃣ SEGURANÇA E HARDENING

### 8.1 Security Wrapper (secureGit)

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **SEC-001** | Subcomandos fora da allowlist bloqueados | ◻️ | |
| **SEC-002** | Flags proibidas detectadas (--output, --no-index, etc.) | ◻️ | |
| **SEC-003** | Path traversal bloqueado (../etc/passwd) | ◻️ | |
| **SEC-004** | Symlinks maliciosos detectados | ◻️ | |
| **SEC-005** | Environment variables perigosas removidas (BASH_ENV, GIT_PAGER, etc.) | ◻️ | |
| **SEC-006** | Null bytes e newlines em argumentos rejeitados | ◻️ | |
| **SEC-007** | Max args limit respeitado | ◻️ | |
| **SEC-008** | WorktreePath validado (existe e está dentro do projeto) | ◻️ | |
| **SEC-009** | Secrets redactados em logs (API keys) | ◻️ | |
| **SEC-010** | Agent integrity monitoring (detecção de alteração em system prompts) | ◻️ | |

### 8.2 Validação de Comandos Shell

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **SEC-020** | Pipe shell bloqueado via AST (`|`) | ◻️ | |
| **SEC-021** | Command substitution bloqueado (`$(...)` e backticks) | ◻️ | |
| **SEC-022** | Process substitution bloqueado (`<(...)`) | ◻️ | |
| **SEC-023** | Background execution bloqueado (`&`) | ◻️ | |
| **SEC-024** | Validador AST de comandos git integrado | ◻️ | |

---

## 9️⃣ INTEGRAÇÃO IA ↔ IDE

### 9.1 IA Criando e Editando Arquivos

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **INT-001** | IA consegue criar novo arquivo via chat | ◻️ | |
| **INT-002** | Arquivo criado pela IA aparece no Explorador | ◻️ | |
| **INT-003** | IA consegue editar arquivo existente | ◻️ | |
| **INT-004** | Edição da IA reflete no editor em tempo real | ◻️ | |
| **INT-005** | IA consegue criar nova pasta | ◻️ | |
| **INT-006** | IA consegue deletar arquivo | ◻️ | |
| **INT-007** | IA consegue renomear arquivo | ◻️ | |
| **INT-008** | Múltiplas operações em lote pela IA | ◻️ | |
| **INT-009** | Confirmação do usuário antes de aplicar mudanças | ◻️ | |
| **INT-010** | Rollback de mudanças da IA (se rejeitado) | ◻️ | |

### 9.2 Contexto e Memória da IA

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **INT-020** | IA lê conteúdo de arquivos existentes | ◻️ | |
| **INT-021** | IA mantém contexto entre mensagens | ◻️ | |
| **INT-022** | IA referencia arquivos específicos por path | ◻️ | |
| **INT-023** | IA entende estrutura de pastas do projeto | ◻️ | |
| **INT-024** | IA responde baseado no código existente | ◻️ | |
| **INT-025** | Limite de contexto da API respeitado | ◻️ | |
| **INT-026** | Streaming de resposta da IA funciona | ◻️ | |

### 9.3 API Gemini / Backend

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **INT-030** | API key da Gemini configurada | ◻️ | |
| **INT-031** | Chamadas à API Gemini funcionam | ◻️ | |
| **INT-032** | Rate limiting tratado | ◻️ | |
| **INT-033** | Erros da API exibidos ao usuário | ◻️ | |
| **INT-034** | Timeout de requisições configurado | ◻️ | |
| **INT-035** | Retry lógico em caso de falha | ◻️ | |
| **INT-036** | Modelos corretos por agente (Pro vs Flash) | ◻️ | |

---

## 🔟 FLUXO COMPLETO END-TO-END

### 10.1 Cenário: Criar Projeto do Zero

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **E2E-001** | Usuário descreve objetivo no chat | ◻️ | |
| **E2E-002** | ManagerAgent faz perguntas de clarificação | ◻️ | |
| **E2E-003** | Debate adversarial inicia | ◻️ | |
| **E2E-004** | Approval Card exibido | ◻️ | |
| **E2E-005** | Usuário aprova plano | ◻️ | |
| **E2E-006** | IA gera código e cria arquivos | ◻️ | |
| **E2E-007** | Diff Lens exibe mudanças | ◻️ | |
| **E2E-008** | Usuário revisa chunks | ◻️ | |
| **E2E-009** | Merge realizado | ◻️ | |
| **E2E-010** | Git commit criado | ◻️ | |
| **E2E-011** | Projeto funcional no VFS | ◻️ | |

### 10.2 Cenário: Iteração em Projeto Existente

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **E2E-020** | Usuário pede alteração em arquivo existente | ◻️ | |
| **E2E-021** | IA lê arquivo atual | ◻️ | |
| **E2E-022** | Debate ocorre para mudança | ◻️ | |
| **E2E-023** | Aprovação solicitada | ◻️ | |
| **E2E-024** | Mudança aplicada | ◻️ | |
| **E2E-025** | Git reflete mudança | ◻️ | |

### 10.3 Cenário: Recuperação de Falha

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **E2E-030** | Refresh durante operação crítica | ◻️ | |
| **E2E-031** | Sistema recupera estado consistente | ◻️ | |
| **E2E-032** | Nenhuma perda de dados | ◻️ | |
| **E2E-033** | WAL intents processados | ◻️ | |
| **E2E-034** | Usuário notificado de recuperação | ◻️ | |

---

## 1️⃣1️⃣ DOCUMENTAÇÃO

### 11.1 Documentação Técnica

| ID | Teste | Status | Evidência/Observação |
|----|-------|--------|---------------------|
| **DOC-001** | README.md atualizado e claro | ◻️ | |
| **DOC-002** | Vision and Architecture (01) completo | ◻️ | |
| **DOC-003** | Functional Requirements (02) completo | ◻️ | |
| **DOC-004** | Technical Spec (03) completo | ◻️ | |
| **DOC-005** | Operational Playbooks (04) completo | ◻️ | |
| **DOC-006** | Governance and Security (05) completo | ◻️ | |
| **DOC-007** | API and Extensibility (06) completo | ◻️ | |
| **DOC-008** | Visual Identity Specs (07) completo | ◻️ | |
| **DOC-009** | Motion Grammar (08) completo | ◻️ | |
| **DOC-010** | Hardening Contracts (09) completo | ◻️ | |
| **DOC-011** | CHANGELOG mantido | ◻️ | |
| **DOC-012** | Inventário de testes atualizado | ◻️ | |

---

## 1️⃣2️⃣ CRITÉRIOS DE PRONTIDÃO PARA MIGRAÇÃO LOCAL

> **IMPORTANTE:** Somente marque esta seção como ✅ quando TODOS os itens acima estiverem validados.

| Critério | Status | Observações |
|----------|--------|-------------|
| **CRL-001** | Todos os módulos críticos (VFS, Editor, Chat, Terminal, Git) estão ✅ | ◻️ | |
| **CRL-002** | IA consegue criar/editar arquivos realisticamente | ◻️ | |
| **CRL-003** | Persistência funciona confiavelmente | ◻️ | |
| **CRL-004** | Segurança hardening validado (SEC suite) | ◻️ | |
| **CRL-005** | Fluxo E2E completo testado e funcionando | ◻️ | |
| **CRL-006** | Nenhum bug crítico aberto | ◻️ | |
| **CRL-007** | Documentação completa e atualizada | ◻️ | |
| **CRL-008** | Performance aceitável (sem lag significativo) | ◻️ | |
| **CRL-009** | Error handling robusto (sem crashes silenciosos) | ◻️ | |
| **CRL-010** | **PROJETO APTO PARA MIGRAÇÃO LOCAL** | ◻️ | |

---

## 📝 NOTAS GERAIS DA VALIDAÇÃO

### Problemas Críticos Encontrados

| ID | Descrição | Severidade | Ação Corretiva | Responsável |
|----|-----------|------------|----------------|-------------|
| | | | | |
| | | | | |
| | | | | |

### Funcionalidades Parciais

| ID | Descrição | O que falta | Prioridade |
|----|-----------|-------------|------------|
| | | | |
| | | | |
| | | | |

### Melhorias Sugeridas

| ID | Sugestão | Impacto | Esforço |
|----|----------|---------|---------|
| | | | |
| | | | |
| | | | |

---

## ✅ ASSINATURA DE VALIDAÇÃO

**Validador:** ___________________________________

**Data:** ___/___/_____

**Versão do Sistema:** v2.3

**Ambiente:** Google AI Studio

**Próxima Revisão:** ___/___/_____

---

> **Observação Final:** Este checklist deve ser preenchido completamente antes de qualquer decisão de migração para ambiente local. Itens marcados como ⚠️ ou ❌ devem ter planos de ação documentados na seção de Notas Gerais.
