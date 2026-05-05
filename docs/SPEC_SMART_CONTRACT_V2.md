# Etalo Smart Contract V2 — Spécification Technique

**Version** : 1.0  
**Date** : 23 avril 2026  
**Auteur** : Mike (Etalo)  
**Statut** : Spécification du refactor — source de vérité pour l'implémentation Sprint J4

---

## 1. Résumé exécutif

### 1.1 Objectif du refactor

Passer du contrat V1 (1 order = 1 item, custodial relatif) vers un contrat V2 supportant :

- Multi-items par order (panier groupé)
- Shipment groups (flexibilité d'expédition vendeur)
- Libération progressive cross-border (20%/70%/10%)
- Stake vendeur 3 tiers avec limites de ventes simultanées
- Deadlines strictes (auto-refund inactif)
- Restriction forceRefund par conditions codées
- Limites architecturales hardcodées (non-custodial renforcé)

### 1.2 Contrats impactés

- `EtaloEscrow` : refactor majeur (breaking changes)
- `EtaloDispute` : adaptations pour disputes par item
- `EtaloReputation` : inchangé fonctionnellement
- `EtaloStake` : nouveau contrat
- `EtaloVoting` : nouveau contrat (N3 simplifié V1)

### 1.3 Breaking changes

Le V2 n'est pas backward-compatible avec V1. Nouveau déploiement, nouvelles adresses, migration manuelle si orders actifs existent sur V1.

---

## 2. Architecture

### 2.1 Hiérarchie des entités

```
Order (commande globale)
│
├── Items[] (articles individuels, sujets aux disputes)
│   ├── itemId
│   ├── itemPrice, itemCommission
│   ├── shipmentGroupId (lien vers ShipmentGroup)
│   ├── releasedAmount
│   └── status (ItemStatus)
│
└── ShipmentGroups[] (envois physiques)
    ├── groupId
    ├── itemIds[] (items regroupés dans cet envoi)
    ├── shipmentProofHash, arrivalProofHash
    ├── shippedAt, arrivedAt
    ├── majorityReleaseAt, finalReleaseAfter
    ├── status (ShipmentStatus)
    └── releaseStage (0-3)
```

### 2.2 Séparation logique vs physique

- **Items** = découpage logique de la commande (ce que l'acheteur a acheté)
- **Shipment Groups** = découpage physique (comment le vendeur expédie)
- Un item est disputable individuellement
- Un shipment group partage des preuves et un timer communs

---

## 3. Structures de données

### 3.1 Struct Order

```solidity
struct Order {
    uint256 orderId;
    address buyer;
    address seller;
    uint256 totalAmount;
    uint256 totalCommission;
    uint256 createdAt;
    uint256 fundedAt;
    bool isCrossBorder;
    OrderStatus globalStatus;
    uint256 itemCount;
    uint256 shipmentGroupCount;
}
```

### 3.2 Struct Item

```solidity
struct Item {
    uint256 itemId;
    uint256 orderId;
    uint256 itemPrice;
    uint256 itemCommission;
    uint256 shipmentGroupId;     // 0 si pas encore assigné
    uint256 releasedAmount;       // cumul déjà libéré
    ItemStatus status;
}
```

### 3.3 Struct ShipmentGroup

```solidity
struct ShipmentGroup {
    uint256 groupId;
    uint256 orderId;
    uint256[] itemIds;
    bytes32 shipmentProofHash;
    bytes32 arrivalProofHash;
    uint256 shippedAt;
    uint256 arrivedAt;
    uint256 majorityReleaseAt;   // arrivedAt + 72h
    uint256 finalReleaseAfter;   // arrivedAt + 5 days
    ShipmentStatus status;
    uint8 releaseStage;          // 0=pending, 1=shipped20%, 2=arrived90%, 3=final100%
}
```

### 3.4 Enums

```solidity
enum OrderStatus {
    Created,      // 0 — créé, non financé
    Funded,       // 1 — USDT déposé
    PartiallyShipped,  // 2 — au moins un shipment group créé
    AllShipped,   // 3 — tous items assignés à un shipment group
    PartiallyDelivered, // 4 — certains items délivrés
    Completed,    // 5 — tous items Released ou Refunded
    Disputed,     // 6 — au moins un item en dispute
    Refunded,     // 7 — tous items refunded
    Cancelled     // 8 — annulé avant funding
}

enum ItemStatus {
    Pending,      // 0 — en attente d'expédition
    Shipped,      // 1 — dans un shipment group expédié
    Arrived,      // 2 — groupe arrivé dans le pays (cross-border)
    Delivered,    // 3 — reçu par le buyer
    Released,     // 4 — fonds libérés au seller
    Disputed,     // 5 — en dispute
    Refunded      // 6 — remboursé au buyer
}

enum ShipmentStatus {
    Pending,      // 0 — créé mais pas encore expédié (V1 : créé = expédié)
    Shipped,      // 1 — en transit
    Arrived,      // 2 — arrivé dans le pays destinataire
    Delivered     // 3 — livré, tous items Released/Refunded
}
```

---

## 4. Flow cross-border progressif

### 4.1 Principe

Pour protéger le vendeur de la trésorerie bloquée pendant des semaines sur un envoi international, les fonds cross-border sont libérés en 3 étapes :

- **20%** à l'expédition avec preuve vérifiable
- **70%** à l'arrivée pays destinataire + 72h sans dispute
- **10%** à l'arrivée + 5 jours OU confirmation acheteur

### 4.2 Timeline type (Lagos → Paris, 45 USDT, commission 2.7%)

| Jour | Événement | Cumul libéré au seller |
|------|-----------|------------------------|
| J+0  | Buyer funding | 0 USDT |
| J+3  | Seller expédie avec preuve DHL | 9 USDT (20%) |
| J+10 | Colis arrive à Paris CDG | timer 72h démarre |
| J+13 | Fin timer 72h sans dispute | 40.50 USDT (90%) |
| J+15 | Fin timer 5j OU confirmation | 43.79 USDT (100% - commission) |

### 4.3 Fonctions impliquées

```solidity
function shipItemsGrouped(
    uint256 orderId,
    uint256[] calldata itemIds,
    bytes32 proofHash
) external;

function markGroupArrived(
    uint256 orderId,
    uint256 groupId,
    bytes32 proofHash
) external;  // callable par buyer OU seller

function triggerMajorityRelease(
    uint256 orderId,
    uint256 groupId
) external;  // permissionless, appelable après majorityReleaseAt

function triggerAutoReleaseForItem(
    uint256 orderId,
    uint256 itemId
) external;  // permissionless, appelable après finalReleaseAfter
```

### 4.4 Flow intra-Afrique (simplifié)

Pour les ventes intra-Afrique, pas de split. Libération unique :

- **100%** après 3 jours d'expédition (2 jours pour Top Seller)
- OU **100%** immédiat sur `confirmItemDelivery` par le buyer

Pas de `markGroupArrived` nécessaire. Pas de `triggerMajorityRelease`.

---

## 5. Gestion des shipment groups

### 5.1 Principe

Le vendeur peut regrouper librement les items en un ou plusieurs envois physiques. Un shipment group = un colis physique avec une preuve unique.

### 5.2 Exemples de configurations

**Configuration A : Tout ensemble**
- Order de 3 items : robe + sac + boucles
- Chioma crée 1 shipment group contenant les 3 items
- Une seule preuve d'expédition (photo colis + reçu DHL)
- Tous les items héritent du même timer cross-border

**Configuration B : Fractionné**
- Order de 4 items : robe + sac + boucles + foulard (fournisseur externe)
- Chioma crée 1er shipment group avec robe+sac+boucles
- Plus tard, 2e shipment group avec le foulard
- Chaque groupe a sa propre timeline

### 5.3 Règles

- `MAX_ITEMS_PER_GROUP = 20`
- `MAX_ITEMS_PER_ORDER = 50`
- Un item ne peut être que dans un seul shipment group
- Un shipment group est **figé après création** en V1 (non modifiable)
- En V2, possibilité de réorganiser tant que non-Shipped (à implémenter plus tard)

### 5.4 Dispute granulaire

Même si 3 items voyagent ensemble dans un même shipment group, l'acheteur peut :
- Confirmer la livraison de 2 items
- Disputer le 3e item individuellement

Seul l'item disputed bloque ses fonds. Les 2 autres continuent leur cycle normalement.

---

## 6. Stake vendeur cross-border

### 6.1 Principe

Pour lister des produits vendables en cross-border, un vendeur doit déposer un stake dans le contrat `EtaloStake`. Ce stake garantit partiellement contre les fraudes post-libération.

### 6.2 Les 3 tiers

**Tier 1 — Démarrage (par défaut nouveau vendeur)**
- Stake requis : 10 USDT
- Max ventes cross-border simultanées : 3
- Prix max par produit : 100 USDT
- Exposition totale max : 300 USDT
- Éligibilité : automatique

**Tier 2 — Établi**
- Stake requis : 25 USDT (upgrade +15 USDT depuis T1)
- Max ventes simultanées : 10
- Prix max par produit : 200 USDT
- Exposition totale max : 2 000 USDT
- Éligibilité : 20+ ventes cross-border réussies sans dispute majeure + 60 jours d'ancienneté

**Tier 3 — Top Seller**
- Stake requis : 50 USDT (upgrade +25 USDT depuis T2)
- Max ventes simultanées : illimité
- Prix max par produit : illimité
- Exposition totale : illimitée
- Éligibilité : Top Seller badge (50+ ventes, 0 dispute perdue, 90j sans sanction)

### 6.3 Flow stake

**Dépôt initial**
```solidity
function depositStake(uint8 tier) external;
```

**Upgrade tier**
```solidity
function upgradeTier(uint8 newTier) external;
```

**Initiation retrait**
```solidity
function initiateWithdrawal(uint8 newTier) external;
// newTier = 0 : retrait total (désactivation cross-border)
// newTier < currentTier : downgrade partiel
// Vérifie : 0 ventes cross-border actives
// Met le montant libérable en pending_withdrawal avec unlockAt = now + 14 days
```

**Exécution retrait**
```solidity
function executeWithdrawal() external;
// Vérifie : unlockAt passé, pas de dispute active
// Transfer vers le wallet vendeur
```

**Gel par dispute**
```solidity
function pauseWithdrawal(address seller) external onlyDisputeContract;
// Gèle le cooldown pendant toute la durée de la dispute
```

**Reprise après dispute**
```solidity
function resumeWithdrawal(address seller) external onlyDisputeContract;
// Recalcule unlockAt = now + remaining cooldown
```

**Slash par dispute**
```solidity
function slashStake(
    address seller,
    uint256 amount,
    address recipient
) external onlyDisputeContract;
```

### 6.4 Règles de libération

- **Impossible** avec au moins 1 vente cross-border active
- **Cooldown 14 jours** après initiation
- **Dispute pendant cooldown** = gel complet jusqu'à résolution
- **Downgrade partiel** possible (T2 → T1 récupère 15 USDT)
- **Cancel** du retrait possible à tout moment (annule le cooldown, stake réactivé)
- **Plusieurs downgrades** autorisés dans le temps (pas de limite)

### 6.5 Destination du stake slashé

- **Priorité 1** : rembourser le buyer victime de la dispute
- **Surplus éventuel** : vers `communityFund` (fonds communautaire)

---

## 7. forceRefund V2 — Restriction par conditions

### 7.1 Contexte

En V1, la fonction `forceRefund(orderId)` était accessible sans condition à l'owner, permettant un refund arbitraire de tout order. Cette capacité entrait en contradiction avec le positionnement "non-custodial" d'Etalo.

### 7.2 V2 — Restrictions

```solidity
function forceRefund(uint256 orderId, bytes32 reasonHash) 
    external 
    onlyOwner 
    nonReentrant 
{
    Order storage order = _orders[orderId];
    
    require(
        order.globalStatus == OrderStatus.Funded ||
        order.globalStatus == OrderStatus.PartiallyShipped ||
        order.globalStatus == OrderStatus.AllShipped ||
        order.globalStatus == OrderStatus.Disputed,
        "Order not in refundable state"
    );
    
    // Condition 1 : Dispute contract inactif
    bool disputeContractInactive = (disputeContract == address(0));
    
    // Condition 2 : Order inactif depuis 90+ jours
    bool prolongedInactivity = (
        order.fundedAt > 0 && 
        block.timestamp > order.fundedAt + 90 days
    );
    
    // Condition 3 : Injonction légale enregistrée
    bool legalHoldActive = (legalHoldRegistry[orderId] != bytes32(0));
    
    require(
        disputeContractInactive || 
        prolongedInactivity || 
        legalHoldActive,
        "forceRefund requires: dispute inactive OR 90+ days OR legal hold"
    );
    
    uint256 refundAmount = order.totalAmount - _totalReleasedAmount(order);
    
    emit ForceRefundExecuted(
        orderId, 
        msg.sender, 
        refundAmount, 
        block.timestamp, 
        reasonHash
    );
    
    _executeRefund(orderId, refundAmount);
}
```

### 7.3 Legal hold registry

```solidity
mapping(uint256 => bytes32) public legalHoldRegistry;

function registerLegalHold(
    uint256 orderId, 
    bytes32 documentHash
) external onlyOwner {
    require(documentHash != bytes32(0), "Invalid document hash");
    legalHoldRegistry[orderId] = documentHash;
    emit LegalHoldRegistered(orderId, documentHash, block.timestamp);
}

function clearLegalHold(uint256 orderId) external onlyOwner {
    delete legalHoldRegistry[orderId];
    emit LegalHoldCleared(orderId, block.timestamp);
}
```

### 7.4 Events associés

```solidity
event ForceRefundExecuted(
    uint256 indexed orderId,
    address indexed admin,
    uint256 refundAmount,
    uint256 timestamp,
    bytes32 reasonHash
);

event LegalHoldRegistered(
    uint256 indexed orderId,
    bytes32 documentHash,
    uint256 timestamp
);

event LegalHoldCleared(
    uint256 indexed orderId,
    uint256 timestamp
);
```

---

## 8. Deadlines et auto-refund vendeur inactif

### 8.1 Principe

Si un vendeur ne marque jamais "shipped" après avoir été funded, les fonds du buyer ne doivent pas rester bloqués indéfiniment.

### 8.2 Règles

- **Intra-Afrique** : 7 jours après fundedAt → auto-refund possible
- **Cross-border** : 14 jours après fundedAt → auto-refund possible
- Strict : aucune extension possible (simplicité V1)

### 8.3 Fonction

```solidity
function triggerAutoRefundIfInactive(uint256 orderId) 
    external 
    nonReentrant 
{
    Order storage order = _orders[orderId];
    
    require(
        order.globalStatus == OrderStatus.Funded,
        "Order not in Funded state"
    );
    
    uint256 deadline = order.isCrossBorder 
        ? order.fundedAt + AUTO_REFUND_INACTIVE_CROSS 
        : order.fundedAt + AUTO_REFUND_INACTIVE_INTRA;
    
    require(
        block.timestamp > deadline,
        "Deadline not reached"
    );
    
    emit AutoRefundInactive(orderId, block.timestamp);
    
    _executeRefund(orderId, order.totalAmount);
}
```

Permissionless : n'importe qui peut appeler (buyer, keeper, bot).

---

## 9. Limites architecturales hardcodées

### 9.1 Principe

Pour renforcer le positionnement non-custodial et protéger les utilisateurs même en l'absence d'audit formel, le contrat intègre des limites immuables qui bornent le dommage maximal possible.

### 9.2 Constantes

```solidity
uint256 public constant MAX_TVL_USDT = 50_000 * 10**6;      // 50 000 USDT
uint256 public constant MAX_ORDER_USDT = 500 * 10**6;        // 500 USDT
uint256 public constant MAX_SELLER_WEEKLY_VOLUME = 5_000 * 10**6;  // 5 000 USDT
uint256 public constant EMERGENCY_PAUSE_MAX = 7 days;
uint256 public constant EMERGENCY_PAUSE_COOLDOWN = 30 days;
```

### 9.3 Vérifications

```solidity
function createOrderWithItems(...) external returns (uint256) {
    require(totalAmount <= MAX_ORDER_USDT, "Order exceeds per-order cap");
    require(
        totalEscrowedAmount + totalAmount <= MAX_TVL_USDT, 
        "Global TVL cap reached"
    );
    require(
        sellerWeeklyVolume[seller] + totalAmount <= MAX_SELLER_WEEKLY_VOLUME,
        "Seller weekly cap"
    );
    // ...
}
```

### 9.4 Tracking weekly volume

```solidity
mapping(address => uint256) public sellerWeeklyVolume;
mapping(address => uint256) public sellerWeekStartTimestamp;

function _updateSellerWeeklyVolume(address seller, uint256 amount) internal {
    if (block.timestamp > sellerWeekStartTimestamp[seller] + 1 weeks) {
        sellerWeeklyVolume[seller] = 0;
        sellerWeekStartTimestamp[seller] = block.timestamp;
    }
    sellerWeeklyVolume[seller] += amount;
}
```

### 9.5 Emergency pause

```solidity
uint256 public pausedUntil;
uint256 public lastPauseEndedAt;

function emergencyPause() external onlyOwner {
    require(
        block.timestamp > lastPauseEndedAt + EMERGENCY_PAUSE_COOLDOWN,
        "Pause cooldown active"
    );
    pausedUntil = block.timestamp + EMERGENCY_PAUSE_MAX;
    emit EmergencyPauseActivated(msg.sender, pausedUntil);
}

modifier whenNotPaused() {
    require(block.timestamp > pausedUntil, "Contract paused");
    _;
}
```

---

## 10. Commissions et treasury

### 10.1 Commissions

```solidity
uint256 public constant COMMISSION_INTRA_BPS = 180;          // 1.8%
uint256 public constant COMMISSION_CROSS_BPS = 270;          // 2.7%
uint256 public constant COMMISSION_TOP_SELLER_BPS = 120;     // 1.2%
uint256 public constant BPS_DENOMINATOR = 10000;
```

### 10.2 Destinations

```solidity
address public commissionTreasury;    // pour commissions escrow
address public creditsTreasury;        // pour ventes de crédits (contrat séparé)
address public communityFund;          // pour slashes surplus
```

### 10.3 Fonctions admin

```solidity
function setCommissionTreasury(address _new) external onlyOwner {
    emit CommissionTreasuryUpdated(commissionTreasury, _new);
    commissionTreasury = _new;
}

function setCreditsTreasury(address _new) external onlyOwner {
    emit CreditsTreasuryUpdated(creditsTreasury, _new);
    creditsTreasury = _new;
}

function setCommunityFund(address _new) external onlyOwner {
    emit CommunityFundUpdated(communityFund, _new);
    communityFund = _new;
}
```

### 10.4 Top Seller discount

Calcul dans `_calculateCommission` :

```solidity
function _calculateCommission(
    uint256 amount, 
    bool isCrossBorder, 
    address seller
) internal view returns (uint256) {
    uint256 bps;
    if (isCrossBorder) {
        bps = COMMISSION_CROSS_BPS;  // pas de discount Top Seller en cross-border
    } else if (
        address(reputation) != address(0) && 
        reputation.isTopSeller(seller)
    ) {
        bps = COMMISSION_TOP_SELLER_BPS;  // 1.2%
    } else {
        bps = COMMISSION_INTRA_BPS;  // 1.8%
    }
    return (amount * bps) / BPS_DENOMINATOR;
}
```

---

## 11. Constantes complètes du contrat

```solidity
// Commissions
uint256 public constant COMMISSION_INTRA_BPS = 180;           // 1.8%
uint256 public constant COMMISSION_CROSS_BPS = 270;           // 2.7%
uint256 public constant COMMISSION_TOP_SELLER_BPS = 120;      // 1.2%
uint256 public constant BPS_DENOMINATOR = 10000;

// Auto-release timers
uint256 public constant AUTO_RELEASE_INTRA = 3 days;
uint256 public constant AUTO_RELEASE_TOP_SELLER = 2 days;
uint256 public constant AUTO_RELEASE_CROSS_FINAL = 5 days;
uint256 public constant MAJORITY_RELEASE_DELAY = 72 hours;

// Auto-refund deadlines
uint256 public constant AUTO_REFUND_INACTIVE_INTRA = 7 days;
uint256 public constant AUTO_REFUND_INACTIVE_CROSS = 14 days;

// Cross-border release percentages
uint256 public constant SHIPPING_RELEASE_PCT = 2000;          // 20% en BPS
uint256 public constant MAJORITY_RELEASE_PCT = 7000;          // 70% en BPS
uint256 public constant FINAL_RELEASE_PCT = 1000;             // 10% en BPS

// Stake tiers (en contrat EtaloStake)
uint256 public constant TIER_1_STAKE = 10 * 10**6;           // 10 USDT
uint256 public constant TIER_1_MAX_CONCURRENT = 3;
uint256 public constant TIER_1_MAX_PRICE = 100 * 10**6;

uint256 public constant TIER_2_STAKE = 25 * 10**6;           // 25 USDT
uint256 public constant TIER_2_MAX_CONCURRENT = 10;
uint256 public constant TIER_2_MAX_PRICE = 200 * 10**6;

uint256 public constant TIER_3_STAKE = 50 * 10**6;           // 50 USDT
// TIER_3 = unlimited concurrent + unlimited price

uint256 public constant STAKE_COOLDOWN = 14 days;

// Limites architecturales
uint256 public constant MAX_TVL_USDT = 50_000 * 10**6;
uint256 public constant MAX_ORDER_USDT = 500 * 10**6;
uint256 public constant MAX_SELLER_WEEKLY_VOLUME = 5_000 * 10**6;
uint256 public constant EMERGENCY_PAUSE_MAX = 7 days;
uint256 public constant EMERGENCY_PAUSE_COOLDOWN = 30 days;

// Limites opérationnelles
uint256 public constant MAX_ITEMS_PER_GROUP = 20;
uint256 public constant MAX_ITEMS_PER_ORDER = 50;

// Force refund
uint256 public constant FORCE_REFUND_INACTIVITY_THRESHOLD = 90 days;
```

---

## 12. Fonctions publiques — Vue d'ensemble

### 12.1 Lifecycle order (vendeur)

- `createOrderWithItems(seller, prices[], isCrossBorder) returns (orderId)`
- `shipItemsGrouped(orderId, itemIds[], proofHash)`
- `markGroupArrived(orderId, groupId, proofHash)` — seller OR buyer
- `enableCrossBorderSelling()` — via EtaloStake
- `disableCrossBorderSelling()` — via EtaloStake

### 12.2 Lifecycle order (acheteur)

- `fundOrder(orderId)`
- `confirmItemDelivery(orderId, itemId)`
- `confirmGroupDelivery(orderId, groupId)`
- `disputeItem(orderId, itemId, reason)` — via EtaloDispute
- `cancelOrder(orderId)` — uniquement avant funding

### 12.3 Triggers permissionless

- `triggerMajorityRelease(orderId, groupId)` — après 72h arrivée cross-border
- `triggerAutoReleaseForItem(orderId, itemId)` — après deadline final
- `triggerAutoRefundIfInactive(orderId)` — après 7j/14j sans expédition

### 12.4 Admin (restricted)

- `setCommissionTreasury(address)` — onlyOwner
- `setCreditsTreasury(address)` — onlyOwner
- `setCommunityFund(address)` — onlyOwner
- `setDisputeContract(address)` — onlyOwner
- `setReputation(address)` — onlyOwner
- `forceRefund(orderId, reasonHash)` — onlyOwner + 3 conditions strictes
- `registerLegalHold(orderId, documentHash)` — onlyOwner
- `clearLegalHold(orderId)` — onlyOwner
- `emergencyPause()` — onlyOwner + cooldown 30j

### 12.5 Dispute (onlyDisputeContract)

- `markItemDisputed(orderId, itemId)`
- `resolveItemDispute(orderId, itemId, refundAmount)`
- `pauseStakeWithdrawal(seller)` — via EtaloStake
- `resumeStakeWithdrawal(seller)` — via EtaloStake
- `slashStake(seller, amount, recipient)` — via EtaloStake

**Précondition fundedAt** : Disputes can only be opened on funded orders (order.fundedAt > 0). Enforced by 3-layer guard in EtaloDispute.openDispute, EtaloEscrow.markItemDisputed, EtaloEscrow.resolveItemDispute. See ADR-042.

---

## 13. Events complets

### 13.1 Lifecycle order

```solidity
event OrderCreated(
    uint256 indexed orderId,
    address indexed buyer,
    address indexed seller,
    uint256 totalAmount,
    bool isCrossBorder,
    uint256 itemCount
);

event OrderFunded(uint256 indexed orderId, uint256 fundedAt);

event ItemShipped(
    uint256 indexed orderId,
    uint256 indexed itemId,
    uint256 indexed shipmentGroupId,
    bytes32 shipmentProofHash
);

event ShipmentGroupCreated(
    uint256 indexed orderId,
    uint256 indexed groupId,
    uint256[] itemIds,
    bytes32 proofHash
);

event GroupArrived(
    uint256 indexed orderId,
    uint256 indexed groupId,
    bytes32 arrivalProofHash,
    uint256 arrivedAt
);

event PartialReleaseTriggered(
    uint256 indexed orderId,
    uint256 indexed groupId,
    uint8 releaseStage,
    uint256 amount
);

event ItemReleased(
    uint256 indexed orderId,
    uint256 indexed itemId,
    uint256 amount
);

event ItemCompleted(uint256 indexed orderId, uint256 indexed itemId);

event OrderCompleted(uint256 indexed orderId);
event OrderCancelled(uint256 indexed orderId);
```

### 13.2 Disputes

```solidity
event ItemDisputed(
    uint256 indexed orderId,
    uint256 indexed itemId,
    string reason
);

event ItemDisputeResolved(
    uint256 indexed orderId,
    uint256 indexed itemId,
    uint256 refundAmount
);
```

### 13.3 Stake

```solidity
event StakeDeposited(
    address indexed seller,
    uint256 amount,
    uint8 tier
);

event StakeUpgraded(
    address indexed seller,
    uint8 oldTier,
    uint8 newTier,
    uint256 addedAmount
);

event WithdrawalInitiated(
    address indexed seller,
    uint256 amount,
    uint256 unlockAt
);

event WithdrawalExecuted(
    address indexed seller,
    uint256 amount
);

event WithdrawalPaused(
    address indexed seller,
    uint256 disputeId
);

event WithdrawalResumed(
    address indexed seller,
    uint256 newUnlockAt
);

event WithdrawalCancelled(address indexed seller);

event StakeSlashed(
    address indexed seller,
    uint256 amount,
    address indexed recipient,
    uint256 disputeId
);
```

### 13.4 Admin

```solidity
event CommissionTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
event CreditsTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
event CommunityFundUpdated(address indexed oldFund, address indexed newFund);
event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

event ForceRefundExecuted(
    uint256 indexed orderId,
    address indexed admin,
    uint256 refundAmount,
    uint256 timestamp,
    bytes32 reasonHash
);

event LegalHoldRegistered(
    uint256 indexed orderId,
    bytes32 documentHash,
    uint256 timestamp
);

event LegalHoldCleared(uint256 indexed orderId, uint256 timestamp);

event EmergencyPauseActivated(address indexed admin, uint256 pausedUntil);
event EmergencyPauseEnded(uint256 endedAt);

event AutoRefundInactive(uint256 indexed orderId, uint256 timestamp);
event AutoReleaseTriggered(uint256 indexed orderId, uint256 indexed itemId);
```

---

## 14. Suppression des features V1

Les features suivantes sont supprimées ou transformées en V2 :

### 14.1 Milestones cross-border

**Supprimés**. La fonction `releaseMilestone(orderId)` et les champs `milestoneCount`, `milestonesReleased`, `CROSS_BORDER_MILESTONES` sont retirés. Remplacés par le système de shipment groups avec libération progressive 20%/70%/10%.

### 14.2 Delivered status transitoire

L'état `Delivered` global sur un order est remplacé par `PartiallyDelivered` et géré au niveau item.

### 14.3 autoReleaseAfter unique

Remplacé par :
- `majorityReleaseAt` (72h après arrivée cross-border)
- `finalReleaseAfter` (5j après arrivée cross-border OU 3j/2j après ship intra)

### 14.4 confirmDelivery global

Remplacé par `confirmItemDelivery(itemId)` et `confirmGroupDelivery(groupId)`.

---

## 15. Plan de migration V1 → V2

### 15.1 Stratégie

Breaking refactor. Aucune migration automatique possible.

- V1 sur Celo Sepolia reste en place pour les tests historiques
- V2 déployé sur nouvelles adresses
- Tous les orders V1 sont **finalisés ou annulés** avant activation V2
- Backend indexe les deux versions pendant une période de transition

### 15.2 Checklist déploiement V2

1. Déploiement des 5 contrats dans l'ordre : `EtaloReputation`, `EtaloStake`, `EtaloVoting`, `EtaloDispute`, `EtaloEscrow`
2. Configuration des inter-références (setters)
3. Configuration des 3 treasuries (commission, credits, community fund)
4. Vérification des contrats sur CeloScan
5. Tests end-to-end sur Sepolia avec scenarios complets
6. Documentation SECURITY.md mise à jour avec les nouvelles adresses
7. Communication dev team Etalo + partenaires MiniPay

### 15.3 Limites de déploiement mainnet

Mainnet possible uniquement après :
- Tous les tests passent (85%+ coverage)
- Outils automatiques passés sans issues critiques (Slither, Aderyn)
- Peer review par au moins 2 développeurs externes
- Audit externe OU audit competition OU Celo Foundation grant obtenu
- Bug bounty activé (min 2 000 USDT pool)

---

## 16. Couverture de tests

### 16.1 Suite de tests attendue

Objectif : 85%+ coverage sur le code critique.

**Tests fonctionnels par contrat :**

- `EtaloEscrow` : ~40 tests
  - Création order single-item (intra + cross-border)
  - Création order multi-items
  - Shipment groups (1 group, N groups, partial)
  - Flow intra complet
  - Flow cross-border progressif (20%/70%/10%)
  - Dispute par item sans affecter les autres
  - Auto-release permissionless
  - Auto-refund inactif
  - forceRefund avec conditions (chacune testée)
  - Emergency pause
  - Limites architecturales (MAX_TVL, MAX_ORDER, MAX_SELLER_WEEKLY)

- `EtaloStake` : ~25 tests
  - Dépôt tier 1
  - Upgrade tier 2, tier 3
  - Initiation retrait
  - Cooldown 14j
  - Pause par dispute
  - Resume après résolution
  - Slash par dispute
  - Downgrade partiel
  - Cancel retrait
  - Limites concurrent sellers

- `EtaloDispute` : ~15 tests
  - Dispute N1 amiable
  - Dispute N2 médiation
  - Dispute N3 vote on-chain
  - Resolution refund partial
  - Resolution refund total
  - Resolution favor seller

- `EtaloReputation` : ~10 tests
  - Ajout review
  - Top Seller threshold
  - Mise à jour score
  - Events

- `EtaloVoting` (N3 simplifié V1) : ~10 tests
  - Création vote
  - Soumission vote
  - Fin de période
  - Résolution majorité

**Tests d'intégration** : ~15 tests
- Flow bout-en-bout acheteur + vendeur
- Interaction Escrow ↔ Stake ↔ Dispute
- Scénarios adversariaux

### 16.2 Tests d'invariants (Foundry)

- Somme des balances escrow = total funded - total released - total refunded
- Aucun item ne peut être Released et Refunded simultanément
- La commission effective est toujours entre 1.2% et 2.7%
- Le stake slashé n'excède jamais le stake total
- Un order Completed ne peut jamais revenir à un état antérieur

---

## 17. Ressources et références

- `docs/VISION_V1_BOUTIQUE.md` : vision produit complète
- `docs/PRICING_MODEL_CREDITS.md` : modèle économique
- `docs/DECISIONS.md` : ADRs justifiant les choix techniques
- `docs/SECURITY.md` : à créer, garanties et adresses publiques
- `packages/contracts/contracts/` : code Solidity V1 actuel
- `packages/contracts/test/` : suite de tests à adapter et étendre

---

**Cette spec est la référence technique. Toute implémentation qui s'en écarte doit être justifiée par un ADR dans `docs/DECISIONS.md`.**
