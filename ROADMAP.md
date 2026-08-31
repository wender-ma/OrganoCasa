# 🗺️ Roadmap de Implementação Completa - OrganoCasa

Este documento apresenta o plano estratégico e detalhado de evolução do **OrganoCasa** em 5 fases contínuas, mantendo o compromisso de **custo zero de infraestrutura (100% Free)**, arquitetura **Offline-First**, **Visão Computacional para Notas Fiscais**, **Colaboração Familiar** e **Design Mobile-First**.

---

## 📊 Visão Geral das Fases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fase 1: Fundação & PWA Offline-First (Concluída)                           │
│  - IndexedDB Dexie.js + Lista de Compras + Preço Médio + Lembretes          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fase 2: Visão Computacional & Extração de NFs com IA (Próxima)             │
│  - IA multimodal para leitura de cupons de qualquer mercado + OCR otimizado │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fase 3: Colaboração Familiar & Nuvem Gratuita (Supabase)                   │
│  - Login por E-mail/Senha + Convite familiar + Sync em tempo real           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fase 4: Alertas Pós-Compra & Notificações de Prazos                        │
│  - Alertas de itens esquecidos + Lembretes com data limite no PWA           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Fase 5: Deploy Contínuo & Distribuição PWA                                 │
│  - Vercel / Cloudflare Pages + Instalação nativa em Android e iOS           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Detalhamento das Fases

### 🟢 FASE 1: Fundação, Usabilidade & PWA Offline-First
> **Status:** ✅ Concluída & Operacional

- [x] **Arquitetura Local-First**: Banco de dados reativo IndexedDB (`Dexie.js`) com latência zero e suporte 100% offline.
- [x] **Lista de Compras Mobile-First**:
  - Filtro ágil por categorias do supermercado (*Hortifrúti, Carnes, Laticínios, Mercearia, Limpeza, etc.*).
  - Controle de quantidades e unidades (`un`, `kg`, `g`, `l`, `pct`, `cx`, `dz`).
  - Barra de progresso do carrinho e acompanhamento do valor total estimado vs. total pego.
- [x] **Preço Médio & Histórico Clicável**:
  - Média ponderada calculada em tempo real com base nos registros de compra.
  - Modal interativo de linha do tempo com data, estabelecimento, quantidade e valor pago.
- [x] **Aba de Lembretes da Casa ("Pegar Itens na Sogra")**:
  - Lembretes com checklists de sub-itens individuais.
  - Cadastro e atribuição de membros da casa (*nome, cor, emoji*).
- [x] **Leitor Híbrido de Notas Fiscais**:
  - Scanner de QR Code SEFAZ pela câmera / link.
  - Leitor de arquivos XML de NFC-e.
  - Tela de Conciliação Inteligente (*Comprados*, *Deixou de Comprar* e *Compras Extras*).

---

### 🔍 FASE 2: Visão Computacional & Extração de NFs com IA
> **Objetivo:** Permitir que o usuário tire fotos de cupons térmicos amassados/apagados de qualquer supermercado e extraia os itens com alta precisão via IA gratuita.

- [ ] **Integração com IA Multimodal Gratuita (Gemini Flash API)**:
  - Envio da foto do cupom fiscal diretamente para modelo de visão gratuito, retornando JSON estritamente estruturado com razão social, data, CNPJ, itens, quantidades, valores unitários e total.
- [ ] **Pré-processamento de Imagem no Cliente (Canvas)**:
  - Auto-rotação e corte de bordas do papel.
  - Aumento de contraste e binarização para leitura de impressões térmicas claras.
- [ ] **Extração de Descontos e Promoções**:
  - Identificação de promoções do tipo *"Leve 3 Pague 2"* ou desconto de clube de fidelidade do mercado para registrar o preço unitário real pago.
- [ ] **Feedback de Leitura com Scanner Guiado**:
  - Interface com guia visual na câmera para enquadrar a nota fiscal e tirar foto com 1 toque.

---

### 👨‍👩‍👧 FASE 3: Colaboração Familiar & Nuvem Gratuita (Supabase)
> **Objetivo:** Permitir que marido, esposa e familiares acessem e editem a mesma lista de compras e lembretes em tempo real de aparelhos diferentes.

- [ ] **Autenticação Gratuita (Supabase Auth)**:
  - Cadastro simples e login por E-mail e Senha ou Magic Link (sem custos).
- [ ] **Modelo de Família / Casa Compartilhada**:
  - Criação de "Espaço Familiar" onde um usuário convida outros membros da casa via e-mail ou link de convite.
- [ ] **Motor de Sincronização Bidirecional (Local-First Sync)**:
  - Se estiver offline no mercado, todas as alterações são salvas no IndexedDB local.
  - Ao reconectar à internet, uma fila de sincronização em segundo plano atualiza o Supabase e dispara eventos Realtime para os outros aparelhos da família.
- [ ] **Backup e Restauração Automática**:
  - Cópia de segurança em nuvem de todo o histórico de preços e listas.

---

### 🔔 FASE 4: Alertas Pós-Compra & Notificações de Prazos
> **Objetivo:** Notificar o usuário sobre pendências e reforçar o que ele deixou de comprar no mercado.

- [ ] **Alertas de Itens Esquecidos no Pós-Compra**:
  - Modal pós-conciliação com resumo direto: *"Você deixou de comprar 2 itens planejados (ex: Café e Detergente). Deseja mantê-los na lista para a próxima compra?"*.
- [ ] **Notificações Locais do Navegador / PWA (Web Push API)**:
  - Notificação de lembretes com data de vencimento (ex: *"Amanhã é dia de pegar os itens na casa da sogra"*).
  - Notificação quando um membro da família adicionar um item urgente na lista.
- [ ] **Dashboard Resumo do Mês**:
  - Card compacto com o total economizado e comparativo de gastos com supermercado em relação ao mês anterior.

---

### 🌐 FASE 5: Deploy Contínuo, PWA Store & Produção 100% Free
> **Objetivo:** Disponibilizar o OrganoCasa online com link seguro (HTTPS) para acesso em qualquer celular ou computador sem custos de servidor.

- [ ] **Deploy Automatizado na Vercel / Cloudflare Pages**:
  - Configuração de build contínuo via GitHub (cada `git push` atualiza o app em segundos).
  - Certificado SSL/HTTPS automático e CDN global com carregamento instantâneo.
- [ ] **Otimização PWA para Telas de Início**:
  - Splash screens personalizadas para iOS (Apple Touch Icons) e Android.
  - Suporte a Atalhos Rápidos na tela inicial (ex: segurar o ícone do app e clicar em *"Adicionar Item"* ou *"Ler Nota"*).
- [ ] **Manual do Usuário & Guia de Instalação**:
  - Banner explicativo dentro do app ensinando o usuário a instalar o PWA no iPhone (Safari) e Android (Chrome).

---

## 🗓️ Cronograma Sugerido de Execução

| Fase | Foco Principal | Duração Estimada | Dependências |
| :--- | :--- | :--- | :--- |
| **Fase 1** | Fundação Local-First, Preço Médio & Lembretes | ✅ Concluída | Nenhuma |
| **Fase 2** | Visão Computacional / IA em Cupons Fiscais | 2 a 3 dias | Fase 1 |
| **Fase 3** | Login por E-mail & Sync Familiar no Supabase | 3 a 4 dias | Fase 1 |
| **Fase 4** | Notificações PWA & Alertas Pós-Compra | 2 dias | Fase 2 e 3 |
| **Fase 5** | Deploy na Vercel/Cloudflare & Otimização PWA | 1 dia | Fase 1 |

---

## 💡 Princípios de Engenharia Mantidos

1. **Custo Zero Vitalício**: Uso estrito de ferramentas e planos gratuitos (Vercel, Supabase Free Tier, Gemini Free API, Open Food Facts, IndexedDB).
2. **Offline-First Sempre**: O app nunca deve travar ou ficar inacessível caso o sinal de internet caia dentro do supermercado.
3. **Privacidade Total**: Dados de notas fiscais e listas pertencem exclusivamente ao usuário e à sua família.

