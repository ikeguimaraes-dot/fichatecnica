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

O menu **Ficha técnica** abre uma biblioteca com um livro por unidade cadastrada no Everest. Ao abrir um livro, são consultadas todas as páginas de vínculos de itens daquela empresa e exibidas somente as fichas cujo `id_item` pertence à unidade. Itens compartilhados aparecem nos livros das respectivas unidades; versões existentes das fichas são preservadas. A busca, os filtros e as contagens se restringem ao livro aberto. Há busca de unidades e navegação de volta à estante.

A integração consulta a API de produção sem importar registros para as tabelas de receitas e sem alterar o cadastro original. Os livros do Everest são gerados a partir do cadastro de unidades, separados dos livros autorais em **Meus livros**. Cada ficha oferece composição, preparo quando disponível e impressão/PDF identificada pela unidade.

Configure no servidor Vercel: `EVEREST_USERNAME`, `EVEREST_PASSWORD`, `EVEREST_ENTITY`, `EVEREST_ENVIRONMENT` (`production` ou `homologation`) e `EVEREST_ALLOWED_USER_IDS` (UUIDs Supabase separados por vírgula). Produção usa entidade `2024059`; homologação usa `2020153`. As variáveis foram configuradas apenas em Production; previews exigem configuração própria. Nunca exponha estas credenciais em variáveis `VITE_*`.

A função `/api/everest` valida a sessão no Supabase e permite somente usuários explicitamente autorizados. O cadastro de uma nova conta não libera automaticamente os dados da empresa. A conta inicialmente autorizada é `grupomeeteat@gmail.com`. O backend usa o mesmo Supabase do aplicativo; se trocar o projeto, configure também `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no servidor.

Conforme o [manual do Everest](https://homologacao.acomsistemas.com.br/docs), as consultas utilizam Basic Authentication, `GET /api/adm/fichatecnica` e `GET /api/adm/fichatecnica/{id}`, com `x-Entidade` e `x-Pagina` na query. As unidades vêm de `GET /api/sis/empresa`; os vínculos vêm de `GET /api/adm/itemempresa?cd_empresa=...`. O servidor expõe somente código/nome da unidade e IDs dos itens, descartando outros campos do cadastro. Os vínculos de todas as páginas precisam ser confirmados antes de mostrar qualquer ficha do livro; uma falha nessa etapa nunca exibe a lista global como alternativa. Todas as páginas de fichas são carregadas, com progresso e indicação de resultado parcial em caso de falha. Há intervalo mínimo de 1,1 segundo por instância e uma nova tentativa para limite de consultas. Instâncias concorrentes ainda podem receber limitação do Everest; a tela permite tentar novamente. O cache interno dura até cinco minutos; **Atualizar fichas** o ignora.

Rendimentos em KG e G/GR são exibidos em kg. Produções em litros ou unidades preservam a informação original e indicam peso em kg não informado. A composição é complementada por `GET /api/adm/fichatecnica/item/{id_item}?cd_empresa=...`, que retorna a árvore de custos da unidade. Cada componente mostra `custo_medio` por sua unidade e `vl_custo_producao` para a quantidade da receita. O total usa o valor da raiz da árvore; níveis internos de sub-receitas não são somados novamente. Custo por kg pronto = total ÷ rendimento em kg. Valores usam a precisão recebida; os preços dos itens exibem até quatro casas e os totais duas.

Antes de associar valores, são conferidos o ID/versão da ficha retornada, rendimento, item, unidade e quantidade dos componentes diretos. O endpoint por item pode devolver outra versão; nesse caso, os preços não são atribuídos à ficha aberta e a interface informa o motivo. Falhas ou dados incompletos preservam a composição e mostram custos não informados, sem tratar ausências como zero, com botão para tentar novamente. O cache do detalhe inclui a unidade para não misturar preços entre empresas. Estes valores são custos do Everest, não preços de venda.

`npm run dev` e `npm run preview` executam apenas o frontend. Para usar o backend localmente, utilize `vercel dev` com as variáveis de desenvolvimento configuradas. Os testes de interface simulam a API; nenhum dado é escrito no Everest.

## Verificação

```sh
npx playwright install chromium
npm test
npm run test:api
```

Os testes verificam busca, filtros, favoritos, criação/edição/exclusão, foto, cálculo com unidades diferentes, persistência e largura mobile. O Playwright compila e inicia uma prévia em `http://localhost:4173`. Os testes de livros também cobrem movimentação entre livros, capa, exclusão preservando receitas e dados locais anteriores.

Os testes da integração cobrem autenticação, autorização, normalização de unidades, erros, paginação, busca, detalhes, impressão e layout mobile.

## Design

Identidade Le Chef: fundo branco, laranja ácido `#ff6500` e texto escuro.

Tipografia Playfair Display, DM Sans e Manrope (Google Fonts). Fotografias ilustrativas do Unsplash. Recursos externos requerem conexão; as fichas próprias usam o Supabase Storage.
