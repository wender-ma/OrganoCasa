import { ProductCategory, ProductUnit } from '../types';

export interface OFFProductResult {
  code: string;
  product_name: string;
  image_url?: string;
  brands?: string;
  categories_tags?: string[];
  quantity?: string;
  category: ProductCategory;
  unit: ProductUnit;
}

// Helper to map Open Food Facts categories to our standard categories
function mapOFFCategory(categoriesTags: string[] = [], productName: string = ''): ProductCategory {
  const text = (categoriesTags.join(' ') + ' ' + productName).toLowerCase();

  if (text.match(/fruit|legume|vegetal|hortifruti|banana|maca|manga|tomate|batata|cebola|cenoura|alface/)) {
    return 'Hortifrúti';
  }
  if (text.match(/meat|carne|frango|bovina|suina|ave|peixe|linguica|bacon|salsicha|bife/)) {
    return 'Carnes e Aves';
  }
  if (text.match(/milk|dairy|leite|queijo|iogurte|manteiga|requeijao|creme de leite|presunto/)) {
    return 'Laticínios e Frios';
  }
  if (text.match(/bread|padaria|pao|bolo|biscoito|torrada|doce|chocolate|sobremesa/)) {
    return 'Padaria e Sobremesas';
  }
  if (text.match(/beverage|drink|bebida|refrigerante|suco|cerveja|agua|vinho|cha|cafe/)) {
    return 'Bebidas';
  }
  if (text.match(/frozen|congelado|sorvete|pizza congelada|hamburguer/)) {
    return 'Congelados';
  }
  if (text.match(/cleaning|limpeza|detergente|sabao|amaciante|desinfetante|esponja|papel toalha/)) {
    return 'Limpeza';
  }
  if (text.match(/hygiene|shampoo|sabonete|pasta de dente|desodorante|higiene|fralda|papel higienico/)) {
    return 'Higiene e Beleza';
  }
  if (text.match(/pet|racao|gato|cachorro|cao|areia higienica/)) {
    return 'Pet Shop';
  }
  if (text.match(/rice|bean|arroz|feijao|oleo|azeite|macarrao|molho|farinha|acucar|sal|tempero/)) {
    return 'Mercearia';
  }

  return 'Mercearia';
}

function detectUnit(productName: string, quantityStr: string = ''): ProductUnit {
  const combined = (productName + ' ' + quantityStr).toLowerCase();
  if (combined.includes('kg') || combined.includes('quilo')) return 'kg';
  if (combined.includes(' g') || combined.includes('grama')) return 'g';
  if (combined.includes(' l') || combined.includes('litro')) return 'l';
  if (combined.includes('ml')) return 'ml';
  if (combined.includes('pct') || combined.includes('pacote')) return 'pct';
  if (combined.includes('cx') || combined.includes('caixa')) return 'cx';
  if (combined.includes('dz') || combined.includes('duzia')) return 'dz';
  return 'un';
}

/**
 * Search products by EAN / Barcode in Open Food Facts API (100% Free & Open)
 */
export async function fetchProductByBarcode(barcode: string): Promise<OFFProductResult | null> {
  try {
    const cleanBarcode = barcode.trim().replace(/\D/g, '');
    if (!cleanBarcode) return null;

    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': 'OrganoCasa - Shopping Assistant - Web App'
      }
    });

    if (!response.ok) return null;
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name_pt || p.product_name || p.generic_name_pt || p.generic_name || 'Produto sem nome';
      const img = p.image_front_url || p.image_url || p.image_small_url;
      const category = mapOFFCategory(p.categories_tags, name);
      const unit = detectUnit(name, p.quantity);

      return {
        code: cleanBarcode,
        product_name: name,
        image_url: img,
        brands: p.brands,
        categories_tags: p.categories_tags,
        quantity: p.quantity,
        category,
        unit
      };
    }
    return null;
  } catch (error) {
    console.warn('Erro ao consultar Open Food Facts por código de barras:', error);
    return null;
  }
}

/**
 * Search products by text query in Open Food Facts API
 */
export async function searchProductsByName(query: string): Promise<OFFProductResult[]> {
  try {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        trimmed
      )}&search_simple=1&action=process&json=1&page_size=10&lc=pt`,
      {
        headers: {
          'User-Agent': 'OrganoCasa - Shopping Assistant - Web App'
        }
      }
    );

    if (!response.ok) return [];
    const data = await response.json();

    if (data.products && Array.isArray(data.products)) {
      return data.products
        .filter((p: any) => p.product_name || p.product_name_pt)
        .map((p: any) => {
          const name = p.product_name_pt || p.product_name;
          const img = p.image_front_url || p.image_url || p.image_small_url;
          const category = mapOFFCategory(p.categories_tags, name);
          const unit = detectUnit(name, p.quantity);

          return {
            code: p.code || '',
            product_name: name,
            image_url: img,
            brands: p.brands,
            categories_tags: p.categories_tags,
            quantity: p.quantity,
            category,
            unit
          };
        });
    }
    return [];
  } catch (error) {
    console.warn('Erro ao buscar produtos no Open Food Facts:', error);
    return [];
  }
}

