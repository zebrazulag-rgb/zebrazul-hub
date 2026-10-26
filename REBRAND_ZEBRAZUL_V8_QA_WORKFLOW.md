# ZebraHub — V8 · QA + Workflow canônico

Esta etapa fecha a primeira rodada do rebrand atacando o ponto estrutural mais sensível do Hub: o mesmo conteúdo não pode aparecer como “aprovado” em uma área e “em correção” em outra.

## O que mudou

- Criada uma fonte canônica de interpretação de workflow no frontend (`frontend/src/utils/workflowState.js`).
- Criada a mesma regra central no backend (`backend/utils/workflowState.js`).
- Designer, formulário de tarefas e área de aprovação passaram a consumir a mesma leitura de estado.
- Rotas centrais de tarefas, aprovação pública e serviço de aprovação passaram a compartilhar as mesmas regras de normalização.
- `internal_approval` e `external_approval` continuam aceitos como legado, mas a interface trabalha com uma única etapa: `approval`.
- `status = done` sem `workflow_stage` agora é interpretado de forma consistente como `approved` (antes havia divergência entre telas).
- Correção tem precedência sobre marcadores antigos de aprovação. Se um registro contém `changes_requested`, ele não deve aparecer como aprovado por causa de um `workflow_stage` antigo.
- A regra “direção aprovou, mas ainda não enviou ao cliente” foi centralizada (`isHeldForDirection`).
- Links públicos de aprovação usam a mesma inferência da operação interna.

## Modelo canônico

Workflow visual:

`todo → in_progress → correction / approval → approved → scheduled → posted`

Aprovação:

- Direção: `pending | approved | changes_requested`
- Cliente: `waiting | pending | approved | changes_requested`
- Compatibilidade: `approval_status` antigo continua sendo lido, mas não é mais interpretado separadamente em cada tela.

## QA incluído

- `frontend/tests/workflowState.test.js`
- `backend/tests/workflow-state.test.js`
- `QA_V8.sh`

Cenários cobertos:

1. aliases legados de aprovação;
2. tarefa `done` sem workflow;
3. direção aprovou e ainda não enviou;
4. peça já enviada ao cliente;
5. aprovação final do cliente;
6. correção com estados conflitantes;
7. correção em subtarefa sinalizando a tarefa mãe.

## Validação executada aqui

- 6/6 testes puros de workflow do frontend passaram.
- 5/5 testes puros de workflow do backend passaram.
- Sintaxe dos arquivos backend alterados validada com `node -c`.
- JSX/JS alterados validados com o parser/transpilador do TypeScript.

O build Vite completo não foi executado porque este ambiente não possui `frontend/node_modules`. A suíte completa do backend também depende de módulos nativos/externos não instalados neste ambiente (`better-sqlite3`, `jsonwebtoken` etc.).

## Importante

Esta V8 altera frontend **e backend**. Aplique depois da V7 e publique as duas partes juntas para evitar que uma versão interprete estados de forma diferente da outra.
