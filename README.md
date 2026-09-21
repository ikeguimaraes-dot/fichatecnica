# Le Chef · Livro de receitas

Sistema de fichas técnicas de pratos, em português, com React, TypeScript, Vite e Supabase.

## Rodar

```sh
npm ci
npm run dev
```

Abra a URL indicada pelo Vite. Para gerar a versão de produção:

```sh
npm run build
npm run preview
```

O projeto já usa a URL e a chave **publicável** do Supabase configurado. Para outro ambiente, copie `.env.example` para `.env.local`. Nunca coloque `service_role` em variáveis `VITE_*` ou no frontend.

## Funcionalidades

- Biblioteca com vários livros, cada um com nome, descrição, tema de capa e foto opcional.
- Receitas organizadas por livro; criação dentro do livro, seleção no editor e movimentação em lote de receitas existentes.
- Visões globais Todas as receitas, Sem livro, favoritos e custos. Busca e categorias continuam disponíveis dentro de cada livro.
- Excluir um livro preserva suas receitas em Sem livro; receitas existentes permanecem acessíveis.
- Ficha com descrição, rendimento final em kg (aceita decimais), tempo de preparo, ingredientes, etapas, fotos e notas.
- Custos calculados a partir da quantidade em g ou kg e do preço por kg. O total usa os valores sem arredondamento intermediário; exibição em reais com duas casas decimais.
- Custo total e por kg da receita pronta (custo total ÷ rendimento final em kg). Valores correspondem aos ingredientes; mão de obra, energia e perdas não são calculadas.
- Upload da foto principal e de uma foto por etapa, em JPG, PNG ou WebP, até 10 MB.
- Impressão da ficha pelo navegador e opção de salvar como PDF.
- Cadastro, login, recuperação de senha e dados privados por conta.
- Demonstração com receitas ilustrativas e persistência no navegador; fotos nesse modo têm limite de 2 MB por arquivo. Dados de demonstração não são importados automaticamente para a conta.
- Layout responsivo, navegação por teclado, foco em modais e respeito à preferência de movimento reduzido.

## Banco de dados

As migrações em `supabase/migrations/` criam uma estrutura própria e a identificam como `receita`. A segunda migração renomeia apenas a estrutura criada por este aplicativo. Nenhuma tabela legada de receitas, fichas técnicas ou ingredientes é utilizada. O único vínculo externo é com `auth.users`, para autenticação do Supabase.

Estrutura aplicada ao projeto informado:

- `public.receita_livro`: livros privados por conta, com nome, descrição, capa e tema.
- `public.receita.yield_kg`: peso final produzido em kg. Receitas antigas ficam com rendimento a informar, sem converter porções em kg. `servings` é mantido apenas como histórico no banco.
- `public.receita.book_id`: vínculo opcional ao livro, com chave estrangeira que também verifica o proprietário. Ao excluir um livro, apenas esse vínculo é removido.
- `public.receita`: uma ficha por registro, com ingredientes e etapas em JSONB para salvar o documento atomicamente.
- `receita-fotos`: bucket privado; caminhos começam com o ID do usuário. Acesso às imagens por URLs assinadas com validade de 24 horas; recarregue a página para renová-las.
- RLS em SELECT, INSERT, UPDATE e DELETE, limitada ao proprietário. Visitantes não têm acesso à tabela.
- A aplicação cria novos arquivos para cada upload. Fotos removidas de uma ficha ou de uma edição cancelada podem continuar no bucket; a limpeza desses arquivos pode ser feita posteriormente com uma rotina de retenção.

A aplicação usa as configurações existentes do Supabase Auth. Para publicar, configure **Site URL** e **Redirect URLs** no painel de Auth para o domínio definitivo e para o endereço local utilizado. Cadastro com confirmação e recuperação dependem da entrega de e-mail configurada no projeto. Cada conta tem sua própria biblioteca; compartilhamento entre membros de equipe não foi implementado.

## Publicação

O deploy completo usa Vercel, com frontend estático e função de servidor para consultar o Everest:

- Build: `npm run build`
- Diretório de saída: `dist`
- Variáveis: consulte `.env.example` e a seção Everest abaixo.

O arquivo `vercel.json` define explicitamente o framework Vite, a instalação via `npm ci` e a saída `dist`. Isso evita que um preset Next.js selecionado no painel impeça o deploy. A raiz do projeto na Vercel deve ser a raiz deste repositório.

## Ficha técnica · Everest

O menu **Ficha técnica** abre uma biblioteca com um livro por unidade cadastrada no Everest. Ao abrir um livro, a aplicação lê somente a última cópia concluída no Supabase. Durante a sincronização, todas as páginas de vínculos são consultadas, e somente fichas cujo `id_item` pertence à unidade entram no livro. Itens compartilhados aparecem nos livros das respectivas unidades; versões existentes das fichas são preservadas. A busca, os filtros e as contagens se restringem ao livro aberto. Há busca de unidades e navegação de volta à estante.

A integração guarda cópias em tabelas próprias `receita_everest_*`, sem misturar com as tabelas das receitas autorais e sem alterar o cadastro original no Everest. Os livros do Everest são gerados a partir do cadastro de unidades, separados dos livros autorais em **Meus livros**. Cada ficha oferece composição, preparo quando disponível e impressão/PDF identificada pela unidade.

Configure no servidor Vercel: `EVEREST_USERNAME`, `EVEREST_PASSWORD`, `EVEREST_ENTITY`, `EVEREST_ENVIRONMENT` (`production` ou `homologation`) `EVEREST_ALLOWED_USER_IDS` (UUIDs Supabase separados por vírgula), `EVEREST_SUPABASE_SERVICE_KEY` (chave administrativa Supabase) e `EVEREST_WORKER_TOKEN` (token aleatório do processador). Produção usa entidade `2024059`; homologação usa `2020153`. As variáveis foram configuradas apenas em Production; previews exigem configuração própria. Nunca exponha estas credenciais em variáveis `VITE_*`.

As consultas às unidades, fichas e preparos do Everest são liberadas para todos os usuários autenticados no Supabase, exceto sessões anônimas. A lista `EVEREST_ALLOWED_USER_IDS` restringe apenas a sincronização e edição de preparos. O backend usa o mesmo Supabase do aplicativo; se trocar o projeto, configure também `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no servidor.

### Sincronização manual e leitura rápida

**Atualizar esta unidade** e **Atualizar todas** enviam POST para `/api/everest` e criam um trabalho persistente no banco. Requisições repetidas retornam o trabalho já ativo. Nenhuma navegação, busca ou abertura de ficha consulta o Everest. A primeira carga precisa terminar para o livro aparecer; cargas seguintes mantêm a cópia anterior disponível. A data de sincronização aparece no livro e nos cartões. Cada unidade é publicada atomicamente após todos os seus itens serem consultados, inclusive em uma atualização de todas as unidades; uma falha numa unidade posterior não desfaz livros já concluídos.

Tabelas privadas, com RLS e privilégios revogados para `anon` e `authenticated`:

- `receita_everest_unidade`: livro, ponteiro para a cópia atual/anterior e data da última publicação.
- `receita_everest_sync`: fila persistente, progresso, estado de retomada, tentativas e lease exclusivo.
- `receita_everest_template`: fichas brutas usadas somente durante a preparação.
- `receita_everest_snapshot`: fichas, resumos, composição original e árvore de custos por unidade/versão.

O servidor valida a sessão antes de consultar esses dados com a chave administrativa; operações de escrita também exigem a lista de usuários permitidos. Leituras só podem acessar a versão publicada ou a anterior, nunca uma cópia em preparação. Dados originais ficam no banco e permitem recalcular custos com correções de código sem uma nova importação.

O cron `le-chef-everest-worker` verifica a cada minuto se existe trabalho solicitado pelo botão e aciona `/api/everest-worker` por `pg_net`. **Ele não cria atualizações automáticas semanais nem consulta o Everest quando não há trabalho.** O token fica no Vault sob `lechef_everest_worker_token`, com o mesmo valor secreto na Vercel. O processador usa blocos de aproximadamente 45 segundos, checkpoints por etapa e lease de 150 segundos para evitar concorrência e retomar após interrupções. A origem tem intervalo mínimo de 1,2 segundo; 412/429 têm nova tentativa. Cinco falhas consecutivas na mesma etapa encerram o trabalho com erro, preservando versões publicadas. Solicitar novamente o mesmo escopo retoma o último trabalho falho. A fila aceita apenas um trabalho ativo, devido ao limite global da API.

Conforme o [manual do Everest](https://homologacao.acomsistemas.com.br/docs), a sincronização usa Basic Authentication, `GET /api/adm/fichatecnica`, `GET /api/sis/empresa` e `GET /api/adm/itemempresa?cd_empresa=...`, com `x-Entidade` e `x-Pagina`. Todas as páginas são verificadas; erros de transporte nunca são convertidos em lista vazia. Fichas removidas ou desvinculadas desaparecem quando a nova cópia completa da unidade é publicada. Unidades ausentes no catálogo são ocultadas apenas ao concluir uma atualização de todas as unidades. A cópia anterior é mantida para leitura coerente de uma ficha já aberta; versões mais antigas são removidas ao concluir o trabalho. Livros e receitas autorais não são afetados.


Rendimentos em KG e G/GR são exibidos em kg. Produções em litros ou unidades preservam a informação original e indicam peso em kg não informado. A composição é complementada por `GET /api/adm/fichatecnica/item/{id_item}?cd_empresa=...`, que retorna uma árvore de custos. O campo `custo_medio` é o valor de estoque, não necessariamente o custo do preparo. Em preparos internos, `vl_custo_producao` pode representar o lote inteiro do preparo; o total na raiz também pode omitir preparos internos. Por isso nenhum desses campos é utilizado como custo aplicado ou total definitivo.

O cálculo percorre os ingredientes terminais da árvore e soma suas contribuições `custo_unitario`, já proporcionais ao movimento informado. O fator `rendimento da ficha / qt_utilizada da raiz` converte essas contribuições para o lote da ficha aberta. Cada preparo recebe a soma dos seus ingredientes terminais, incluindo preparos dentro de preparos, sem somar novamente os valores intermediários. Custo aplicado por unidade = custo do componente na receita ÷ quantidade cadastrada. O total é a soma dos componentes diretos calculados; custo por kg pronto = total ÷ rendimento em kg. Não se aplica aproveitamento novamente sobre valores já proporcionados pelo Everest. A interface identifica preparos calculados e oferece **Conferência dos custos**, com o total da raiz apenas como referência de comparação.

Antes de associar valores são conferidos o ID da ficha retornada, rendimento, item, unidade e quantidade dos componentes diretos. Duplicidades de nós, árvore incompleta, componentes não associados, preparos sem ingredientes ou contribuições ausentes impedem um total completo. O endpoint por item pode devolver outra versão; nesse caso, os preços não são atribuídos à ficha aberta. Custos de ingredientes terminais zerados ou contribuições positivas sem custo médio geram aviso de conferência, incluindo os nomes dos itens; zero não é tratado como confirmação de gratuidade. Um preparo com estoque zerado e ingredientes válidos pode ser calculado normalmente. Custos ausentes na origem ficam sinalizados na cópia. Para buscar novos valores é necessário solicitar a atualização da unidade. As cópias são identificadas por unidade e versão para não misturar custos entre empresas. Estes valores são custos calculados com dados do Everest, não preços de venda.


`npm run dev` e `npm run preview` executam apenas o frontend. Para usar o backend localmente, utilize `vercel dev` com as variáveis de desenvolvimento configuradas. Os testes de interface simulam a API; nenhum dado é escrito no Everest.

## Verificação

```sh
npx playwright install chromium
npm test
npm run test:api
```

Os testes verificam busca, filtros, favoritos, criação/edição/exclusão, foto, cálculo com unidades diferentes, persistência e largura mobile. O Playwright compila e inicia uma prévia em `http://localhost:4173`. Os testes de livros também cobrem movimentação entre livros, capa, exclusão preservando receitas e dados locais anteriores.

Os testes da integração cobrem autenticação, autorização, normalização de unidades, erros, paginação, busca, detalhes, impressão e layout mobile. Também cobrem leitura por versão, bloqueio de cópias em preparação, ausência de chamadas à origem durante navegação, checkpoints, atualização manual, retenção da cópia anterior e retomada após recarregar a página.

## Design

Identidade Le Chef: fundo branco, laranja ácido `#ff6500` e texto escuro.

Tipografia Playfair Display, DM Sans e Manrope (Google Fonts). Fotografias ilustrativas do Unsplash. Recursos externos requerem conexão; as fichas próprias usam o Supabase Storage.

### Modo de preparo das fichas Everest

A ficha possui duas abas: dados técnicos de leitura e **Modo de preparo**, editável no Le Chef. Cada preparo pertence à combinação `(unit_id, ficha_id)` e fica em `receita_everest_preparo`, independente dos snapshots. A sincronização do Everest não altera nem exclui o preparo. A API verifica a sessão e o vínculo da ficha com a unidade; a edição também exige a lista de usuários autorizados. Uma revisão UUID impede sobrescrever alterações simultâneas.

Etapas podem ser adicionadas, reordenadas e removidas; cada etapa aceita até três fotos e a ficha aceita uma referência final (até 24 fotos e 24 etapas no total). Imagens JPG/PNG/WebP de até 20 MB são convertidas no navegador para JPEG de até 1600 px e 2 MB. O bucket privado `receita-everest-preparo` aceita apenas JPEG. Uploads usam autorizações temporárias emitidas pelo servidor; leitura usa URLs assinadas por uma hora. Reabra a ficha para renovar as URLs. Caminhos são restritos à unidade/ficha, e as tabelas e funções são acessíveis apenas pelo servidor. Remover uma foto do preparo remove sua referência; arquivos antigos ou de edições canceladas permanecem privados no bucket para futura limpeza controlada.

**Prévia A4** reúne ingredientes, quantidades, custos, rendimento, etapas e miniaturas. O layout tem as mesmas medidas na prévia e na impressão (A4, margem 10 mm); o botão é bloqueado enquanto houver alterações não salvas, fotos pendentes ou conteúdo que exceda uma página. O modo compacto reduz espaços e miniaturas; textos excessivos precisam ser resumidos pelo usuário. Imprimir com escala 100% e sem cabeçalhos/rodapés do navegador. Não há truncamento nem redução ilimitada de fonte para forçar o encaixe.

O endpoint de custos também pode responder HTTP 200 com `{}` quando não há árvore de custos para o item/unidade. Esse caso específico é tratado como custo indisponível (valores nulos, nunca zero), registrado como pendência e não bloqueia os demais itens. Respostas de erro HTTP, objetos não vazios inesperados e cadastros fora do formato continuam interrompendo a etapa com tentativas e preservação da cópia publicada. O aviso final informa a quantidade de consultas sem custos; a próxima atualização consulta esses itens novamente.

### Unidades exibidas no Le Chef

Por decisão operacional, `server/everest-units.mjs` exclui os CNPJs com vínculos duplicados do Everest: Pazinato (2), Teem Group (4), AI1 (6), HOS (7), KPH (8) e Rezende (9). Eles não aparecem na biblioteca, não aceitam consultas/edição de preparo pela API e são ignorados nas sincronizações, inclusive na retomada de trabalhos antigos. As cópias já publicadas e os preparos são preservados no banco. As unidades atuais exibidas são Meet & Eat (1), Madonna (3), Match Point (5) e Freneze (10).

### Livros técnicos compartilhados

A seção **Ficha técnica** inclui os livros fixos **Linguiça** (`linguica`) e **Hamburguer** (`hamburguer`). Suas receitas são cadastradas manualmente em `receita_compartilhada`, sem vínculo com snapshots, unidades ou sincronizações do Everest. Todos os usuários cadastrados e autenticados podem consultar receitas e fotos, mesmo sem acesso à integração Everest. Visitantes e sessões anônimas não recebem acesso aos dados.

A edição está restrita à conta editorial `7ec10346-2f07-4ec7-93d0-3b1d1ee307ed` (grupomeeteat@gmail.com), tanto na interface quanto nas políticas RLS. O editor permite ingredientes, quantidades em g/kg, preço por kg, rendimento final em kg, etapas e fotos. Atualizações/exclusões verificam uma revisão UUID para evitar sobrescritas de outra janela. Os livros são fixos e não podem ser excluídos pela interface.

As imagens usam o bucket privado `receita-compartilhada-fotos`: leitura para usuários cadastrados, envio/exclusão pela conta editorial, limite de 10 MB e MIME JPG/PNG/WebP. URLs de leitura duram uma hora e são renovadas ao reabrir o livro. Arquivos sem referência após edição/exclusão permanecem privados para futura limpeza controlada. Receitas e fotos pessoais permanecem em suas tabelas e bucket anteriores, com as permissões originais.

Testes de navegador usam porta própria `4279` (substituível por `LE_CHEF_TEST_PORT`) e não reutilizam servidores existentes, evitando testar acidentalmente outro projeto local.

As fichas dos livros compartilhados usam o mesmo componente de preparo, fotos e prévia A4 das unidades (`EverestPreparation`), com um adaptador de persistência em `SharedSheet`. A aba **Receita** inclui ingredientes/quantidades sem preços; a prévia A4 iniciada nessa aba também omite custos. A aba **Ficha técnica** preserva os custos. Etapas legadas com `text`/`photo` são lidas automaticamente; novas edições preservam título e até três fotos por etapa em `title`/`photos`, mantendo `photo` compatível com o editor original. O salvamento do preparo preserva os ingredientes e verifica a revisão antes de atualizar.
