# Zebrahub

Plataforma própria de gestão de redes sociais, aprovação de conteúdo e relatórios — inspirada no fluxo do MLabs/Reportei, feita sob medida para a operação da Zebrazul.

## O que já vem pronto

- **Autenticação por papel**: admin, equipe (team) e cliente, com JWT.
- **Gestão de clientes**: cadastro e edição de nome, segmento, CNPJ, endereço, telefone, e-mail e redes sociais (Instagram, Facebook, TikTok, LinkedIn e YouTube).
- **Aprovação de conteúdo**: a equipe cria, edita, exclui e envia o post para aprovação; o cliente aprova ou reprova com comentários.
- **Feed & Calendário**: a prévia da grade e o calendário mensal ficam reunidos na mesma página, usando o mesmo cliente selecionado.
- **Relatórios**: dashboard com gráficos de alcance, engajamento e cliques por cliente, com lançamento manual de métricas (pronto para depois plugar as APIs oficiais de Meta Ads e Google Ads).
- **Painel geral**: visão consolidada de pendências de aprovação e próximas publicações.
- **Financeiro**: controle de receitas e despesas, valores recebidos e pendentes, saldo realizado/projetado, filtros por cliente e mês, exportação CSV e baixa de lançamentos.

## Estrutura

```
zebrazul-hub/
  backend/     → API REST (Node + Express + SQLite)
  frontend/    → Interface web (React + Vite + Tailwind + Recharts)
```

## Rodando localmente

### 1. Backend

Para desenvolvimento local, copie o `.env.example`, altere `NODE_ENV=development` e use um caminho de banco local. Em produção, o armazenamento persistente é obrigatório.

```bash
cd backend
npm install
cp .env.example .env
npm run check:storage
npm start                 # sobe em http://localhost:4000
```

O seed demonstrativo só deve ser executado manualmente em ambiente de teste com `SEED_DEMO_DATA=true`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                # sobe em http://localhost:5173
```

O frontend já está configurado para redirecionar chamadas `/api` para o backend em desenvolvimento (`vite.config.js`).

## Hospedando em produção

Recomendação simples e barata:

- **Backend**: Railway, Render ou um VPS pequeno (o SQLite funciona bem para o volume da agência; se crescer muito, trocar para Postgres é a única mudança estrutural necessária — o código já usa queries parametrizadas, então a migração é direta).
- **Frontend**: Vercel ou Netlify, apontando a variável de ambiente da API para a URL pública do backend (trocar o `baseURL` em `src/api.js` ou usar uma variável `VITE_API_URL`).

Antes de ir para produção:
1. Crie um volume ou disco persistente fora da pasta do código.
2. Configure `DATABASE_PATH` e `BACKUP_DIR` nesse volume.
3. Configure as credenciais `BOOTSTRAP_ADMIN_*` para a primeira inicialização.
4. Execute `npm run check:storage` e só prossiga quando `storageSafe` estiver como `true`.
5. Troque `JWT_SECRET` por um valor aleatório forte e ative HTTPS.
6. Mantenha `SEED_DEMO_DATA=false`.

A v12 bloqueia a inicialização em produção quando o armazenamento não é seguro. Consulte `CONFIGURACAO_DEFINITIVA_DOS_DADOS.md`.

## Próximos passos sugeridos (roadmap)

- Integração real com **Meta Marketing API** e **Google Ads API** para puxar métricas automaticamente (hoje o lançamento é manual, propositalmente, para não depender de tokens de terceiros nesta primeira versão).
- Upload de mídia (imagem/vídeo) direto no post, hoje o campo `media_url` aceita um link.
- Notificações por e-mail/WhatsApp quando um conteúdo é aprovado, reprovado ou comentado.
- Publicação automática agendada (hoje o status "agendado" é apenas organizacional).

## Papéis e permissões

- **admin**: acesso total, incluindo criação, edição de senha e exclusão de usuários, além da exclusão de lançamentos financeiros.
- **team**: cria/edita clientes, posts, métricas e lançamentos financeiros; não cria usuários nem exclui lançamentos financeiros.
- **client**: vê apenas os próprios dados de conteúdo e relatórios; não acessa o módulo financeiro interno.

## Persistência obrigatória em produção

A v12 não aceita banco descartável em produção. Configure um volume persistente antes de iniciar:

```env
NODE_ENV=production
DATABASE_PATH=/data/zebrazul_hub.sqlite
BACKUP_DIR=/data/backups
SEED_DEMO_DATA=false
ALLOW_UNSAFE_STORAGE=false
```

O administrador visualiza o status de proteção e pode baixar um backup completo na página **Usuários**.

Consulte `CONFIGURACAO_DEFINITIVA_DOS_DADOS.md` antes de publicar.
