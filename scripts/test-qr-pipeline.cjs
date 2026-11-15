const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { prepareZXingModule, readBarcodesFromImageData } = require('zxing-wasm/reader');
const {
  parseSefazHtml,
  isAllowedSefazUrl,
  normalizeSefazTarget,
  isBlockedOrErrorHtml
} = require('../api/fetch-sefaz.js');

async function runPipelineTest() {
  console.log('=== TESTE AUTOMATIZADO DO PIPELINE DE LEITURA (ZXing-WASM + jsQR + SEFAZ) ===');

  // Inicializar ZXing-WASM local
  const wasmPath = path.resolve(__dirname, '../public/wasm/zxing_reader.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  await prepareZXingModule({
    overrides: {
      wasmBinary: wasmBinary.buffer.slice(
        wasmBinary.byteOffset,
        wasmBinary.byteOffset + wasmBinary.byteLength
      )
    }
  });

  // Teste 1: QR Simples ("teste")
  const simpleText = 'teste';
  const simpleRaw = await QRCode.create(simpleText);
  const simpleSize = simpleRaw.modules.size;
  const scale = 10;
  const pad = 4;
  const totalMods = simpleSize + pad * 2;
  const imgWidth = totalMods * scale;
  const imgHeight = totalMods * scale;

  const rgbaData = new Uint8ClampedArray(imgWidth * imgHeight * 4).fill(255);
  for (let r = 0; r < simpleSize; r++) {
    for (let c = 0; c < simpleSize; c++) {
      const isDark = simpleRaw.modules.get(r, c);
      const color = isDark ? 0 : 255;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = (((r + pad) * scale + sy) * imgWidth + ((c + pad) * scale + sx)) * 4;
          rgbaData[idx] = color;
          rgbaData[idx + 1] = color;
          rgbaData[idx + 2] = color;
          rgbaData[idx + 3] = 255;
        }
      }
    }
  }

  const res1 = jsQR(rgbaData, imgWidth, imgHeight, { inversionAttempts: 'attemptBoth' });
  if (res1 && res1.data === simpleText) {
    console.log('✓ Teste 1 (jsQR Simples - "teste"): SUCESSO!');
  } else {
    console.error('✗ Teste 1 (jsQR Simples): FALHOU!', res1);
    process.exit(1);
  }

  // Teste 2: QR Denso de NFC-e Real (223 caracteres) com ZXing-WASM + jsQR
  const denseUrl =
    'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=52260945543915027896650790000946101124108858%7C2%7C1%7C1%7CE3A7BDEA2F3ACFD4691A3A70DD6F2D972F3F37BD';
  const denseRaw = await QRCode.create(denseUrl);
  const denseSize = denseRaw.modules.size;
  const denseScale = 6;
  const dTotalMods = denseSize + pad * 2;
  const dWidth = dTotalMods * denseScale;
  const dHeight = dTotalMods * denseScale;

  const denseRgba = new Uint8ClampedArray(dWidth * dHeight * 4).fill(255);
  for (let r = 0; r < denseSize; r++) {
    for (let c = 0; c < denseSize; c++) {
      const isDark = denseRaw.modules.get(r, c);
      const color = isDark ? 0 : 255;
      for (let sy = 0; sy < denseScale; sy++) {
        for (let sx = 0; sx < denseScale; sx++) {
          const idx = (((r + pad) * denseScale + sy) * dWidth + ((c + pad) * denseScale + sx)) * 4;
          denseRgba[idx] = color;
          denseRgba[idx + 1] = color;
          denseRgba[idx + 2] = color;
          denseRgba[idx + 3] = 255;
        }
      }
    }
  }

  const zxingRes = await readBarcodesFromImageData(
    { data: denseRgba, width: dWidth, height: dHeight },
    { tryHarder: true, formats: ['QRCode', 'Code128', 'EAN-13'] }
  );
  if (zxingRes && zxingRes.length > 0 && zxingRes[0].text === denseUrl) {
    console.log('✓ Teste 2 (ZXing-WASM C++ QR Denso NFC-e - 223 chars): SUCESSO!');
  } else {
    console.error('✗ Teste 2 (ZXing-WASM QR Denso): FALHOU!', zxingRes);
    process.exit(1);
  }

  // Teste 3: Reescrita de URL SEFAZ-GO e extração de chave
  const norm = normalizeSefazTarget(
    'http://www.sefaz.go.gov.br/nfce/consulta?p=52260945543915027896650790000946101124108858|2|1|1|E3A7BDEA',
    ''
  );
  if (
    norm.accessKey === '52260945543915027896650790000946101124108858' &&
    norm.targetUrl.startsWith('https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=')
  ) {
    console.log('✓ Teste 3 (Reescrita SEFAZ-GO anti-redirect 302): SUCESSO!');
  } else {
    console.error('✗ Teste 3 FALHOU:', norm);
    process.exit(1);
  }

  // Teste 4: Detecção de bloqueio WAF F5 BigIP e Erro 503
  if (
    isBlockedOrErrorHtml('<html><body>Acesso Negado - bloqueada por nossa política de segurança</body></html>') &&
    isBlockedOrErrorHtml('<html><head><title>Algo deu errado!</title></head><body>503</body></html>') &&
    !isAllowedSefazUrl('https://evil.example.com/nfce') &&
    isAllowedSefazUrl('https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe')
  ) {
    console.log('✓ Teste 4 (Detecção WAF/503 + Anti-SSRF): SUCESSO!');
  } else {
    console.error('✗ Teste 4 FALHOU!');
    process.exit(1);
  }

  // Teste 5: Parse de HTML real SEFAZ com produtos acentuados
  const sampleHtml = `
    <div id="u20" class="txtTopo">SUPERMERCADO PRO BRASIL LTDA</div>
    <table id="tabResult">
      <tr id="Item + 1">
        <td>
          <span class="txtTit">FEIJÃO CARIOCA 1KG</span>
          <span class="Rqtd"><strong>Qtde.:</strong> 2</span>
          <span class="RUN"><strong>UN:</strong> PCT</span>
          <span class="RvlUnit"><strong>Vl. Unit.:</strong> 8,50</span>
        </td>
        <td><span class="valor">17,00</span></td>
      </tr>
    </table>
    <label>Valor a pagar R$:</label><span class="totalNumb txtMax">17,00</span>
  `;
  const parsed = parseSefazHtml(sampleHtml, '52260945543915027896650790000946101124108858');
  if (
    parsed.success &&
    parsed.items.length === 1 &&
    parsed.items[0].name === 'FEIJÃO CARIOCA 1KG' &&
    parsed.items[0].totalPrice === 17
  ) {
    console.log('✓ Teste 5 (Parse HTML SEFAZ acentuado): SUCESSO!');
  } else {
    console.error('✗ Teste 5 FALHOU:', parsed);
    process.exit(1);
  }

  // Teste 6: Parse de HTML SEFAZ sem <strong> dentro de Rqtd/RUN e com separador de milhar (1.250,00)
  const sampleHtmlNoStrong = `
    <div id="u20" class="txtTopo">ATACADÃO S.A.</div>
    <table id="tabResult">
      <tr id="Item + 1">
        <td>
          <span class="txtTit">CESTA BÁSICA ATACADO</span>
          <span class="Rqtd">10</span>
          <span class="RUN">CX</span>
          <span class="RvlUnit"><strong>Vl. Unit.:</strong> 125,00</span>
        </td>
        <td><span class="valor">1.250,00</span></td>
      </tr>
    </table>
    <label>Valor a pagar R$:</label><span class="totalNumb txtMax">1.250,00</span>
  `;
  const parsed6 = parseSefazHtml(
    sampleHtmlNoStrong,
    '52260945543915027896650790000946101124108858'
  );
  if (
    parsed6.success &&
    parsed6.totalAmount === 1250 &&
    parsed6.items[0].quantity === 10 &&
    parsed6.items[0].unit === 'cx' &&
    parsed6.items[0].totalPrice === 1250
  ) {
    console.log('✓ Teste 6 (Parse Rqtd sem <strong> + separador de milhar 1.250,00): SUCESSO!');
  } else {
    console.error('✗ Teste 6 FALHOU:', parsed6);
    process.exit(1);
  }

  console.log('=== TODOS OS TESTES DO PIPELINE PASSARAM! ===');
}

runPipelineTest();

