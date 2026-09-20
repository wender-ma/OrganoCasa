const QRCode = require('qrcode');
const jsQR = require('jsqr');

async function runPipelineTest() {
  console.log('=== TESTE AUTOMATIZADO DO PIPELINE DE LEITURA (jsQR) ===');

  // Teste 1: QR Simples ("teste")
  const simpleText = 'teste';
  const simpleRaw = await QRCode.create(simpleText);
  const simpleSize = simpleRaw.modules.size;
  const scale = 10;
  const imgWidth = simpleSize * scale;
  const imgHeight = simpleSize * scale;

  const rgbaData = new Uint8ClampedArray(imgWidth * imgHeight * 4);
  for (let r = 0; r < simpleSize; r++) {
    for (let c = 0; c < simpleSize; c++) {
      const isDark = simpleRaw.modules.get(r, c);
      const color = isDark ? 0 : 255;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = (((r * scale + sy) * imgWidth) + (c * scale + sx)) * 4;
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
    console.log('✓ Teste 1 (QR Simples - "teste"): SUCESSO! Detectado:', res1.data);
  } else {
    console.error('✗ Teste 1 (QR Simples): FALHOU!', res1);
    process.exit(1);
  }

  // Teste 2: QR Denso de NFC-e Real (223 caracteres)
  const denseUrl =
    'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=52260945543915027896650790000946101124108858%7C2%7C1%7C1%7CE3A7BDEA2F3ACFD4691A3A70DD6F2D972F3F37BD';
  const denseRaw = await QRCode.create(denseUrl);
  const denseSize = denseRaw.modules.size;
  const denseScale = 8;
  const dWidth = denseSize * denseScale;
  const dHeight = denseSize * denseScale;

  const denseRgba = new Uint8ClampedArray(dWidth * dHeight * 4);
  for (let r = 0; r < denseSize; r++) {
    for (let c = 0; c < denseSize; c++) {
      const isDark = denseRaw.modules.get(r, c);
      const color = isDark ? 0 : 255;
      for (let sy = 0; sy < denseScale; sy++) {
        for (let sx = 0; sx < denseScale; sx++) {
          const idx = (((r * denseScale + sy) * dWidth) + (c * denseScale + sx)) * 4;
          denseRgba[idx] = color;
          denseRgba[idx + 1] = color;
          denseRgba[idx + 2] = color;
          denseRgba[idx + 3] = 255;
        }
      }
    }
  }

  const res2 = jsQR(denseRgba, dWidth, dHeight, { inversionAttempts: 'attemptBoth' });
  if (res2 && res2.data === denseUrl) {
    console.log('✓ Teste 2 (QR Denso NFC-e - 223 chars): SUCESSO! Detectado com precisão!');
  } else {
    console.error('✗ Teste 2 (QR Denso): FALHOU!', res2);
    process.exit(1);
  }

  console.log('=== TODOS OS TESTES DO PIPELINE PASSARAM! ===');
}

runPipelineTest();
