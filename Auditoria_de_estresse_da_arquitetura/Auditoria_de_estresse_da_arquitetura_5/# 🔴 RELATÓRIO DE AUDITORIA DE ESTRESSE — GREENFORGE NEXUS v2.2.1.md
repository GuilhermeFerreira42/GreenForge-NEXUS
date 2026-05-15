Documento lido. Agora faço a auditoria adversária completa.

---

# 🔴 RELATÓRIO DE AUDITORIA DE ESTRESSE — GREENFORGE NEXUS v2.2.1
**Papel:** Engenheiro de Confiabilidade com viés adversário  
**Veredicto:** A v2.2 fechou 17 vulns da auditoria anterior. Encontrei 4 pontos de ruptura novos — dois deles catastróficos mesmo com as mitigações documentadas.

---

## PONTO DE RUPTURA 1: O Estado Zumbi da Saga (Atomicidade)

**Cenário: SIGKILL entre `GIT_STASHED` e `DB_COMMIT`**

A documentação do Saga em `03-technical-spec-and-data.md` e `09-hardening-deterministic-contracts.md` descreve três estados: `PENDING_COMMIT → VFS_STASH_APPLIED → CODE_APPLIED → DB_SUCCESS → FINALIZED`.

O `BootReconciler` para o estado `VFS_STASH_APPLIED` faz:

```typescript
await git(checkpoint.worktreePath).stash(['pop', checkpoint.gitStashRef]);
```

**A falha lógica:** O código de reconciliação faz `stash pop` do `gitStashRef` salvo no Checkpoint. Mas o estado `VFS_STASH_APPLIED` é criado *após* o stash push — o que significa que o `gitStashRef` já foi escrito no DB. Isso parece correto. O problema está na **sequência inversa documentada no** `RollbackManager.executeAtomicChange()` (doc `03`):

```typescript
await git.stash(checkpoint.id);
await prisma.checkpoint.update({ data: { status: 'GIT_STASHED' } });
```

**Divergência fatal:** O `03-technical-spec-and-data.md` mostra o `git stash` *antes* do `UPDATE` de status. O `09-hardening-deterministic-contracts.md` descreve o `BootReconciler` assumindo que `gitStashRef` está persistido no Checkpoint quando o status é `VFS_STASH_APPLIED`. Mas se o processo recebe `SIGKILL` *após* o `git stash push` e *antes* do `prisma.checkpoint.update({ status: 'GIT_STASHED', gitStashRef: realRef })`, o banco tem `status = PENDING_COMMIT` e o git tem um stash órfão sem referência.

**O BootReconciler trata `PENDING_COMMIT` assim:**

```typescript
case 'PENDING_COMMIT':
  await prisma.checkpoint.update({ data: { status: 'ROLLED_BACK', rollbackReason: 'CRASH_BEFORE_VFS' } });
  break;
```

Marca como `ROLLED_BACK` e **não faz nada com o git**. O stash órfão permanece no worktree indefinidamente. A próxima operação no mesmo worktree pode aplicar esse stash acidentalmente via `git stash pop` implícito, corrompendo o estado de uma sessão futura.

**Impacto:** Estado Zumbi confirmado. O filesystem diverge do banco de forma irrecuperável e silenciosa. O `git stash list` acumulará stashes órfãos que contaminam sessões futuras. Não há nenhum mecanismo de limpeza de stashes sem `gitStashRef` documentado no GC.

**Falha na documentação:** O `09` especifica que `gitStashRef` deve estar no DB *antes* da transição de estado, mas o código de exemplo no `03` faz a operação git primeiro. Os dois documentos são mutuamente contraditórios, deixando a decisão de implementação ambígua — e ambas as interpretações têm cenários de ruptura.

---

## PONTO DE RUPTURA 2: Evasão do LoopDetector v2.2

**Cenário: Agente engana os três Tiers simultaneamente**

**Tier 1 — AST Fingerprint:** A taxonomia de nós documentada no `09` normaliza `CallExpression` para `CALL(aridade)` e `Identifier` para `ID`. Um agente em loop que converte recursão em iteração produz hashes AST completamente diferentes: a recursão tem `CallExpression` apontando para a própria função; a iteração tem `WhileStatement` + `AssignmentExpression`. A estrutura de controle muda, o hash muda. **Tier 1 não detecta.**

**Tier 2 — SimHash de 3-shingles:** O SimHash opera sobre *tokens de texto* (`code.split(/\s+/)`), não sobre o AST. A transformação de recursão para iteração muda substancialmente os tokens: `return factorial(n-1)` vira `while (n > 1) { result *= n--; }`. Com threshold de 0.92, a similaridade de shingles entre essas duas implementações ficará tipicamente em 0.40–0.65. **Tier 2 não detecta.**

**Tier 3 — SHA-256 exato:** Qualquer diferença textual produz hash diferente. **Tier 3 não detecta.**

**O resultado:** Um agente que alterna entre três formas semanticamente equivalentes (recursão → iteração com while → iteração com for → de volta à recursão) pode fazer debates infinitos sem jamais acionar nenhum dos três Tiers. As três formas produzem ASTs estruturalmente distintos, shingles distintos, e hashes SHA-256 distintos.

**A regra de escalada do `09`** afirma "2 hashes AST idênticos consecutivos" para disparar. Se o agente nunca repete o mesmo hash exato, a janela de 10 rounds não serve de nada — o sistema simplesmente vai até `FORCE_DECISION` no Round 3 e o usuário humano se torna o único detector de loop real.

**Falha lógica na documentação:** O doc promete "detecção de loops onde agente muda apenas nomes de variáveis" (Tier 1) e "similaridade semântica" (Tier 2), mas a taxonomia de nós incluídos/ignorados cria cegueiras estruturais para transformações de paradigma (imperativo ↔ funcional ↔ recursivo). O `LOOP_DETECTOR_THRESHOLD` de 0.92 é calibrado para detectar cópias quase-idênticas, não reformulações arquiteturais.

---

## PONTO DE RUPTURA 3: Aprovação de Estado Stale no Gate Hydration

**Cenário: Crash de browser durante entrega do `ApprovalCardPayload`**

O protocolo de reconexão documentado no `09` garante que o `ApprovalCardPayload` completo é serializado no `OutboxEvent.payload` antes do emit SSE. Isso resolve a vuln #1 da auditoria anterior. Mas há uma janela nova criada pela própria solução.

**Sequência de falha:**

1. Servidor emite `HITL_GATE` com seq_id=45, payload completo do Approval Card baseado no estado do debate no momento T.
2. O cliente recebe o evento, começa a renderizar o card. O browser crasha *durante* a renderização (tab fechada, OOM, etc).
3. Entre T e T+Δ, o servidor continua processando: o Árbitro recebe feedback adicional de um hook externo, ou o `STEER_AGENT` de outra aba modifica o contexto da sessão.
4. Cliente reconecta, envia `Last-Event-ID: 44`. Servidor re-emite o evento seq_id=45 com o payload que foi serializado em T.
5. Usuário vê o Approval Card com dados de T. Aprova.
6. `HITL_DECISION` chega ao servidor com `gateId` do evento T. O servidor verifica: `gateId` não está em `resolvedGates` — processa a aprovação.

**O problema:** O servidor pode ter estado diferente em T+Δ comparado a T. O payload re-emitido é o snapshot de T, mas o servidor executará a partir do estado atual T+Δ. O usuário aprovou um estado que já não existe.

**A documentação não prevê este cenário.** O `epoch_id` protege contra reinicializações do servidor, mas não contra mutações de estado *dentro da mesma época*. O `gateId` garante idempotência de execução mas não valida se o estado do servidor no momento da execução corresponde ao estado que o usuário aprovou.

**Impacto:** Usuário aprova síntese do Árbitro versão T. Código gerado é baseado no estado T+Δ pós-STEER. O Approval Card mostrou trade-offs que não se aplicam ao código que será gerado. Viola RF-03 (usuário deve validar o rationale antes de aprovar).

**Falha lógica:** O protocolo trata o `gateId` como identificador de *intenção* do usuário, mas não como validador de *consistência de estado*. Falta um campo `stateHash` no payload do gate e verificação no momento da execução.

---

## PONTO DE RUPTURA 4: Path Traversal via `git worktree add` na Shell Allowlist

**Cenário: Combinação de subcomandos Git autorizados para ler fora do worktree**

A Shell Allowlist hierárquica do `05` e `09` bloqueia `git worktree add` explicitamente. Mas há combinações de subcomandos *permitidos* que criam vetores de leitura fora do worktree:

**Vetor 1 — `git log` com `--format`:**
O subcomando `git log` está na allowlist. A flag `--format` não está na blocklist. Um agente pode executar:
```
git log --format="%H %s" --all --source --remotes
```
Isso lê refs remotos e o histórico completo do repositório pai — não apenas do worktree do agente. O `path.resolve` protege contra path traversal de filesystem, mas o `git log` lê o objeto de banco de dados git (`.git/objects/`), que é compartilhado entre todos os worktrees.

**Vetor 2 — `git show` com ref externo:**
`git show` também está na allowlist. Um agente pode executar:
```
git show HEAD:../../etc/passwd
```
O `git show` com sintaxe `<ref>:<path>` acessa objetos git relativos a qualquer commit acessível. Se o path for relativo e atravessar para fora do worktree usando `../../`, o `path.resolve` do *filesystem* não intercepta isso — o git resolve internamente antes do filesystem ver o path.

**Vetor 3 — `git diff` com path externo:**
```
git diff HEAD -- ../../sensitive_file.env
```
Mesma lógica: o `--` separa flags de paths, e o git pode acessar qualquer arquivo rastreável no repositório pai.

**A falha lógica:** A allowlist valida `base_command` e `subcommand`, e usa `path.resolve` para proteger *inicializações de PTY* (`TERMINAL_INIT`). Mas a documentação do `assertCommandAllowed()` no `05` e `09` não mostra validação de *argumentos posicionais que são paths*. O `path.resolve` é aplicado ao `worktreePath` do PTY, não aos argumentos passados para os comandos git dentro do PTY. Um agente que executa via `execute_shell` pode passar paths relativos que atravessam para fora do worktree em subcomandos git permitidos.

**Impacto:** Agente lê arquivos do repositório pai (incluindo outros worktrees, `.env`, arquivos de configuração) via subcomandos git legítimos que não disparam a blocklist. Viola T-01, T-05 e S-01.

---

## Sumário Executivo

| # | Vulnerabilidade | Severidade | Status na v2.2 |
|---|---|---|---|
| 1 | Estado Zumbi por divergência de ordem git/DB no Saga | **CRÍTICO** | Documentação contraditória entre `03` e `09`; implementação é ambígua |
| 2 | Evasão do LoopDetector via transformação de paradigma | **ALTO** | Mitigação documentada tem cegueira estrutural para reformulações algorítmicas |
| 3 | Aprovação de estado stale no Gate Hydration pós-STEER | **ALTO** | Protocolo Outbox resolve o crash, mas não a mutação intra-época |
| 4 | Path traversal via argumentos de subcomandos git na allowlist | **CRÍTICO** | `path.resolve` protege o PTY mas não os argumentos de comandos git |

**Conclusão:** A v2.2 demonstra engenharia séria — os 17 pontos anteriores foram endereçados com profundidade real. Os quatro pontos acima não são negligência; são falhas de segunda ordem que surgem *por causa* das mitigações implementadas. O Ponto 1 emerge da contradição entre dois documentos de spec. O Ponto 3 é criado pelo próprio protocolo de reconexão que corrigiu a vuln #1. Isso é característico de sistemas com maturidade real: as vulnerabilidades que restam são aquelas escondidas nas sombras das proteções existentes.


