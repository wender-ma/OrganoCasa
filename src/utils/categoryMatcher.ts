import { ProductCategory } from '../types';

const CATEGORY_RULES: Array<[ProductCategory, RegExp]> = [
  [
    'Hortifrúti',
    /banana|maca|mamao|laranja|limao|uva|alface|tomate|batata|cebola|cenoura|alho|abacate|manga|melancia|morango|abacaxi|brocolis|couve|ovos|ovo branco|ovo verm/
  ],
  [
    'Carnes e Aves',
    /carne|alcatra|patinho|acem|contra file|costela|picanha|bacon|linguica|frango|coxa|sobrecoxa|peito frango|coracao|bife|peixe|tilapia|salmao|suino|charque|calabresa/
  ],
  [
    'Laticínios e Frios',
    /leite|queijo|mussarela|mucarela|prato|parmesao|requeijao|iogurte|manteiga|margarina|presunto|mortadela|peito peru|creme de leite|creme leite|condensado/
  ],
  [
    'Padaria e Sobremesas',
    /pao|biscoito|bolacha|torrada|bolo|panetone|doce|chocolate|bombom|bala|sobremesa|gelatina|sonho|croissant/
  ],
  [
    'Bebidas',
    /refrigerante|soda|coca|guarana|fanta|sprite|pepsi|suco|nectar|cerveja|heineken|amstel|brahma|skol|spaten|agua|tonica|vinho|whisky|vodka|energetico|cha|cafe/
  ],
  [
    'Congelados',
    /congelado|hamburguer|nuggets|lasanha|pizza|sorvete|acai|polpa|pao de queijo/
  ],
  [
    'Limpeza',
    /detergente|sabao|lava roupas|amaciante|desinfetante|esponja|ype|limpador|veja|agua sanitaria|cloro|alvejante|papel toalha|lustra moveis|saco lixo/
  ],
  [
    'Higiene e Beleza',
    /shampoo|condicionador|sabonete|creme dental|pasta dente|colgate|oral b|desodorante|rexona|dove|papel hig|higiene|absorvente|fio dental|fralda|cotonete/
  ],
  [
    'Pet Shop',
    /racao|whiskas|pedigree|golden|pet|gato|cao|cachorro|petisco|areia sanitaria/
  ]
];

/**
 * Intelligent categorization of raw receipt product descriptions
 */
export function guessCategoryFromName(name: string): ProductCategory {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(normalized)) {
      return category;
    }
  }

  return 'Mercearia';
}
