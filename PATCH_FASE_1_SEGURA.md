# ZebraHub — Fase 1 segura

Este patch contém apenas mudanças pequenas e reversíveis. Não altera schema e não exclui arquivos.

## 1. Check do designer / subtarefa

Arquivo alterado:

- `backend/services/permissions.js`

### Problema

A camada global de permissões classificava qualquer escrita em `/tasks/*` como `tasks.create` antes da rota de tarefas validar o caso especial de `designer_completed`. Isso bloqueia cargos personalizados que conseguem visualizar tarefas, mas não possuem a permissão ampla de criar/editar tarefas.

### Correção

A camada central agora reconhece dois contratos estritos:

- `PUT /tasks/:id` com **somente** `{ designer_completed }`
- `PATCH /tasks/:id/designer-completed` com **somente** `{ completed }` ou `{ designer_completed }`

Nesses dois casos ela exige `tasks.view`, deixando a autorização fina para `backend/routes/tasks.js`, que continua verificando se é subtarefa e se o usuário está atribuído.

O frontend continua usando `PUT`, preservando a compatibilidade planejada para deploys Vercel/Railway fora de sincronia.

## 2. Relatório de mídia órfã — somente leitura

Arquivo novo:

- `backend/scripts/report-orphan-media.js`

Script adicionado ao `backend/package.json`:

```bash
npm run report:orphan-media
```

### O que ele faz

- abre o SQLite em modo somente leitura;
- ativa `query_only`;
- descobre todas as tabelas do banco;
- inspeciona todas as colunas textuais;
- procura referências `/api/media/...` inclusive dentro de JSON/textos;
- compara com os arquivos físicos das pastas de mídia;
- lista referências quebradas;
- lista arquivos órfãos;
- calcula espaço potencialmente recuperável;
- identifica cópias físicas do mesmo nome em diretórios diferentes.

### O que ele NÃO faz

- não executa migration;
- não altera linhas no SQLite;
- não remove arquivos;
- não renomeia arquivos;
- não move mídia.

### Execução no Railway / ambiente com variáveis configuradas

```bash
cd backend
npm run report:orphan-media
```

### Salvar relatório JSON

```bash
node scripts/report-orphan-media.js --json=/tmp/media-report.json
```

### Informar caminhos manualmente

```bash
node scripts/report-orphan-media.js \
  --database=/data/zebrazul_hub.sqlite \
  --media-dir=/data/media \
  --json=/tmp/media-report.json
```

## Validação antes do deploy

1. Fazer backup do banco de produção.
2. Subir apenas o backend com a exceção de permissão.
3. Testar com um usuário do mesmo cargo do designer que apresentava o problema.
4. Confirmar que ele consegue marcar/desmarcar apenas subtarefas atribuídas a ele.
5. Confirmar que esse mesmo usuário continua impedido de editar título, cliente, responsável e demais campos se o cargo não possuir `tasks.create`.
6. Executar o relatório de mídia e guardar o JSON. Não apagar os órfãos ainda.

## Próxima etapa recomendada

Depois de obter o relatório real de produção:

1. revisar as referências classificadas como órfãs;
2. mapear qualquer mídia que exista fora do padrão `/api/media/...`;
3. criar testes para permissão/aprovação/mídia;
4. só então desenhar o coletor com opção de exclusão.
