# Etalo V1 Boutique — Vision Produit

**Version** : 1.0  
**Date** : 23 avril 2026  
**Auteur** : Mike (Etalo)  
**Statut** : Référence de vision — source de vérité pour tout le développement V1

---

## 1. Positionnement

**Etalo est le Shopify des vendeurs africains qui vivent sur les réseaux sociaux, avec la sécurité d'un escrow blockchain non-custodial, accessible via MiniPay.**

Etalo n'est pas un checkout isolé. Etalo n'est pas un simple wallet. Etalo est une vraie boutique en ligne pour chaque vendeur, avec paiement sécurisé en stablecoins, pensée pour le commerce africain réel : culture mobile money, faible bandwidth, logistique imprévisible, diaspora cross-border.

### 1.1 Message principal

"Your shop, always open. Non-custodial commerce for African sellers. From Lagos to Paris, securely."

### 1.2 Proposition de valeur

Pour les vendeurs africains qui perdent des ventes à cause du manque de confiance sur les réseaux sociaux, Etalo offre une boutique clé-en-main avec protection acheteur automatique via smart contract, sans custody ni banques, accessible en 2 clics depuis MiniPay.

Pour les acheteurs diaspora qui craignent les fraudes quand ils envoient de l'argent en Afrique, Etalo offre la garantie que leur paiement ne sera débloqué qu'à la livraison confirmée, avec disputes résolues on-chain.

---

## 2. Les trois piliers

### Pilier 1 : Boutique multi-produits par vendeur

Chaque vendeur a sa propre boutique accessible via une URL personnalisée (`etalo.app/[handle]`). Les acheteurs y trouvent le catalogue complet, ajoutent plusieurs produits au panier, et checkoutent en une seule transaction. Un seul signature MiniPay, un seul paiement USDT, un seul order dans le smart contract.

### Pilier 2 : Marketplace dans MiniPay

Etalo est une Mini App duale : elle sert les vendeurs (dashboard, gestion produits, commandes) ET les acheteurs (découverte produits, recherche, navigation). Les 7 millions d'utilisateurs MiniPay peuvent consommer, pas seulement vendre.

### Pilier 3 : Asset generator monétisé

Pour chaque produit créé, Etalo génère automatiquement des assets marketing prêts à publier sur Instagram, WhatsApp, TikTok, Facebook. Monétisation par système de crédits : 5 gratuits par mois, plus 10 bonus à l'inscription, puis 0.15 USDT par crédit supplémentaire.

---

## 3. Personas

### 3.1 Chioma — La vendeuse

- 26 ans, basée à Lagos, Nigeria
- Vend des robes Ankara faites main
- Publie sur Instagram et WhatsApp Business
- Utilise MTN Mobile Money pour ses dépenses quotidiennes
- A un smartphone Tecno avec connexion 4G intermittente
- Parle anglais et pidgin nigerian
- Fait environ 15-25 ventes par mois
- Souhaite atteindre la diaspora africaine à Paris, Londres, Toronto

**Besoins critiques :**
- Boutique clé-en-main sans savoir coder
- Trésorerie rapide (ne pas attendre 30 jours pour toucher l'argent)
- Protection contre les acheteurs fantômes et les retours abusifs
- Marketing content pour ses réseaux sociaux

### 3.2 Mamadou — L'acheteur

- 34 ans, camerounais basé à Paris
- Salarié dans une entreprise tech
- Envoie régulièrement de l'argent à sa famille au Cameroun
- Utilise Wise et parfois crypto pour les transferts
- Veut acheter des produits authentiques africains pour offrir
- Habitué aux apps mobiles (Instagram, WhatsApp, Bolt)
- Sceptique sur les vendeurs Instagram à cause de mauvaises expériences passées
- Cherche une plateforme qui protège son argent jusqu'à réception

**Besoins critiques :**
- Garantie que son paiement est sécurisé jusqu'à livraison
- Visibilité sur l'avancement du colis
- Pouvoir disputer individuellement un article manquant ou défectueux
- Ne pas dépendre d'un support client lent et opaque

---

## 4. Flow bout-en-bout

### 4.1 Découverte

Mamadou voit un post Instagram de Chioma présentant une robe bleue. Le post inclut un lien `etalo.app/chioma_lagos/robe-ankara-bleu`.

### 4.2 Arrivée sur la boutique

Clic sur le lien. Mamadou arrive sur la boutique de Chioma. Il voit : l'identité de la vendeuse (photo, bio, pays, réputation), le produit mis en avant (robe bleue), les autres produits du catalogue, les avis acheteurs, le message de protection escrow.

### 4.3 Exploration et panier

Mamadou navigue, ajoute la robe au panier. Il continue d'explorer, trouve un sac assorti, l'ajoute. Ajoute des boucles d'oreilles. Panier : 3 articles, 73 USDT.

### 4.4 Checkout

Clique "Passer au paiement". Arrive sur une page récap avec : détail des articles, total + commission Etalo, option email/phone pour recevoir les notifications (optionnel).

### 4.5 Paiement

Si Mamadou a MiniPay : bouton "Payer avec MiniPay". Transaction signée. 15 secondes.

Si Mamadou n'a pas MiniPay : écran pédagogique expliquant la protection escrow, pourquoi MiniPay, avec lien d'installation.

### 4.6 Confirmation

Page de confirmation affichant : numéro de commande unique (ETA-YYYY-XXXXX), hash de transaction (preuve blockchain), URL unique pour suivre la commande, option de partage.

### 4.7 Expédition

Chioma voit la commande dans son dashboard. Elle groupe les 3 articles dans un même colis. Upload photo du colis et reçu DHL avec numéro de tracking. Clique "Expédier".

Pour cross-border, 20% des fonds sont libérés immédiatement à Chioma pour couvrir les frais d'expédition. Pour intra-Afrique, rien n'est libéré à ce stade.

### 4.8 Transit

Mamadou suit l'avancement dans sa page commande. Il reçoit des notifications (MiniPay, WhatsApp si opt-in, email si opt-in) à chaque étape.

### 4.9 Arrivée dans le pays (cross-border uniquement)

Le colis arrive à Paris CDG. Chioma ou Mamadou marque "Arrivé en France" avec preuve tracking. Timer de 72h démarre. Après 72h sans dispute, 70% supplémentaires sont libérés (total 90% à Chioma).

### 4.10 Livraison

Mamadou reçoit le colis. Il ouvre, trouve robe OK, sac OK, mais boucles manquantes. Dans l'app : Robe → "Tout va bien" → fonds libérés à Chioma. Sac → "Tout va bien" → fonds libérés. Boucles → "Signaler un problème" → dispute ouverte sur cet item uniquement.

### 4.11 Résolution dispute

Dispute N1 amiable (48h) : Chioma et Mamadou négocient directement. Si pas d'accord, escalade N2 (médiation humaine, 7 jours, pouvoir limité par le code). Si toujours pas de résolution, N3 (vote communautaire on-chain, 14 jours).

### 4.12 Finalisation

Les 2 items résolus sont marqués Completed. L'item disputed est Refunded ou Released selon l'issue. Mamadou peut laisser un review. Chioma voit sa réputation mise à jour.

---

## 5. Les 23 features validées

### 5.1 Phase V1 (développement mai-juin 2026, soumission Proof of Ship juin 2026)

1. **Vérification téléphone** — chaque vendeur vérifie son numéro avant de lister
2. **Reviews acheteurs** — système d'étoiles et texte après chaque release
3. **Preuve d'expédition obligatoire** — photo et tracking pour déclencher shipped
4. **Timer cross-border dynamique** — 20%/70%/10% avec 72h et 5 jours
5. **Stake vendeur cross-border 3 tiers** — 10/25/50 USDT avec plafonds ventes simultanées
6. **Éducation cash-out** — section onboarding USDT vers FCFA/Naira/Cedi via partners
7. **Guest checkout** — capture email/phone optionnelle pendant le checkout
8. **Partage panier par lien** — URL unique pour reprendre plus tard
9. **Mode wishlist** — sauvegarder produit sans acheter, notifications sur changements
10. **Rich snippets SEO** — product schema, review schema, breadcrumbs
11. **Sitemaps dynamiques** — mis à jour en temps réel, ping Google
12. **Hreflang EN/FR** — multi-langues SEO
13. **SEO local** — URLs propres, meta optimisées, données géographiques

### 5.2 Phase V1.5 (juillet-août 2026)

14. **Badge Top Seller** — 50+ ventes sans dispute majeure, commission réduite 1.2%, auto-release 2j
15. **Featured placement** — top sellers en tête du marketplace
16. **Priority support WhatsApp** — canal dédié top sellers, réponse sous 4h
17. **Email reminders** — abandoned cart, wishlist reminders (opt-in uniquement)
18. **Social proof temps réel** — "X personnes regardent", "Dernière commande il y a Y"
19. **Analytics vendeur** — sources trafic, produits populaires, conversion

### 5.3 Phase V2 (Q3 2026)

20. **Panier multi-vendeurs** — plusieurs shops dans un même panier, transaction groupée
21. **Messaging intégré** — chat vendeur-acheteur dans Etalo
22. **Intégration services livraison locaux** — Gozem, SendStack, Sendy, Glovo APIs
23. **Politique retour/échange** — politique claire X jours, responsabilité frais

---

## 6. Timeline

- **Avril 2026** : fin session conception, documentation technique
- **Mai 2026** : développement V1 (smart contract V2 + backend refactor + frontend boutique)
- **Juin 2026** : finalisation V1 + soumission Proof of Ship (cycle mensuel)
- **Juillet-août 2026** : V1.5 basée sur feedback soumission Proof of Ship
- **Septembre 2026** : application Celo Foundation audit grants
- **Q4 2026** : audit externe (via grant ou competition), préparation mainnet
- **Q1 2027** : lancement mainnet avec limites architecturales hardcodées
- **Q3 2027** : V2 avec features avancées post-traction

---

## 7. Ce qu'Etalo n'est pas

Pour éviter la dérive de scope, Etalo n'est explicitement pas :

- **Un wallet** : MiniPay joue ce rôle
- **Un réseau social** : Instagram, WhatsApp, TikTok restent les canaux primaires
- **Un service de livraison** : on s'intègre avec partenaires, on n'opère pas
- **Une plateforme fiat** : on reste non-custodial strict, pas de carte bancaire
- **Un marketplace généraliste** : focus sur les vendeurs africains sur réseaux sociaux
- **Buffer ou Hootsuite** : l'asset generator amplifie le trafic vers escrow, pas un outil marketing standalone

---

## 8. Positionnement custody

Etalo se déclare **non-custodial**, selon le standard établi par Zenland, Circle Refund Protocol, et OpenSea.

### 8.1 Ce que non-custodial signifie chez Etalo

- Les fonds des acheteurs sont dans un smart contract public sur Celo, pas dans un wallet Etalo
- Le code du contrat est open source et vérifié sur CeloScan
- Aucune entité Etalo ne détient les clés de déblocage des fonds en escrow
- Les règles de libération sont codées dans des constantes immuables
- Les pouvoirs admin sont structurellement limités par le code

### 8.2 Le système de dispute à 3 niveaux

- **N1 — Résolution amiable** (48h) : vendeur et acheteur négocient directement
- **N2 — Médiation** (7 jours) : un médiateur Etalo analyse les preuves. Son pouvoir est limité par le smart contract : il peut uniquement refund ou release, jamais détourner ou figer les fonds indéfiniment.
- **N3 — Vote communautaire** (14 jours) : en dernier recours, vote on-chain par des membres stakés de la communauté. Décision 100% décentralisée.

### 8.3 Limites architecturales permanentes

Pour protéger les utilisateurs même en l'absence d'audit externe, le smart contract intègre des limites hardcodées :

- `MAX_TVL = 50_000 USDT` : le contrat refuse les nouveaux orders si le TVL global dépasse ce seuil
- `MAX_ORDER = 500 USDT` : aucun order ne peut dépasser cette valeur
- `MAX_SELLER_WEEKLY = 5_000 USDT` : aucun vendeur ne peut accumuler plus en une semaine
- `emergencyPause()` : pause max 7 jours, cooldown 30 jours, impossible de figer les fonds indéfiniment

Ces limites sont relâchables progressivement via upgrade de contrat, après validation de la fiabilité par le temps et l'usage.

---

## 9. Principes non-négociables

1. **Non-custodial par design** : les fonds acheteurs transitent wallet → smart contract → wallet, jamais par Etalo
2. **Transparence on-chain** : toutes les transactions vérifiables publiquement
3. **Protection acheteur prioritaire** : en cas de doute, on protège l'acheteur
4. **Simplicité UX** : jargon crypto banni de l'interface utilisateur
5. **Mobile-first strict** : design optimisé pour smartphones modestes en premier
6. **Honnêteté opérationnelle** : pas de promesses marketing, on explique les délais
7. **Respect culturel** : adaptation aux réalités africaines (logistique, trésorerie, langues)

---

## 10. Modèle de revenus

### 10.1 Commissions escrow

- **1.8%** sur les ventes intra-Afrique
- **2.7%** sur les ventes cross-border
- **1.2%** pour les Top Sellers intra-Afrique (incentive de fidélité)

### 10.2 Crédits Asset Generator

- 5 crédits gratuits par mois (non cumulables)
- +10 crédits bonus à l'inscription (lifetime)
- 0.15 USDT par crédit supplémentaire
- Minimum 5 crédits par achat
- Crédits achetés ne périment jamais

### 10.3 Architecture treasury

- `commissionTreasury` : wallet Celo dédié pour les commissions escrow
- `creditsTreasury` : wallet Celo séparé pour les ventes de crédits
- `communityFund` : pour accumuler les surplus de stakes slashés

Pas de multisig en V1 (à prévoir pour V3 ou dès co-fondateur). Pas de split automatique on-chain en V1.

---

## 11. Stratégie sécurité pragmatique

Etalo adopte une stratégie Africa-first : ne pas s'aligner sur les standards audit Web3 globaux (40-60k USD) qui sont inaccessibles à un solo dev sans revenus, mais construire une sécurité multi-couches avec des outils gratuits et des limites architecturales.

### 11.1 Sécurité pré-mainnet (mai-décembre 2026)

- Outils gratuits : Slither, Aderyn, Mythril, Foundry invariants
- Peer review communautaire (Celo Discord, Farcaster builders)
- Tests exhaustifs (objectif 85%+ coverage)
- Code open source dès le départ

### 11.2 Sécurité mainnet (Q1 2027+)

- Audit externe via Celo Foundation grant OU audit competition Cantina/Sherlock (8-15k USD)
- Bug bounty Immunefi permanent
- Limites architecturales hardcodées en place
- Monitoring 24/7 des transactions

### 11.3 Sécurité continue

- Upgrade progressive des limites après validation
- Re-audits incrementaux sur nouvelles features
- Communication transparente de tout incident

---

## 12. Marché concurrentiel

### 12.1 Concurrents custodial (non-chain)

- **Nigeria** : Peppa, EscrowLock, AtaraPay, Vahlid, Vesicash, PayScrow
- **Kenya** : Escroke, Empower Smart, JointPesa, Pansoko
- **Ghana** : TuaSafe

Tous détiennent les fonds sur leurs comptes bancaires. Aucun n'a publié d'audit technique. Modèle de confiance basé sur licences et marketing.

### 12.2 Différenciateur Etalo

- Seul acteur **non-custodial** par smart contract en Afrique
- Fonds mathématiquement protégés par le code, pas par un bilan d'entreprise
- Résilient aux chocs réglementaires (CBN, BoG)
- Compatible avec la diaspora via stablecoin (pas de FX)
- Code 100% open source, auditable par n'importe qui

### 12.3 Commission concurrentielle

- Etalo : 1.8-2.7%
- Peppa : 1-2.5%
- EscrowLock : ~3.25%
- Vahlid : 1.5-2.5%

Positionnement : dans la fourchette basse du marché pour les Top Sellers, alignée pour les standards.

---

## 13. Documents liés

- `docs/SPEC_SMART_CONTRACT_V2.md` : spec technique détaillée
- `docs/PRICING_MODEL_CREDITS.md` : modèle économique complet
- `docs/DECISIONS.md` : ADRs (Architecture Decision Records)
- `docs/SECURITY.md` : garanties techniques et adresses publiques

---

**Ce document est la référence. Toute décision qui s'en écarte doit être documentée dans DECISIONS.md avec justification.**
