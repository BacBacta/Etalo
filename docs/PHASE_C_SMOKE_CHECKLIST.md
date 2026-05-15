# Phase C — Smoke fonctionnel manuel pré-mainnet

**Date génération :** 2026-05-15
**Branche cible :** `main` @ `856ba27` ou plus récent
**Environnement test :** Celo Sepolia testnet
**URL frontend :** https://etalo.vercel.app
**URL backend :** https://etalo-api.fly.dev/api/v1
**Effort attendu :** ~1 h 30 (peut être splitté en 2 sessions)

---

## 0. Pré-flight (5 min)

### Setup wallet
- [ ] Wallet **buyer** prêt (MetaMask ou Trust ou Rabby) avec Celo Sepolia configuré
  - Chain ID `11142220`, RPC `https://celo-sepolia.drpc.org`, symbole `CELO`
- [ ] Wallet **seller** différent (idéalement le `0x3154835dEAf9DF60A7aCaf45955236e73aD84502` shopday)
- [ ] **CELO Sepolia** sur les 2 wallets via https://faucet.celo.org/celo-sepolia
- [ ] **MockUSDT** sur le wallet buyer — adresse contrat `0xea07db5d3D7576864ac434133abFE0E815735300`. Si vide, mint via Celoscan write tab ou demande à un dev.
  - Minimum 50 USDT pour faire 5-10 tests

### Setup browser
- [ ] **Chrome desktop** (DevTools console ouvert pour voir les errors)
- [ ] **Chrome mobile** (sur téléphone ou DevTools emulation Pixel 5 / iPhone 12)
- [ ] Optionnel : **MiniPay** via https://opera.com/products/minipay (Mini App Test mode)

### Pendant les tests
- [ ] Garde la **console DevTools** ouverte → noter les erreurs JS / 4xx / 5xx
- [ ] Note les bugs trouvés en bas du document (section "Bugs trouvés")

---

## 1. Public funnel — pas de wallet requis (10 min)

### 1.1 Chooser landing
- [ ] Va sur `https://etalo.vercel.app`
- [ ] Voir le logo Etalo + 2 CTAs : **"Browse marketplace"** + **"Open my boutique"**
- [ ] Pas de flash blanc avant l'apparition du chooser
- [ ] Theme toggle (sun/moon icon) switch dark/light → tous les éléments visibles

### 1.2 Marketplace browse
- [ ] Click **"Browse marketplace"** → atterrit sur `/marketplace`
- [ ] Voir une grille de produits (au moins 1)
- [ ] Première image se charge **rapidement** (< 3 s)
- [ ] **Search** : tape "hh" → liste filtrée
- [ ] **Country chips** : click NGA / GHA / KEN → liste filtrée
- [ ] **Category chips** : click une catégorie → liste filtrée
- [ ] **Sort dropdown** : change "Price asc" → ordre changé
- [ ] **Refresh button** (icône clockwise) → spinner + reload
- [ ] **Pull-to-refresh** sur mobile : tirer vers le bas → spinner
- [ ] Click "Not now" sur le country prompt banner (si visible) → disparaît

### 1.3 Boutique page
- [ ] Click une product card → `/{handle}/{slug}` (ex: `/shopday/hh`)
- [ ] **Boutique header** affiche logo + shop name + @handle + country
- [ ] Si plusieurs produits : grille visible
- [ ] Pas de raw `0x...` address visible nulle part

### 1.4 Product detail page
- [ ] Click un produit → page detail
- [ ] **Image gallery** : si plusieurs images, swipe/scroll horizontal fonctionne
- [ ] Boutons **prev/next** + **dots pagination** marchent
- [ ] **Title + price + stock** visibles
- [ ] **Description** rendue (whitespace preserved si multi-line)
- [ ] **Share buttons** (WhatsApp / copy link) marchent

---

## 2. Wallet connect (5 min)

### 2.1 Chrome avec MetaMask
- [ ] Sur n'importe quelle page : **ConnectWalletButton** visible en haut à droite
  - Texte = **"Connect wallet"** si MetaMask installé
  - Texte = **"Get MiniPay"** (lien vers Opera) si pas de wallet injecté
- [ ] Click "Connect wallet" → **MetaMask popup**
- [ ] Approve → button disparaît, header montre la chaîne connectée
- [ ] **Refresh la page** → wallet toujours connecté (Wagmi persistence)
- [ ] Disconnect via MetaMask → button "Connect wallet" réapparaît

### 2.2 MiniPay (mobile, optionnel)
- [ ] Ouvre `https://etalo.vercel.app` dans MiniPay
- [ ] **Wallet auto-connect silent** (pas de popup)
- [ ] Le ConnectWalletButton **ne s'affiche pas** (caché en MiniPay)
- [ ] Le wallet du Mini App est utilisé pour les txs

---

## 3. Cart + checkout — single seller (15 min)

### 3.1 Add to cart
- [ ] Sur boutique ou product detail : click le **bouton + (AddToCartIcon)**
- [ ] **Toast** "Added X to cart" apparaît
- [ ] **CartTrigger badge** (en haut) montre "1"
- [ ] Click cart icon → **CartDrawer** s'ouvre
- [ ] Produit visible avec image, prix, qty 1
- [ ] **Increment qty** (+) → 2
- [ ] **Decrement qty** (−) → 1
- [ ] **Remove** (X) → produit disparaît, drawer empty state
- [ ] Re-add le produit pour la suite

### 3.2 Checkout flow
- [ ] Click **"Checkout"** dans le drawer → `/checkout?token=...`
- [ ] **Confirm checkout** card affiche : nb sellers, nb items, total USDT
- [ ] **InlineDeliveryAddressForm** visible avec 6 champs :
  - Recipient name
  - Country (dropdown NGA/GHA/KEN)
  - Phone number
  - City
  - Area / Neighborhood
  - Address details (textarea)
- [ ] Texte tapé est **lisible** (pas blanc-sur-blanc en dark mode)
- [ ] Sélectionne un country → **placeholders changent** (Lagos / Nairobi / Accra)
- [ ] Bouton "Start checkout" **désactivé** tant que required fields vides
- [ ] Remplis tous les fields → bouton **enabled**
- [ ] Click "Start checkout"
- [ ] Si first time : **MetaMask popup #1 — USDT approval**
- [ ] Sign → état "Confirming on-chain…"
- [ ] **MetaMask popup #2 — createOrder**
- [ ] Sign → état update
- [ ] **MetaMask popup #3 — fundOrder**
- [ ] Sign → après ~5-15 s : **CheckoutSuccessView**
- [ ] Voir : "Checkout complete", order ID, tx hashes (create + fund) avec liens Celoscan
- [ ] Click "View my orders" → `/orders`

### 3.3 Edge cases checkout
- [ ] **Reject** la MetaMask popup approval → message "You cancelled the transaction" + bouton retry
- [ ] **Sans wallet** : disconnect MetaMask, retry checkout → voir prompt "Connect a wallet…" avec bouton ConnectWalletButton (pas un QR code)
- [ ] **Token invalide** : ouvre `https://etalo.vercel.app/checkout?token=invalid` → message d'erreur, pas de crash

---

## 4. Cart + checkout — multi-seller (10 min)

- [ ] Add product de **2 sellers différents** au cart
- [ ] CartDrawer affiche **2 groupes** (un par seller) avec leurs subtotals
- [ ] Total combiné en bas
- [ ] Click Checkout → flow ci-dessus mais avec :
  - 1 approval (max sum)
  - 2 createOrder (1 par seller)
  - 2 fundOrder
- [ ] **CheckoutSuccessView** affiche les 2 orders + 4 tx hashes
- [ ] Both orders visible dans `/orders`

---

## 5. Order detail + buyer actions (15 min)

### 5.1 Order list
- [ ] `/orders` montre la liste des commandes du buyer connecté
- [ ] Status badges visibles (Funded / Shipped / etc.)
- [ ] Click une commande → `/orders/[id]`

### 5.2 Order detail
- [ ] **OrderDetailHeader** : status, total, fund timestamp
- [ ] **AutoReleaseTimer** : countdown visible (3 jours intra par ADR-041)
- [ ] **OrderItemsList** : products avec thumbnails + status par item
- [ ] **OrderDeliveryAddressCard** : recipient_name (bold) + city + area + address
- [ ] Pas de **phone number** affiché (ADR-043 privacy)
- [ ] Pas de raw `0x...` du seller
- [ ] **WhatsApp share button** : click → ouvre WhatsApp avec deeplink
- [ ] **Blockscout link** : click → ouvre Celoscan order page

### 5.3 Buyer actions on-chain (avec un order Shipped)
**Préreq** : un order Shipped (le seller a marqué shipped — Section 6.4).

- [ ] **Confirm delivery button** visible
- [ ] Click → MetaMask popup → sign → état "Confirming on-chain…"
- [ ] Après confirmation : message "Delivery confirmed for Item #1"
- [ ] L'item flip à `Released`, l'order flip à `Completed`
- [ ] Refresh page → status persisté

### 5.4 Open dispute (avec un order Funded ou Shipped)
- [ ] Click **"Open dispute"** → dialog s'ouvre
- [ ] Tape une raison ≥ 1 char → bouton submit enabled
- [ ] Submit → MetaMask popup → sign → état "Confirming"
- [ ] Après confirmation : item flip à `Disputed`

### 5.5 Claim refund (avec un order Funded > 7 jours OU si keeper a tourné)
**Préreq** : un order Funded créé ≥ 7 jours avant aujourd'hui.

- [ ] Bouton **"Claim refund"** visible avec note "The seller hasn't shipped within 7 days…"
- [ ] Click → MetaMask popup → sign → état "Confirming"
- [ ] Après ~5-10 s : "Refund sent — your USDT is back in your wallet"
- [ ] Vérifie ton solde USDT MetaMask → augmenté du montant de l'order
- [ ] L'order flip à `Refunded` après le poll de l'indexer (≤ 30 s)

---

## 6. Seller dashboard (15 min)

**Préreq** : connecté avec le wallet seller (`shopday` ou un autre seller existant).

### 6.1 Onboarding (si pas encore seller)
- [ ] `/seller/dashboard` avec un wallet sans profil seller → **OnboardingWizard** s'ouvre
- [ ] Étape 1 : Boutique (shop name, description, country, logo upload)
- [ ] Étape 2 : Premier produit (title, price, stock, image)
- [ ] Submit → profile créé → dashboard accessible

### 6.2 Overview tab
- [ ] **4 KPI tiles** : In escrow, Active orders, Revenue 24h, Revenue 7d
- [ ] Chaque tile montre une valeur ou skeleton (pas de tile vide)
- [ ] **Revenue chart** ligne sur 7 derniers jours (ou empty state "Waiting for your first sale")
- [ ] **Top products** : 3 best-selling avec thumbnails (ou empty state)
- [ ] **Recent orders** : 5 dernières orders

### 6.3 Profile tab
- [ ] Shop name + description editables
- [ ] CountrySelector
- [ ] Save → toast success
- [ ] Refresh → changes persistés

### 6.4 Products tab
- [ ] Liste des produits seller avec images + prix + stock
- [ ] Click **"+ Add product"** → ProductFormDialog s'ouvre
- [ ] Form fields : Title (slug auto-généré), Description, Price, Stock, Category, Status, Images
- [ ] Upload une image → preview thumbnail
- [ ] Click **"Enhance photo · 1 credit"** (si crédit dispo)
- [ ] Loading → preview avec 4 variants white-background
- [ ] Click "Use this variant" sur une → image swap
- [ ] OR click "Keep original" → image originale conservée (crédit consommé quand même)
- [ ] Click **"Create product"** → toast success, dialog ferme
- [ ] Le produit apparaît dans la liste
- [ ] Click **edit** sur un produit → form pré-rempli, slug locked
- [ ] Edit, save → changes persistés
- [ ] Click **delete** → confirmation dialog → confirm → produit disparaît

### 6.5 Orders tab
- [ ] Liste des commandes par buyer
- [ ] Click toggle **"Pick list"** (avec ←/→ keyboard)
- [ ] **Pick list view** : SKUs roll-up avec qty × N + deadline countdown
- [ ] **Buyer label** anonymisé (ex: "Buyer in Lagos") — jamais `0x...`
- [ ] **Phone number** PAS visible (privacy)
- [ ] Si une order n'est pas encore fund → pas de delivery address visible
- [ ] Si une order est fund → delivery address inline avec recipient + area
- [ ] **Mark shipped** button (sur une order Funded) → MarkGroupShippedDialog
- [ ] Submit shipping group → MetaMask popup → sign → order flip à `PartiallyShipped` ou `AllShipped`
- [ ] Refresh → ordersStatus persisté

---

## 7. Edge cases globaux (10 min)

- [ ] Click **logo Etalo** depuis n'importe quelle page → atterrit sur `/` chooser (pas marketplace)
- [ ] Open `/orders/non-existent-id` → "Order not found" surface, pas de white screen
- [ ] Open `/[handle-inexistant]` → 404 page
- [ ] Open `/marketplace?country=XYZ` (invalid) → fallback "all"
- [ ] **Theme toggle** : switch dark/light sur **chaque** page, vérifier que rien ne brûle blanc-sur-blanc
- [ ] **Mobile** : pas de **horizontal scroll** sur aucune page
- [ ] **Mobile** : tous les boutons cliquables sans manquer (touch ≥ 44 px)
- [ ] Open DevTools console → **0 errors JS rouges** sur le happy path
- [ ] Open DevTools network → **0 requests 4xx/5xx** (sauf optionnels comme cart token expired)

---

## 8. Auto-refund keeper validation (5 min, optionnel)

- [ ] Vérifie que le keeper tourne :
  ```
  fly logs -a etalo-api --no-tail | grep auto_refund_keeper
  ```
- [ ] Doit afficher `auto_refund_keeper.initialised relayer=0xFBF50A1c8b8c7735dCFbEb40bB3413aE21918AdB`
- [ ] Doit afficher périodiquement `auto_refund_keeper.scan_started candidates=N`
- [ ] Si une order > 7d est Funded sans shipping → keeper tente le refund automatique
  - Voir `auto_refund_keeper.refund_sent` puis `refund_confirmed`

---

## 📋 Bugs trouvés (à remplir pendant les tests)

### Critique (P0 — empêche d'utiliser une fonction)

- [ ] _bug 1 : ..._
- [ ] _bug 2 : ..._

### Sévérité moyenne (P1 — fonction marche mais UX dégradée)

- [ ] _bug 1 : ..._

### Polish (P2 — visuel ou nice-to-have)

- [ ] _bug 1 : ..._

---

## ✅ Sign-off

- [ ] **Section 1 publique** verte sur Chrome desktop + mobile
- [ ] **Section 2 wallet** verte
- [ ] **Section 3 checkout single** verte (≥ 1 order créée on-chain)
- [ ] **Section 4 multi-seller** verte (≥ 1 multi-order créée)
- [ ] **Section 5 order detail** + buyer actions verte (≥ 1 confirm delivery OR claim refund réussi)
- [ ] **Section 6 seller** verte (CRUD produit + mark shipped réussis)
- [ ] **Section 7 edge cases** verte
- [ ] **0 P0 bug** trouvé OU tous les P0 fixés

**Si tous coches verts** → engineering OK pour mainnet J12 deploy.
