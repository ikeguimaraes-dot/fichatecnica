import test from "node:test";
import assert from "node:assert/strict";
import {
  excludedRecipe,
  isProduction,
  recipeCategory,
  visibleRecipe,
} from "../shared/everest-catalog.mjs";

test("exclui bebidas de revenda sem excluir preparos que usam bebida", () => {
  for (const name of [
    "DOSE LICOR 43",
    "FAMIGERADA DOSE",
    "V. TT DV CATENA",
    "V. BR JOSEPH DROUHIN",
    "V. PORTO RAMOS PINTO",
    "GF GIN BOMBAY",
    "Garrafas de vinho",
    "Soft",
    "CERVEJA HEINEKEN",
    "CHOPP HEINEKEN",
    "V. TINTO VALLONTANO",
    "VINHO BRANCO",
    "CHAMP. RUINART",
    "Champanhe",
    "ESP. VALLONTANO",
    "Espumante",
    "COCA COLA KS",
    "AGUA PANNA 500ML",
    "RED BULL TRADICIONAL",
  ])
    assert.equal(excludedRecipe(name), true, name);
  for (const name of [
    "PROD. REDUCAO DE VINHO DO PORTO - LT",
    "PROD. BOLACHA CHAMPANHE CONFEITARIA - KG",
    "RISOTO DE VINHO",
    "DRINK NEGRONI",
    "JARRA CLERICOT ESPUMANTE",
  ])
    assert.equal(excludedRecipe(name), false, name);
});
test("produção usa prefixo Prod; alimentos e bebidas são filtros independentes", () => {
  for (const name of ["prod. massa", " PROD XAROPE", "Produção de suco"])
    assert.equal(isProduction(name), true);
  assert.equal(isProduction("MASSA PROD."), false);
  for (const name of [
    "DRINK NEGRONI",
    "CAIPIRINHA LIMAO",
    "CAFE NESPRESSO",
    "PROD. XAROPE DE MEL - LT",
    "PROD. SUCO DE LIMAO FRNZ - LT",
    "PROD. GIN COM AVELA - LT",
  ])
    assert.equal(recipeCategory(name), "drink", name);
  for (const name of [
    "PROD. SUCO DE LARANJA CONFEITARIA - LT",
    "PROD. AZEITE VERDE - LT",
    "PROD. SOUR MOSTARDA MDNA - KG",
    "PROD. BOLACHA CHAMPANHE CONFEITARIA - KG",
    "RISOTO",
  ])
    assert.equal(recipeCategory(name), "food", name);
});
test("Sashimeet pertence somente ao Meet, inclusive wagyu e variações de grafia", () => {
  for (const name of [
    "SASHIMEET DE WAGYU",
    "sashimmet de wagyu",
    "SASHIMEET",
    "SASHIMEET DE WAGYU FRNZ",
  ])
    for (const unit of [1, 3, 5, 10])
      assert.equal(visibleRecipe(name, unit), unit === 1, `${name}: ${unit}`);
});

test("rótulos de casa impedem contaminação sem remover receitas compartilhadas sem rótulo", () => {
  for (const name of [
    "BURRATA GOLD FRNZ",
    "GNOCCHI SELADO FRNZ",
    "PROD. BACALHAU FRZN",
    "PROD. COXINHA FRENZ",
    "LINGUICA FRENEZE",
  ])
    for (const unit of [1, 3, 5, 10])
      assert.equal(visibleRecipe(name, unit), unit === 10, `${name}: ${unit}`);
  assert.equal(visibleRecipe("RISOTO MDNA", 1), false);
  assert.equal(visibleRecipe("RISOTO MDNA", 3), true);
  assert.equal(visibleRecipe("DRINK NEGRONI DEL MADONNA", 1), false);
  assert.equal(visibleRecipe("PROD. LASANHA MEET", 10), false);
  for (const unit of [1, 3, 5, 10])
    assert.equal(visibleRecipe("PROD. CALDO DE LEGUMES", unit), true);
});
