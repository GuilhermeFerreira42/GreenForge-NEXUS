veja - # 🛡️ RELATÓRIO TÉCNICO: RESILIÊNCIA E SEGURANÇA EM AGENTES AUTÔNOMOS DE IA
---

# 🛡️ RELATÓRIO TÉCNICO: RESILIÊNCIA E SEGURANÇA EM AGENTES AUTÔNOMOS DE IA

> **Metodologia:** Varredura cruzada de GitHub, documentação oficial, blogs de engenharia e fóruns de desenvolvedores. Dados coletados em maio de 2026.

---

## FATO DE ENGENHARIA #1 — Checkpointing de Estado de UI (Gate Hydration)

### O Padrão Encontrado: Event-Sourced State + Append-Only EventLog

O padrão mais robusto encontrado em produção é o **Event Sourcing** para persistência de estado de agentes. Em vez de salvar um snapshot periódico, cada ação do agente é registrada como um evento imutável em um log.

O OpenHands SDK trata todas as interações como eventos imutáveis adicionados a um log de eventos. O sistema de eventos usa uma hierarquia multinível que inclui ´Event´, ´LLMConvertibleEvent´, ´ActionEvent´ e ´ObservationBaseEvent´. O ´ConversationState´ age como fonte única de verdade, gerenciando metadados mutáveis e um ´EventLog´ append-only. A persistência é atingida serializando metadados em ´state.json´ e eventos em arquivos JSON individuais, permitindo persistência incremental eficiente e retomada de conversas.

Para o Plandex, o padrão é complementado por um sandbox de diff cumulativo: um sandbox de revisão de diff cumulativo mantém as mudanças geradas por IA separadas dos arquivos do projeto até que estejam prontas. A execução de comandos é controlada para que se possa facilmente fazer rollback e depurar.

No ecossistema mais amplo, o **checkpointing baseado em fases** é o padrão emergente: você define o que são "momentos críticos" no seu workflow (após um documento ser processado, após a decisão do usuário, após uma chamada de ferramenta ser bem-sucedida). Em cada checkpoint, você escreve um registro em um banco de dados contendo o estado completo do agente, histórico da conversa, raciocínio até o momento e resultados de ferramentas.

A biblioteca ´agx´ implementa exatamente esse modelo: é um motor de execução baseado em checkpoints para agentes de IA com loops duráveis Wake→Work→Sleep que retomam instantaneamente entre sessões, com suporte a Claude Code, Codex CLI, Gemini CLI e Ollama.

**Referência:**
- OpenHands SDK Architecture: [themoonlight.io/review](https://www.themoonlight.io/en/review/the-openhands-software-agent-sdk-a-composable-and-extensible-foundation-for-production-agents)
- ´agx´ checkpoint engine: [github.com/bradAGI/awesome-cli-coding-agents](https://github.com/bradAGI/awesome-cli-coding-agents)
- Plandex: [github.com/plandex-ai/plandex](https://github.com/plandex-ai/plandex)

**Exemplo de Implementação (pseudocódigo baseado no padrão OpenHands V1):**

´´´python
# Padrão Event-Sourced: cada ação do agente → evento imutável
@dataclass(frozen=True)
class ActionEvent:
    id: str
    timestamp: float
    type: str          # "file_edit" | "bash_run" | "llm_thought"
    payload: dict
    parent_event_id: str | None

class ConversationState:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._event_log: list[ActionEvent] = []
        self._metadata: dict = {}

    def append(self, event: ActionEvent):
        self._event_log.append(event)
        self._persist_incremental(event)   # grava em /state/events/{event.id}.json

    def _persist_incremental(self, event: ActionEvent):
        # Escreve apenas o delta, não o estado inteiro
        path = f".agent/state/events/{event.id}.json"
        with open(path, "w") as f:
            json.dump(asdict(event), f)

    @classmethod
    def resume_from_disk(cls, session_id: str) -> "ConversationState":
        # Ao reiniciar: lê state.json + replay dos events/*.json
        state = cls(session_id)
        for event_file in sorted(glob(".agent/state/events/*.json")):
            event = ActionEvent(**json.load(open(event_file)))
            state._event_log.append(event)  # reconstrói sem re-executar
        return state
´´´

> **⚠️ Gap Identificado:** O OpenHands ainda trabalha para implementar um planejador persistente formal. Uma issue aberta propõe um novo "planning tool" que manteria um ´plan.json´ local em ´.openhands/´, inspirado no comportamento do Claude Code.

---

## FATO DE ENGENHARIA #2 — Prevenção de Escape de Sandbox (Shell Security)

### O Padrão Encontrado: Defesa em Profundidade via AST Parsing + Validadores Semânticos

O padrão de produção mais avançado encontrado é uma **pipeline de 4 estágios sequenciais** onde cada estágio age como gate independente.

O ambiente de execução Bash do Claude Code é protegido por uma arquitetura de defesa em profundidade que combina análise de comandos em nível AST, validadores heurísticos baseados em regex, aplicação de regras de permissão e sandboxing em nível de OS. O pipeline de segurança processa cada invocação do ´BashTool´ por quatro estágios sequenciais, cada um atuando como um gate independente. Um comando rejeitado em qualquer estágio nunca chega à execução.

O **estágio primário** usa tree-sitter para parsear o bash em AST antes de qualquer execução: o gate primário de segurança usa ´tree-sitter-bash´ para parsear comandos em uma AST estruturada antes de qualquer execução. Essa abordagem é fundamentalmente mais precisa do que análise baseada em regex porque respeita regras de quoting do shell, profundidade de aninhamento e precedência de operadores.

O **estágio semântico** captura comandos perigosos que passam pela estrutura: após extração bem-sucedida do AST, ´checkSemantics´ executa validação pós-argv que o parser estrutural não consegue expressar. Isso captura comandos que tokenizam limpos mas são perigosos por nome ou conteúdo de argumento. Os blocos semânticos incluem: builtins eval-like (´eval´, ´source´, ´.´, ´exec´, ´command´, ´builtin´, ´fc´, ´coproc´), builtins perigosos do Zsh.

O **fallback** quando tree-sitter não está disponível: quando tree-sitter não está disponível (falha no carregamento WASM, erro de parse), o sistema cai em uma cadeia de 23+ validadores baseados em regex definidos em ´src/tools/BashTool/bashSecurity.ts´. Cada validador recebe um ´ValidationContext´ contendo o comando original, o nome do comando base e múltiplas representações do comando com diferentes níveis de stripping de aspas.

A biblioteca ´safecmd´ da Answer.AI generaliza esse padrão: ´safecmd´ resolve isso com AST parsing. Ela usa ´shfmt´, um parser bash de qualidade de produção, para extrair todos os comandos que seriam executados — incluindo os ocultos em substituições. Isso funciona porque o AST parsing entende a sintaxe bash estruturalmente. Ofuscação não ajuda — o parser enxerga através de concatenação de strings, expansão de variáveis e truques de encoding porque analisa o comando executado, não o texto-fonte.

O problema central de uma simples allowlist foi documentado como CVE: uma vulnerabilidade crítica de segurança existe no sistema de permissões Bash do Claude Code que permite bypass completo de permissões via encadeamento de comandos shell. O sistema usa correspondência de prefixo simples para regras ´Bash()´, que pode ser explorado usando operadores shell (´&&´, ´;´, ´|´, etc.) para executar comandos arbitrários e não autorizados.

A **solução recomendada** é a re-arquitetura via AST completo: o check de permissão deve ser re-arquitetado para usar um parser AST de shell adequado. O sistema deve parsear o comando inteiro, identificar cada comando individual dentro da string, e verificar permissões para cada um antes da execução.

**Referências:**
- Claude Code Bash Security (análise profunda): [zread.ai/claude-code/27-bash-security-and-sandbox](https://zread.ai/instructkr/claude-code/27-bash-security-and-sandbox)
- ´safecmd´ (Answer.AI): [yortuc.com/posts/securing-shell-execution-agents](https://yortuc.com/posts/securing-shell-execution-agents/)
- ´bashlex´ (Python AST parser): [github.com/idank/bashlex](https://github.com/idank/bashlex)
- ´bash-parser´ (JS/AST): [github.com/vorpaljs/bash-parser](https://github.com/vorpaljs/bash-parser)
- CVE de bypass: [github.com/anthropics/claude-code/issues/4956](https://github.com/anthropics/claude-code/issues/4956)

**Exemplo de Implementação (pipeline de 4 estágios):**

´´´typescript
// Estágio 1: Parse AST via tree-sitter
async function validateCommand(cmd: string): Promise<ValidationResult> {
  let ast: BashAST | null = null;
  
  try {
    ast = await treeSitterBash.parse(cmd);  // Gate 1: Estrutural
  } catch {
    // Fallback: cadeia de 23+ regex validators
    return runRegexValidatorChain(cmd);      // Gate 1b: Regex
  }

  // Estágio 2: Bloqueio de nós AST proibidos
  const forbidden = findForbiddenNodes(ast, [
    'command_substitution',   // $(...) — subshell escape
    'process_substitution',   // <(...) — process subshell
    'eval_command',
  ]);
  if (forbidden.length > 0) return { allow: false, reason: 'AST_FORBIDDEN_NODE' };

  // Estágio 3: Validação semântica (nomes de comando + argumentos)
  const semanticResult = checkSemantics(ast, {
    blocklist: ['eval', 'source', '.', 'exec', 'coproc', 'zmodload'],
    aliasExpansion: false,  // não expande aliases — trata como opaco
  });
  if (!semanticResult.safe) return { allow: false, reason: semanticResult.reason };

  // Estágio 4: Regras de permissão (allowlist configurável)
  return checkPermissionRules(ast.rootCommands, userPermissions);
}
´´´

> **⚠️ Vetor Crítico Descoberto:** backslash-escaped whitespace (´echo\ test/../../../usr/bin/touch /tmp/file´) e dessincronia de aspas/comentário (construções como ´'x'#´) desestabilizam parsers de quote-tracking, fazendo-os perder conteúdo perigoso que segue. Scripts de ´post-install´ do NPM requerem isolamento de rede adicional (não apenas AST), pois executam fora do contexto do shell controlado.

---

## FATO DE ENGENHARIA #3 — Análise de Dependência de Chunks (Inter-chunk Integrity)

### O Padrão Encontrado: Repo Map + Análise de Dependência por Grafo + LLMDFA

O problema de inter-chunk integrity não tem uma implementação "pronta" única — é resolvido pela combinação de três técnicas.

**Técnica 1 — Repo Map (Aider):** O Aider constrói um mapa interno do repositório: o Aider constrói um mapa interno do repositório inteiro para entender relacionamentos de arquivos, imports e arquitetura antes de fazer mudanças. Para múltiplos repositórios interdependentes, a estratégia é: você pode rodar o Aider no ´repo-A´ onde precisa fazer uma mudança e usar ´/read´ para adicionar arquivos somente-leitura de outro ´repo-B´. Isso permite ao Aider ver funções ou docs-chave do outro repo. Você pode rodar ´aider --show-repo-map > map.md´ dentro de cada repo para criar repo maps e então compartilhar um mapa de alto nível do outro repo.

**Técnica 2 — Análise de dependência entre arquivos no formato de edição:** modificações de código frequentemente abrangem múltiplos arquivos, introduzindo complexidades: garantir consistência entre edições relacionadas e gerenciar dependências entre arquivos. O Cursor lida com isso por um modelo separado para aplicação: essa estratégia separa geração de mudanças de alto nível da mecânica detalhada de aplicação. O LLM primário foca no *o que* mudar, enquanto o modelo de Apply especializado foca no *como* integrar aquela mudança de forma robusta e precisa no sistema de arquivos.

**Técnica 3 — LLMDFA + SMT-based path verification (estado da arte acadêmico):** o LLMDFA combina extração guiada por LLM de fontes/sinks, sumarização de dataflow por chain-of-thought com few-shot, e verificação de caminho baseada em SMT para descoberta robusta de fatos de dependência — mesmo em código incompleto ou não compilado.

Para validação de mudanças LLM-sugeridas com análise estática: o SmartHalo valida mudanças de código sugeridas por LLM com execução simbólica e verificações estáticas de regras; outputs não equivalentes são rejeitados ou reenviados.

O benchmark de referência para avaliar dependências entre arquivos: o DEPENDEVAL e DI-BENCH testam se LLMs conseguem reconstruir call graphs entre arquivos, regenerar configurações de dependência de pacotes e garantir executabilidade de repositórios end-to-end.

**Referências:**
- Aider FAQ (multi-repo): [aider.chat/docs/faq.html](https://aider.chat/docs/faq.html)
- LLMDFA paper (Wang et al., 2024): [emergentmind.com/topics/llm-based-dependency-detection](https://www.emergentmind.com/topics/llm-based-dependency-detection)
- Análise de formatos de edição (Aider vs Cursor vs OpenHands): [fabianhertwig.com/blog/coding-assistants-file-edits](https://fabianhertwig.com/blog/coding-assistants-file-edits/)

**Exemplo de Implementação (pseudocódigo para Dependency DAG de Chunks):**

´´´python
# Construção de grafo de dependência entre chunks de um diff multi-arquivo
from dataclasses import dataclass, field
import ast  # para Python; use tree-sitter para multilinguagem

@dataclass
class Chunk:
    id: str
    file: str
    symbols_defined: set[str]   # funções/classes que este chunk DEFINE
    symbols_used: set[str]      # funções/classes que este chunk USA

def build_dependency_dag(chunks: list[Chunk]) -> dict[str, list[str]]:
    """Retorna adjacency list: chunk_id → [depende_de_chunk_id]"""
    # Mapa de símbolo → chunk que o define
    symbol_to_chunk: dict[str, str] = {}
    for chunk in chunks:
        for sym in chunk.symbols_defined:
            symbol_to_chunk[sym] = chunk.id
    
    dag: dict[str, list[str]] = {c.id: [] for c in chunks}
    for chunk in chunks:
        for sym in chunk.symbols_used:
            if sym in symbol_to_chunk and symbol_to_chunk[sym] != chunk.id:
                dag[chunk.id].append(symbol_to_chunk[sym])  # chunk depende de outro
    
    return dag

def warn_on_rejection(rejected_chunk_id: str, dag: dict) -> list[str]:
    """
    Identifica quais outros chunks ficam inválidos se o chunk X for rejeitado.
    Exemplo de output: "Rejeitar Chunk 1 tornará Chunk 3 inválido"
    """
    invalidated = []
    for chunk_id, deps in dag.items():
        if rejected_chunk_id in deps:
            invalidated.append(chunk_id)
    return invalidated

# Uso:
dag = build_dependency_dag(chunks_from_diff)
print(warn_on_rejection("chunk_1", dag))
# → ["chunk_3", "chunk_5"]  ← aviso para o usuário
´´´

> **⚠️ Gap Identificado:** Nenhuma ferramenta atual (Aider, Cursor, OpenHands) implementa esse aviso de invalidação de chunks de forma interativa na UI. O estado da arte é o LLMDFA, que ainda é pesquisa acadêmica. A implementação prática mais próxima é o **Relay**, que: decompõe requisições em tickets com um DAG de dependência, despacha entre um ou mais repos e supervisiona com PR tracking ao vivo e approval gates.

---

## FATO DE ENGENHARIA #4 — Isolamento de Agente Auditor (Judge Isolation)

### O Padrão Encontrado: Git Worktrees para Isolamento de Arquivos + Docker/microVM para Isolamento de Runtime

A questão de "worktree vs. in-memory" tem uma resposta nuançada: **worktrees resolvem um problema diferente de Docker/microVMs**.

**O que Git Worktrees resolvem:** um git worktree é uma cópia de checkout separada do repositório que compartilha o mesmo diretório ´.git´. Cada worktree tem seu próprio diretório de trabalho e sua própria branch, mas todos leem do mesmo object store. Mudanças em um worktree são completamente invisíveis para outro até que você explicitamente as mescle. Esse é o primitivo de isolamento que torna os agentes paralelos seguros.

A regra é: uma task → uma branch → um worktree → um agente. Desviar disso retorna às race conditions. Seguir isso garante isolamento real em nível de arquivo com zero overhead de rede — sem Docker, sem provisionamento de VM.

**O que Git Worktrees NÃO resolvem:** git worktrees isolam branches, não runtimes. Um worktree vinculado dá um branch separado com metadados Git por worktree separados. Ele não cria um namespace de rede separado no host. Ele não cria um diretório de dados Postgres separado. Ele não reconfigura seu perfil de browser, histórico de shell, daemon Docker ou serviços de desenvolvimento de longa duração. Se um processo fora do Git pode afetar seu resultado, worktrees não o isolam automaticamente.

**O custo concreto:** se cada worktree consome ~5 GB em uma codebase de 2 GB, seis agentes consomem 30+ GB. Somando limites de rate da API e o tempo de revisão para seis PRs simultâneos, você reconstruiu o gargalo em uma camada diferente.

**O padrão composto emergente (worktree + container):** o padrão composto emergente combina worktrees para isolamento git com isolamento leve de runtime para agentes full-stack. A ferramenta Container-Use do Dagger, conforme documentado pelo InfoQ, combina git worktrees com isolamento de container para endereçar essa lacuna.

**Para o Agente Juiz especificamente — por que Docker não basta:** executar agentes de IA diretamente em uma máquina compartilhada ou dentro de ambientes de container com kernel compartilhado, como Docker, apresenta riscos substanciais de segurança. Agentes de IA podem inadvertidamente ou maliciosamente rodar comandos prejudiciais. Se um agente ganha acesso ao sistema de arquivos do host, poderia exfiltrar dados sensíveis como API keys ou credenciais.

**Isolamento de entradas/saídas entre agentes (padrão Edera):** entre agentes, inputs e outputs são isolados rigorosamente, garantindo que um agente não possa influenciar ou alterar o comportamento de outro. Cada agente tem acesso apenas a dados que são diretamente passados para sua zona. Se um agente precisa operar em arquivos, os arquivos são passados para a zona daquele agente. Quaisquer mudanças não são persistidas até que os arquivos sejam passados de volta ao host como output.

**As três tecnologias de isolamento de produção:** Firecracker microVMs, gVisor (kernel em user-space) e Kata Containers são as três tecnologias que resolvem o problema. Cada uma adota uma abordagem arquitetural diferente com diferentes trade-offs em força de isolamento, overhead e complexidade operacional.

**Referências:**
- Análise Git Worktrees vs Runtime: [penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation](https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/)
- Multi-Agent Worktree Pattern: [blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/)
- ´ccswarm´ (multi-agent + worktree): [github.com/nwiizo/ccswarm](https://github.com/nwiizo/ccswarm)
- Edera Isolation Report: [edera.dev/stories/performant-isolation-for-secure-ai-agents](https://edera.dev/stories/performant-isolation-for-secure-ai-agents)
- AI Agent Sandboxing vs Docker: [softwareseni.com/ai-agent-sandboxing-explained](https://www.softwareseni.com/ai-agent-sandboxing-explained-why-docker-is-not-enough-and-what-actually-works/)

**Exemplo de Implementação (Agente Juiz com worktree isolado + leitura em memória):**

´´´bash
#!/bin/bash
# Padrão: Judge Agent em worktree read-only isolado
# Baseado no padrão ccswarm + Claude Code --worktree

REPO_ROOT=$(git rev-parse --show-toplevel)
JUDGE_BRANCH="judge/audit-$(date +%s)"
JUDGE_WORKTREE="$REPO_ROOT/.agent-worktrees/$JUDGE_BRANCH"

# 1. Cria worktree isolado (read-only para o juiz)
git worktree add --no-checkout "$JUDGE_WORKTREE" "$SOURCE_BRANCH"
cd "$JUDGE_WORKTREE"
git checkout .  # checkout sem modificar o index do branch principal

# 2. Monta o worktree como read-only no container do juiz
docker run --rm \
  --read-only \                          # FS read-only
  --mount type=bind,src="$JUDGE_WORKTREE",dst=/workspace,readonly \
  --network none \                       # sem acesso à rede
  --memory 512m \                        # limita recursos
  judge-agent-image:latest \
  python -m judge_agent \
    --mode=in-memory-context-only \      # juiz lê contexto, não escreve arquivos
    --source=/workspace \
    --output-format=json

# 3. Cleanup
cd "$REPO_ROOT"
git worktree remove "$JUDGE_WORKTREE" --force
´´´

**Tabela de Trade-offs (Judge Isolation):**

| Estratégia | Isolamento de Arquivos | Isolamento de Runtime | Overhead | Custo em Nuvem |
|---|---|---|---|---|
| **In-Memory somente** | ❌ Nenhum | ❌ Nenhum | ~0ms | Mínimo |
| **Git Worktree** | ✅ Excelente | ❌ Portas/DB compartilhados | ~1s + ~5GB disco | Baixo |
| **Worktree + Docker** | ✅ Excelente | ✅ Bom | ~5-15s cold start | Médio |
| **Worktree + Firecracker/gVisor** | ✅ Excelente | ✅ Excelente | ~100-500ms | Alto |

---

## FATO DE ENGENHARIA #5 — Limitações de Runtime do Google AI Studio

### O Padrão Encontrado: Sistema de Arquivos Efêmero + Files API com Expiração de 48h

As limitações de persistência no Google AI Studio são **documentadas e confirmadas** por múltiplas fontes técnicas.

**Limitação core — sistema de arquivos efêmero:** desenvolvedores não conseguem salvar modificações no código. O próprio agente confirma: "este ambiente de desenvolvimento é como um quadro branco. Posso escrever o código correto nele e ele funciona perfeitamente para aquela sessão. Porém, quando a aplicação atualiza ou a sessão reinicia, o quadro é apagado, e o código original com bugs é recarregado de um template master."

**Limitação da Files API — expiração de 48 horas:** uma vez enviados, arquivos estão disponíveis por 48 horas, após o qual expiram automaticamente. Desenvolvedores podem deletar arquivos programaticamente antes da expiração, se necessário.

O impacto em produção é direto: a natureza temporária frequentemente pega desenvolvedores de surpresa ao mover da fase "playground" para produção. Imagine construir um agente de atendimento ao cliente que precisa de um manual de produto. Se você faz upload do manual na segunda-feira, seu agente perde acesso na quarta. Você precisa de uma estratégia de "hydration" onde o app constantemente verifica a disponibilidade de arquivos e refaz uploads de recursos ausentes antes de uma requisição de inferência. Isso desacelera o usuário e complica o backend com lógica extra de gerenciamento de estado.

**Problemas de sincronia de contexto:** quando o desenvolvedor restaura uma versão mais antiga do código ou edita manualmente um arquivo no editor online, o contexto do chat frequentemente falha ao sincronizar. Quando a IA continua gerando código, ela frequentemente referencia snippets "desatualizados".

**Workaround oficial para persistência de dados — Firebase/Firestore:** o Google AI Studio integra nativamente com Firebase, incluindo banco de dados Firestore (armazenamento de dados persistente) e Firebase Authentication. O agente lida com todo o processo de setup e até escreve o código no aplicativo para esses serviços.

**Workaround para exportar e desenvolver localmente:** para workflows mais avançados, você pode exportar o código e trabalhar no seu ambiente preferido: baixe o código gerado como arquivo ZIP e importe no seu editor de código, ou integre o código com seus processos existentes de desenvolvimento e deployment empurrando-o para um repositório GitHub.

**Para empresas — Vertex AI como alternativa com persistência real:** como arquivos carregados pela API expiram após 48 horas, desenvolvedores devem projetar pipelines que ou reenviam arquivos ou atualizam referências para tarefas recorrentes. Para workflows de longa duração, usuários enterprise são melhor atendidos com Vertex AI, onde arquivos podem ser retidos persistentemente.

**Referências:**
- Fórum oficial (state management): [discuss.ai.google.dev – State Persistence & File Consistency](https://discuss.ai.google.dev/t/critical-feedback-feature-requests-for-ai-studio-state-persistence-code-safety-and-github-sync/115375)
- Fórum oficial (FS efêmero confirmado): [discuss.ai.google.dev – Can not save any modification](https://discuss.ai.google.dev/t/can-not-save-any-modification-in-the-code/108988)
- Files API limits (48h): [datastudios.org/post/google-ai-studio-file-upload](https://www.datastudios.org/post/google-ai-studio-file-upload-and-reading-formats-limits-features-etc)
- Build Mode docs: [ai.google.dev/gemini-api/docs/aistudio-build-mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)

**Exemplo de Implementação (estratégia de hydration para AI Studio):**

´´´python
# Workaround: "Hydration Strategy" para ambiente efêmero do Google AI Studio
# Padrão: verificar e re-uploadar antes de cada inferência

import google.generativeai as genai
from datetime import datetime, timezone
import json, pathlib

class HydratedFileManager:
    """
    Mantém um manifesto local de arquivos enviados ao AI Studio.
    Rehydrata automaticamente quando arquivos expiram (48h).
    """
    MANIFEST_PATH = pathlib.Path(".aistudio_manifest.json")
    TTL_HOURS = 47  # margem de segurança antes das 48h

    def __init__(self):
        self.manifest: dict = self._load_manifest()

    def _load_manifest(self) -> dict:
        if self.MANIFEST_PATH.exists():
            return json.loads(self.MANIFEST_PATH.read_text())
        return {}

    def _save_manifest(self):
        self.MANIFEST_PATH.write_text(json.dumps(self.manifest, indent=2))

    def get_or_upload(self, local_path: str) -> genai.File:
        """Retorna file_uri válida, re-uploadando se necessário."""
        key = local_path
        now = datetime.now(timezone.utc).timestamp()

        if key in self.manifest:
            entry = self.manifest[key]
            age_hours = (now - entry["uploaded_at"]) / 3600
            if age_hours < self.TTL_HOURS:
                # Arquivo ainda válido: reutilizar URI
                return entry["file_uri"]

        # Arquivo expirado ou não existe: re-upload
        print(f"[Hydration] Re-uploading {local_path}...")
        uploaded = genai.upload_file(local_path)
        self.manifest[key] = {
            "file_uri": uploaded.uri,
            "uploaded_at": now,
        }
        self._save_manifest()
        return uploaded.uri

# Uso antes de cada chamada de inferência:
manager = HydratedFileManager()
file_uri = manager.get_or_upload("./project_context.pdf")

model = genai.GenerativeModel("gemini-2.5-pro")
response = model.generate_content([
    "Analise o código e aponte dependências inter-módulo:",
    genai.get_file(file_uri),
])
´´´

**Para persistência real de estado de execução — usar Firestore como backend:**

´´´javascript
// Padrão: externalize o estado do agente para Firestore
// Resolve a natureza efêmera do AI Studio Code Execution
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const db = getFirestore();

async function saveAgentState(sessionId: string, state: AgentState) {
  // Persiste fora do ambiente efêmero
  await setDoc(doc(db, "agent_sessions", sessionId), {
    ...state,
    lastUpdated: new Date().toISOString(),
    checkpoint: state.currentStep,
  });
}

async function resumeAgentState(sessionId: string): Promise<AgentState | null> {
  const snap = await getDoc(doc(db, "agent_sessions", sessionId));
  return snap.exists() ? (snap.data() as AgentState) : null;
}
´´´

---

## 📊 Sumário Executivo dos Padrões

| # | Vulnerabilidade | Padrão de Solução | Maturidade |
|---|---|---|---|
| 1 | Checkpointing de Estado UI | Event Sourcing + Append-Only EventLog (OpenHands V1) | ✅ Produção |
| 2 | Escape de Sandbox Shell | AST Pipeline 4-estágios (tree-sitter + semântica + regex fallback) | ✅ Produção |
| 3 | Dependência Inter-chunk | Repo Map + LLMDFA + DAG de símbolos | ⚠️ Parcial (research) |
| 4 | Isolamento do Agente Juiz | Worktree (file) + Firecracker/gVisor (runtime) composto | ✅ Produção |
| 5 | Runtime Efêmero (AI Studio) | Hydration Strategy + Firestore como backend externo | ✅ Workaround |