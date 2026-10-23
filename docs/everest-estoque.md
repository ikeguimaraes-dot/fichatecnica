# Estoque: notas fiscais recebidas

A aba Estoque consulta `/api/everest-stock` com a sessão autenticada existente. As credenciais privadas `EVEREST_USERNAME`, `EVEREST_PASSWORD`, `EVEREST_ENTITY` e `EVEREST_ENVIRONMENT` são usadas somente no servidor, como na integração atual.

Contrato consultado em https://homologacao.acomsistemas.com.br/api/swagger.json em 23/10/2026:

- Notas: `GET /api/dfi/notarecebida`, filtros inclusivos `lancamento_inicial` e `lancamento_final`.
- Itens, por empresa das notas: `GET /api/dfi/notarecebidaitem`, com `cd_empresa`, `dt_lancamento_ini` e `dt_lancamento_fin`.
- Categorias: `GET /api/adm/item`, relacionamento por `id_item`, descrição `ds_grupo`.
- Todos usam `x-Entidade`, `x-Pagina`, Basic Authentication e paginação pelo header `x-paginas`.

A consulta percorre todas as páginas antes de apresentar os resultados; falhas não viram listas vazias. A data inicial padrão é 20/10/2026 e pode ser alterada na tela. A data final padrão é o dia corrente em São Paulo. A data exibida na linha é **emissão**, pois a documentação do cabeçalho não fornece o campo de data de lançamento na resposta.

Uma nota pode aparecer em várias categorias: os valores agregados são dos itens (`vl_total`), sem repetir o total do cabeçalho em cada categoria. Valores ausentes permanecem não informados. Notas sem itens são sinalizadas separadamente. A situação original é exibida pelo código do Everest, pois a documentação não enumera os significados; não se presume que todas as notas estejam efetivadas. Esta tela não calcula saldo de estoque nem desconta saídas.

Validação automatizada com respostas simuladas: contrato de datas, paginação, autenticação, erros, navegação e filtro de categorias. A consulta real das notas requer publicar a nova função no ambiente com as credenciais; não foi executada nesta implementação local.
