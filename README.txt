ZEBRAHUB — CARGOS E PERMISSÕES
==============================

Este pacote foi preparado sobre o ZIP atual enviado pelo usuário:
zebrazul-hub-main (11)(1).zip

O QUE ENTRA
-----------
1. Configurações > Permissões
2. Cargos personalizados (ex.: Social Media, Designer, Videomaker)
3. Permissões por cargo para páginas e ações
4. Controle detalhado de Social Media:
   - Feed planejado
   - Criar/editar publicações
   - Compartilhar Feed
   - LINK SOCIAL MEDIA
   - Inteligência de capas
   - Feed publicado
   - Comparar feeds
   - Calendário
   - Stories
   - Relatórios
   - Conexões Meta/Instagram
5. Permissões de Tarefas:
   - visualizar
   - criar/editar
   - aprovação
   - importar/exportar CSV
   - compartilhar calendário
6. Comercial: visualizar, gerenciar e importar leads
7. Bússola, Rematrículas, Materiais e módulos sensíveis
8. “Somente proprietário” para recursos em teste
9. “Visualizar como” para conferir o acesso de cada cargo
10. Atribuição de cargo personalizado na tela de Usuários
11. Bloqueio também no backend; não é apenas esconder menu/botão

SEGURANÇA
---------
- Administrador principal permanece com acesso total.
- O proprietário da agência não pode ser removido ou rebaixado.
- Senhas, Usuários, Marca, Permissões e Financeiro mantêm proteção administrativa adicional.
- “Somente proprietário” bloqueia inclusive outros administradores.
- Cargos personalizados continuam usando a estrutura interna “team”, preservando o controle de acesso por cliente já existente.

DEPENDÊNCIAS ENTRE PERMISSÕES
-----------------------------
Ao ligar uma função filha, a interface liga automaticamente a área principal necessária.
Ex.: ligar “Inteligência de capas” liga também Social Media + Feed planejado.

DEPLOY
------
Os arquivos alteram frontend + backend + banco.
Depois do commit, aguarde:
- Railway: Active
- Vercel: Ready

Não é necessário criar variável de ambiente nova.
Não mexa no /data nem apague o banco.
As novas tabelas são criadas automaticamente na inicialização.

VALIDAÇÃO FEITA
---------------
- Sintaxe de todos os arquivos backend modificados: OK (node --check)
- SQL das novas tabelas de cargos/permissões: OK em SQLite isolado
- Imports relativos do frontend: verificados; nenhum import ausente
- Balanceamento estrutural dos JSX modificados: verificado
- Build Vite completo não foi executado neste ambiente porque as dependências npm não estavam disponíveis localmente e a rede externa está bloqueada. A validação final de bundling ocorre na Vercel.

OBSERVAÇÃO DE SESSÃO
--------------------
Mudanças de permissão passam a valer no backend imediatamente.
Para um usuário que já estiver com o ZebraHub aberto atualizar menus e abas, basta recarregar a página (Command + Shift + R) ou entrar novamente.
