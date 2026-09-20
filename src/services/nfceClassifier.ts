/**
 * Classificador e extrator de parâmetros puros de QR Code e NFC-e do Brasil
 * Em conformidade com o Manual de Padrões Técnicos do DANFE NFC-e e QR Code v2.0 / v3.0
 */

export interface ParsedNfceQrMetadata {
  isNfce: boolean;
  accessKey?: string; // 44 dígitos
  ufCode?: string; // Ex: 52 (GO), 35 (SP), 43 (RS)
  stateName?: string;
  cnpj?: string; // 14 dígitos formatado
  totalAmount?: number; // vNF (valor total)
  emissionDate?: string; // ISO format
  environment?: 'production' | 'homologation';
  qrVersion?: string;
  rawUrl?: string;
}

export type ScannedCodeType =
  | { type: 'nfce'; metadata: ParsedNfceQrMetadata }
  | { type: 'barcode_ean'; barcode: string }
  | { type: 'text'; content: string };

const UF_CODES: Record<string, string> = {
  '52': 'Goiás (GO)',
  '53': 'Distrito Federal (DF)',
  '35': 'São Paulo (SP)',
  '31': 'Minas Gerais (MG)',
  '33': 'Rio de Janeiro (RJ)',
  '41': 'Paraná (PR)',
  '43': 'Rio Grande do Sul (RS)',
  '42': 'Santa Catarina (SC)',
  '29': 'Bahia (BA)',
  '51': 'Mato Grosso (MT)',
  '50': 'Mato Grosso do Sul (MS)',
  '23': 'Ceará (CE)',
  '26': 'Pernambuco (PE)',
  '32': 'Espírito Santo (ES)',
  '15': 'Pará (PA)',
  '21': 'Maranhão (MA)',
  '25': 'Paraíba (PB)',
  '24': 'Rio Grande do Norte (RN)',
  '27': 'Alagoas (AL)',
  '28': 'Sergipe (SE)',
  '22': 'Piauí (PI)',
  '13': 'Amazonas (AM)',
  '11': 'Rondônia (RO)',
  '12': 'Acre (AC)',
  '14': 'Roraima (RR)',
  '16': 'Amapá (AP)',
  '17': 'Tocantins (TO)'
};

function formatCNPJ(cnpjRaw: string): string {
  if (cnpjRaw.length !== 14) return cnpjRaw;
  return `${cnpjRaw.substring(0, 2)}.${cnpjRaw.substring(2, 5)}.${cnpjRaw.substring(5, 8)}/${cnpjRaw.substring(8, 12)}-${cnpjRaw.substring(12, 14)}`;
}

/**
 * Extrai metadados completos de uma URL de QR Code de NFC-e ou chave de acesso de 44 dígitos
 */
export function parseNfceQrParams(input: string): ParsedNfceQrMetadata {
  const trimmed = input.trim();
  let accessKey: string | undefined;
  let totalAmount: number | undefined;
  let emissionDate: string | undefined;
  let environment: 'production' | 'homologation' | undefined;
  let qrVersion: string | undefined;

  // 1. Tentar encontrar chave de 44 dígitos (contíguos ou separados por espaços/pontos)
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 44) {
    accessKey = digitsOnly;
  } else {
    const match44 = trimmed.replace(/[\s\.\-\/]/g, '').match(/\b(\d{44})\b/);
    if (match44) {
      accessKey = match44[1];
    }
  }

  // 2. Extrair parâmetros se for URL
  const isUrlLike =
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('sefaz.') ||
    trimmed.includes('fazenda.') ||
    trimmed.includes('nfce.') ||
    trimmed.includes('nfeweb.') ||
    trimmed.includes('?p=') ||
    trimmed.includes('&p=') ||
    trimmed.includes('chaveAcesso=');

  if (isUrlLike) {
    let urlString = trimmed;
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'https://' + urlString;
    }

    try {
      const url = new URL(urlString);
      const chNFeParam =
        url.searchParams.get('chNFe') ||
        url.searchParams.get('chaveAcesso') ||
        url.searchParams.get('chave') ||
        url.searchParams.get('p');
      const pParam = url.searchParams.get('p') || url.searchParams.get('chave') || url.searchParams.get('qrcode');

      if (chNFeParam && !pParam?.includes('|')) {
        const cleaned = chNFeParam.replace(/\D/g, '');
        if (cleaned.length >= 44) {
          accessKey = cleaned.substring(0, 44);
        }
      }

      if (pParam) {
        const decodedP = decodeURIComponent(pParam);
        const parts = decodedP.split('|');

        // Posição 0: Chave de Acesso (44 dígitos)
        if (parts.length >= 1 && !accessKey) {
          const cleanedKey = parts[0].replace(/\D/g, '');
          if (cleanedKey.length >= 44) {
            accessKey = cleanedKey.substring(0, 44);
          }
        }

        // Posição 1: Versão do QR Code (ex: 2)
        if (parts.length >= 2) {
          qrVersion = parts[1].trim();
        }

        // Posição 2: Tipo de Ambiente (1 = Produção, 2 = Homologação)
        if (parts.length >= 3) {
          environment = parts[2].trim() === '1' ? 'production' : 'homologation';
        }

        // Procurar valor total nas posições subsequentes (ex: 118.64 ou 118,64)
        for (let i = 3; i < parts.length; i++) {
          const token = parts[i].trim();
          if (token.match(/^\d+[\.,]\d{2}$/)) {
            const val = parseFloat(token.replace(',', '.'));
            if (val > 0 && !totalAmount) {
              totalAmount = val;
            }
          }
        }
      }
    } catch {
      // Ignora erro de parsing de URL malformada
    }
  }

  // 3. Se temos a chave de 44 dígitos, decodificar UF, CNPJ e data aproximada da chave
  let ufCode: string | undefined;
  let stateName: string | undefined;
  let cnpj: string | undefined;

  if (accessKey && accessKey.length === 44) {
    ufCode = accessKey.substring(0, 2);
    stateName = UF_CODES[ufCode] || 'Brasil';
    const yy = accessKey.substring(2, 4);
    const mm = accessKey.substring(4, 6);
    const cnpjRaw = accessKey.substring(6, 20);
    cnpj = formatCNPJ(cnpjRaw);

    const emissionYear = 2000 + parseInt(yy, 10);
    const emissionMonth = parseInt(mm, 10) - 1;
    if (emissionYear >= 2020 && emissionYear <= 2035 && emissionMonth >= 0 && emissionMonth <= 11) {
      emissionDate = new Date(emissionYear, emissionMonth, 1).toISOString();
    }
  }

  const isNfce = Boolean(accessKey && accessKey.length === 44);

  return {
    isNfce,
    accessKey,
    ufCode,
    stateName,
    cnpj,
    totalAmount,
    emissionDate,
    environment,
    qrVersion,
    rawUrl: isUrlLike ? trimmed : undefined
  };
}

/**
 * Classificador do conteúdo bruto escaneado pelo leitor de código
 */
export function classifyScannedCode(rawText: string): ScannedCodeType {
  const trimmed = rawText.trim();

  // 1. Código de barras de produto puro (EAN-8, EAN-13, UPC)
  if (/^\d{8}$/.test(trimmed) || /^\d{12,14}$/.test(trimmed)) {
    return {
      type: 'barcode_ean',
      barcode: trimmed
    };
  }

  // 2. NFC-e (URL de portal fiscal ou Chave de 44 dígitos)
  const nfceMeta = parseNfceQrParams(trimmed);
  if (nfceMeta.isNfce) {
    return {
      type: 'nfce',
      metadata: nfceMeta
    };
  }

  // 3. Qualquer outro texto genérico
  return {
    type: 'text',
    content: trimmed
  };
}

export function formatAccessKey(rawKey: string): string {
  const digits = rawKey.replace(/\D/g, '').slice(0, 44);
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(' ');
}

export interface KeyInspection {
  isValid: boolean;
  rawDigits: string;
  formatted: string;
  digitsCount: number;
  ufCode?: string;
  stateName?: string;
  cnpjFormatted?: string;
  emissionYear?: number;
  emissionMonth?: number;
  modelCode?: string;
  modelLabel?: string;
  series?: string;
  number?: number;
}

export function inspectAccessKey(rawInput: string): KeyInspection {
  const digits = rawInput.replace(/\D/g, '').slice(0, 44);
  const digitsCount = digits.length;
  const formatted = formatAccessKey(digits);

  if (digitsCount < 44) {
    return {
      isValid: false,
      rawDigits: digits,
      formatted,
      digitsCount
    };
  }

  const ufCode = digits.substring(0, 2);
  const yy = digits.substring(2, 4);
  const mm = digits.substring(4, 6);
  const cnpjRaw = digits.substring(6, 20);
  const modelCode = digits.substring(20, 22);
  const series = digits.substring(22, 25);
  const nNF = parseInt(digits.substring(25, 34), 10);

  const stateName = UF_CODES[ufCode] || 'Outro Estado';
  const emissionYear = 2000 + parseInt(yy, 10);
  const emissionMonth = parseInt(mm, 10);
  const cnpjFormatted = formatCNPJ(cnpjRaw);
  const modelLabel =
    modelCode === '65' ? 'NFC-e (Consumidor)' : modelCode === '55' ? 'NF-e (Mercadoria)' : `Modelo ${modelCode}`;

  return {
    isValid: true,
    rawDigits: digits,
    formatted,
    digitsCount,
    ufCode,
    stateName,
    cnpjFormatted,
    emissionYear,
    emissionMonth,
    modelCode,
    modelLabel,
    series,
    number: isNaN(nNF) ? undefined : nNF
  };
}

