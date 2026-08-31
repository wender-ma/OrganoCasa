# OrganoCasa 🛒🏠

**OrganoCasa** é um aplicativo Web Mobile-First (PWA) de listas de compras inteligentes para supermercado, conciliação de notas fiscais e gerenciador de afazeres/lembretes da casa, projetado para operar **100% offline (Local-First)** com **sincronização em nuvem e tempo real via Supabase** e hospedagem gratuita no **Vercel**.

---

## 📖 [Clique aqui para o Guia de Deploy no Vercel & Supabase](./DEPLOY_SUPABASE_VERCEL.md)

---

## ✨ Funcionalidades Principais

### 1. 🛒 Lista de Compras Inteligente & Priorização de Marcas
- **🥇 1ª Opção (Marca Preferida) & 🥈/🥉 Alternativas (2ª e 3ª Opções)**: Defina a marca favorita e até duas marcas reservas para quando a principal estiver em falta. No supermercado, basta tocar na marca alternativa para registrar a troca na hora.
- **📸 Foto da Embalagem do Produto**: Tire foto do produto com a câmera, faça upload ou utilize o botão *"Buscar Foto"* integrado ao Open Food Facts.
- **🔍 Modo Ampliado de Embalagem (Zoom)**: Toque na foto de qualquer item para abrir a foto em tela cheia com o quadro de marcas prioritárias.
- **Funcionamento 100% Offline (Local-First)**: Salva instantaneamente no IndexedDB (Dexie.js) mesmo sem sinal de celular.
- **Divisão Automática por Categorias**: Hortifrúti, Carnes, Laticínios, Mercearia, Limpeza, etc.
- **Acompanhamento Orçamentário**: Barra de progresso visual, total estimado e valor acumulado no carrinho.

### 2. ☁️ Sincronização em Nuvem & Colaboração Familiar (Supabase + Realtime)
- **Sincronização em Tempo Real (WebSockets)**: Quando o cônjuge ou familiar marca um item no mercado, a tela do outro celular atualiza instantaneamente!
- **Código de Convite Familiar**: Conecte celulares da mesma casa compartilhando um código simples (ex: `CASA-982314`).
- **Autenticação Segura & Row Level Security (RLS)**: Isolamento total entre diferentes residências.
- **Backup & Portabilidade JSON**: Exporte e importe a base de dados a qualquer momento em 1 clique.

### 3. 🏷️ Preço Médio & Histórico Completo Clicável
- Em cada produto da lista ou do catálogo, visualize o **Preço Médio Pago** e o **Último Preço Pago**.
- **Linha do Tempo de Preços**: Toque no valor para ver histórico detalhado por data e supermercado.

### 4. 🧾 Leitura de Notas Fiscais & Conciliação Inteligente
- **Multi-Formato**:
  - 📷 **Leitor de QR Code**: Escaneie o QR Code da NFC-e da SEFAZ com a câmera do celular ou cole o link/chave de 44 dígitos.
  - 📄 **Upload de XML**: Leitor do arquivo oficial da NF-e / NFC-e.
  - 🤖 **Foto do Cupom com IA / OCR**: Extração multimodal com IA Gemini e motor local Tesseract.js.
- **Tela de Conciliação Interativa**:
  - 🟢 **✅ Comprados**: Dá baixa nos itens da lista e atualiza o histórico de preços.
  - 🟡 **⚠️ Deixou de Comprar**: Alerta de itens planejados que faltaram na compra.
  - 🔵 **➕ Compras Extras**: Destaca itens não previstos e permite cadastrá-los no catálogo.

### 5. 📋 Lembretes & Tarefas da Casa ("Pegar Itens na Sogra")
- Aba dedicada para afazeres domésticos e compras em outros locais.
- **Checklists com Caixas de Marcar**: Ex: *"Pegar itens na casa da sogra: - arroz [ ], - manteiga [ ]"*.
- **Membros da Família**: Delegue tarefas para cada pessoa da casa.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento
npm run dev

# 3. Gerar build de produção para PWA
npm run build
```

---

## 🌐 Publicação no Vercel e Supabase

Consulte o passo a passo detalhado em **[`DEPLOY_SUPABASE_VERCEL.md`](./DEPLOY_SUPABASE_VERCEL.md)** para criar seu banco no Supabase e publicar o projeto no Vercel em menos de 5 minutos!

---

## 💰 Custo Zero de Manutenção (100% Free)
- **Frontend & PWA**: Vercel (Hospedagem gratuita com SSL e CDN global).
- **Banco de Dados & Realtime**: Supabase Free Tier (PostgreSQL + WebSockets + Auth).
- **IA Opcional**: Google AI Studio (Gemini 1.5 Flash gratuito).
