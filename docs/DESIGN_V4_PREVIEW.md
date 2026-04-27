# Etalo Design V4 — Direction Validée

**Date de validation** : 22 avril 2026  
**Statut** : Direction créative validée, à implémenter après la soumission 
Proof of Ship (deadline 26 avril)

## Principes

Aligné sur les chartes officielles Celo + MiniPay, standards design 2026 
(earth-inspired palette, immersive minimalism, editorial typography).

**Inspirations** : Stripe Atlas, Mercury, Linear, Celo brand guide, MiniPay press kit.

## Palette de couleurs

Basée sur la charte Celo officielle (2023 rebrand) :

| Rôle | Nom | Hex | Usage |
|---|---|---|---|
| Base / background | Celo Light | `#FCFBF7` | Fond principal (off-white chaleureux) |
| Accent primaire | Forest | `#476520` | CTA, liens, éléments actifs |
| Accent secondaire | Prosperity Yellow | `#FBCC5C` | Highlights, badges, points d'emphase |
| Dark | Celo Dark | `#2E3338` | Texte, section contraste |

**Alternative dark hero** : si carte dark inside landing, fond `#2E3338` 
avec text `#FCFBF7` + glow radial `#476520` opacity 20% pour profondeur.

## Typography

- **Titres (H1-H2)** : `Instrument Serif` — poids 400, italique autorisé pour emphases  
  Google Fonts : `https://fonts.google.com/specimen/Instrument+Serif`
- **Body + UI** : `Inter` — poids 400 (body) et 500 (labels, buttons)  
  Google Fonts : `https://fonts.google.com/specimen/Inter`

**Hiérarchie** :
- H1 : 52px, letter-spacing -2.6px, line-height 0.98
- H2 : 30-34px, letter-spacing -1.5px
- Body : 15px, letter-spacing -0.15px, line-height 1.6
- Caption : 10-11px, letter-spacing 0.5-1.2px, uppercase pour labels

## Structure landing

Dans l'ordre vertical (mobile-first 360px) :

1. **Header** : logo SVG custom (28px) + wordmark Etalo (Instrument Serif 22px) 
   + badge "Live on Celo" (pill forest avec pulse dot)
2. **Hero** :
   - Badge "Proof of Ship winner" (pill jaune avec étoile gradient)
   - H1 : "Your shop, always *open*." (serif, italique sur "open" en forest)
   - Sous-titre en Inter 15px, opacity 0.58
   - CTA principal : "Open my shop" (bouton noir border-radius 100px, dot jaune inside)
   - Trust inline : "Free to start · Non-custodial · 1.8% fee" (checks forest)
3. **Card "Next order" (fond dark #2E3338)** :
   - Scan line dorée en haut
   - Glow radial forest en coin
   - Montant $45.00 en Instrument Serif 30px
   - Badge "Escrow active" (pill forest avec dot jaune)
   - Timeline 3 étapes (Paid ✓ / Waiting / Auto-release)
   - Footer : "You receive: 44.19 USDT" en jaune
4. **Partners** : divider "Partners" + Celo · MiniPay · USDT logos subtils
5. **Stats footer** : 7M+ users · 50+ countries · <$0.01 fee (Instrument Serif 22px)

## Logo Etalo (SVG inline)

Rectangle rounded (border-radius 8px) fond #2E3338, avec :
- Cercle jaune #FBCC5C au centre haut
- Courbe (arc) jaune dessous (évoque un sourire / un étal ouvert)
- 2 petits points forest aux extrémités de la courbe

Code SVG exact :
```svg
<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
  <rect width="28" height="28" rx="8" fill="#2E3338"/>
  <circle cx="14" cy="10" r="3" fill="#FBCC5C"/>
  <path d="M 6 22 Q 14 16 22 22" stroke="#FBCC5C" stroke-width="2" 
    fill="none" stroke-linecap="round"/>
  <circle cx="6" cy="22" r="1.5" fill="#476520"/>
  <circle cx="22" cy="22" r="1.5" fill="#476520"/>
</svg>
```

## Copywriting validé (EN)

- **H1** : "Your shop, always open."
- **Sub** : "Turn your Instagram into a trusted boutique. Customers pay 
  with stablecoins. Funds unlock on delivery — held safely in escrow."
- **CTA** : "Open my shop" (avec "60 sec" en label droite)
- **Trust** : "Free to start · Non-custodial · 1.8% fee"
- **Escrow card label** : "Next order"
- **Partners divider** : "Partners"
- **Stats captions** : "MiniPay users" / "Countries" / "Network fee"

## Détails premium à appliquer

- **Box-shadow** container principal : `0 1px 2px rgba(46,51,56,0.04), 0 8px 32px rgba(46,51,56,0.06)`
- **Border-radius** : 36px container, 24px cards, 100px pills
- **Grain pattern** (subtile) : `radial-gradient(circle at 1px 1px, rgba(46,51,56,0.04) 1px, transparent 0); background-size: 20px 20px`
- **Pill highlight** : forest green sous mots-clés (ex: "instantly") avec 
  `position: absolute; bottom: 2px; height: 10px; z-index: -1; border-radius: 2px;`
- **Scan line** sur cards : `linear-gradient(90deg, transparent 0%, rgba(251,204,92,0.4) 50%, transparent 100%)` en top 1px
- **Glow radial** : `radial-gradient(circle, rgba(71,101,32,0.3) 0%, transparent 70%)` en corner

## Contraintes conservées

- ✅ Mobile-first strict 360px
- ✅ Touch targets minimum 44px
- ✅ Body minimum 16px (on a 15px-ready avec line-height généreux — à surveiller en implémentation)
- ✅ Aucune adresse 0x... affichée
- ✅ Terminologie MiniPay : "network fee", "stablecoin", "escrow"
- ✅ Pas de "gas", "crypto", "token" dans l'UI

## Principes pages non-landing

Direction de design pour les surfaces hors landing (marketplace,
dashboard, checkout, dialogs, forms, states). Tokens exacts définis
dans `tailwind.config.ts` (J9 Block 2) sous le namespace `celo`.

### Marketplace + product cards
- Border-radius : 24px (cards) — parité ProductCard public boutique
- Shadow : `0 1px 2px rgba(46,51,56,0.04), 0 8px 32px rgba(46,51,56,0.06)` (même que landing)
- Accent forest `#476520` sur seller name (link state)
- Body Inter 15-16px, prix Instrument Serif 22-24px
- Grid responsive : 1 col mobile / 2 col tablet / 3 col desktop

### Seller dashboard
- Tabs : background neutral, active state border-bottom forest 2px + text forest
- Body Celo Light `#FCFBF7` (pas d'inversion dark)
- Sections séparées par border `1px solid rgba(46,51,56,0.08)`, pas de cards lourdes
- Dialogs : border-radius 24px, shadow `0 8px 32px rgba(46,51,56,0.12)`
- Buttons cohérents Block 3 (Primary forest / Secondary ghost / Ghost text-only)

### Checkout flow
- Status states : pending (neutral `#2E3338`), success (forest `#476520`),
  error (red-celo dérivé palette, hex défini Block 2), info (neutral)
- Tx hashes : Inter monospace 13px, truncated middle (`0x12...ab34`)
- Step indicator : pills forest active / neutral inactive, transitions 200ms ease-out
- Confirm CTA : pill forest 100px radius, full-width mobile, dot jaune inside

### Dialogs / modals
- Border-radius : 24px (container), header optional dark hero `#2E3338` avec text Celo Light
- Backdrop : `rgba(46,51,56,0.4)` blur 8px
- Body padding 24px, max-width 480px mobile-first
- Close button : icon X 20px, top-right 16px, ghost ring forest on focus

### Forms
- Input : border-radius 12px, border `1px solid rgba(46,51,56,0.16)`, padding 12px 16px
- Focus state : ring 2px forest `#476520`, border transparent
- Error state : ring 2px red-celo, helper text 13px red-celo
- Labels Inter 13px uppercase letter-spacing 0.5px (cohérent caption landing)

### States (Empty / Loading / Error)
- Illustrations : SVG subtiles forest accent (pas de mascotte, pas de stock illustrations)
- Copy : Inter 15px, max 2 lignes, ton encourageant ("Pas encore de commandes" pas "Aucune commande")
- CTA pill style 100px radius, secondary ghost ou primary selon contexte
- Loading : skeleton screens neutral (pas de spinner), pulse animation 1.5s ease-in-out
- Error : icon ⚠ 20px red-celo + button "Try again" ghost forest

## Références officielles utilisées

- Celo Brand Kit : https://celo.org/brand-kit
- Celo Brand Kit Color : https://staging.celo.org/experience/brand/color
- MiniPay Press Kit : https://minipay.to/press-kit
- MiniPay Dev Docs : https://docs.celo.org/build-o
