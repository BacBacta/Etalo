# Etalo — Smart Contracts Reference

## Deployed Addresses (Celo Sepolia Testnet)

| Contract | Address | Explorer |
|---|---|---|
| MockUSDT | `0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6` | [Blockscout](https://celo-sepolia.blockscout.com/address/0x4212d248fc28c7aa0ae0e5982051b5e9d2a12dc6#code) |
| EtaloReputation | `0xc9d3f823a4c985bd126899573864dba4a6601ef4` | [Blockscout](https://celo-sepolia.blockscout.com/address/0xc9d3f823a4c985bd126899573864dba4a6601ef4#code) |
| EtaloEscrow | `0x652e0278f4a1b7915dc89f53ab3e5c35696cb455` | [Blockscout](https://celo-sepolia.blockscout.com/address/0x652e0278f4a1b7915dc89f53ab3e5c35696cb455#code) |
| EtaloDispute | `0x438ed447c5467abb6395b56a88bfec7a80c489e9` | [Blockscout](https://celo-sepolia.blockscout.com/address/0x438ed447c5467abb6395b56a88bfec7a80c489e9#code) |

**Network**: Celo Sepolia (Chain ID: 11142220)
**Solidity**: 0.8.24
**Deployer/Owner**: `0x66bD37325cf41dAd0035398854f209785C9bC4C2`

---

## EtaloEscrow

### Constants

| Name | Value | Description |
|---|---|---|
| COMMISSION_INTRA_BPS | 180 | 1.8% commission for intra-Africa orders |
| COMMISSION_CROSS_BPS | 270 | 2.7% commission for cross-border orders |
| AUTO_RELEASE_INTRA | 3 days | Auto-release deadline for intra-Africa |
| AUTO_RELEASE_TOP_SELLER | 2 days | Auto-release for Top Seller status |
| AUTO_RELEASE_CROSS | 7 days | Auto-release for cross-border |
| CROSS_BORDER_MILESTONES | 4 | Number of progressive release milestones |

### Public Functions

| Function | Access | Description |
|---|---|---|
| `createOrder(seller, amount, isCrossBorder)` | Anyone | Creates order, returns orderId |
| `fundOrder(orderId)` | Buyer | Transfers USDT from buyer to escrow |
| `markShipped(orderId)` | Seller | Sets shipped status, starts auto-release timer |
| `confirmDelivery(orderId)` | Buyer | Releases all funds to seller |
| `releaseMilestone(orderId)` | Buyer | Releases 25% (cross-border only) |
| `triggerAutoRelease(orderId)` | Anyone | Releases funds after deadline |
| `cancelOrder(orderId)` | Buyer/Owner | Cancels unfunded order |
| `forceRefund(orderId)` | Owner | Emergency refund to buyer |

### Events

- `OrderCreated(orderId, buyer, seller, amount, isCrossBorder)`
- `OrderFunded(orderId, amount)`
- `OrderShipped(orderId)`
- `OrderDelivered(orderId)`
- `MilestoneReleased(orderId, milestoneIndex, amount)`
- `OrderCompleted(orderId, sellerAmount, commissionAmount)`
- `OrderDisputed(orderId)`
- `OrderRefunded(orderId, amount)`
- `AutoReleaseTriggered(orderId)`

---

## EtaloDispute

### Constants

| Name | Value |
|---|---|
| L1_DURATION | 48 hours |

### Public Functions

| Function | Access | Description |
|---|---|---|
| `openDispute(orderId, reason)` | Buyer | Opens L1 dispute, freezes auto-release |
| `resolveL1(orderId)` | Seller | Seller accepts, full refund to buyer |
| `escalateToL2(orderId)` | Buyer (or anyone after 48h) | Escalates to mediator level |
| `resolveL2(orderId, buyerRefundAmount)` | Assigned Mediator | Mediator decides split |
| `resolveL3(orderId, buyerRefundAmount)` | Owner | Admin final decision |
| `assignMediator(orderId, mediator)` | Owner | Assigns approved mediator |
| `approveMediator(mediator, approved)` | Owner | Approves/revokes mediator |

### Events

- `DisputeOpened(orderId, buyer, level, reason)`
- `DisputeEscalated(orderId, newLevel)`
- `DisputeResolved(orderId, outcome, buyerRefundAmount)`
- `MediatorAssigned(orderId, mediator)`

---

## EtaloReputation

### Constants

| Name | Value |
|---|---|
| TOP_SELLER_MIN_ORDERS | 20 |
| TOP_SELLER_MIN_SCORE | 80 |
| MAX_SCORE | 100 |

### Score Formula

```
base = 50
completionBonus = (ordersCompleted / totalOrders) * 30
volumeBonus = min(ordersCompleted, 100) / 100 * 10
disputePenalty = min(disputesLost * 10, 40)
score = base + completionBonus + volumeBonus - disputePenalty
```

### Public Functions

| Function | Access | Description |
|---|---|---|
| `recordCompletedOrder(seller, orderId, amount)` | Authorized | Records completed order |
| `recordDispute(seller, orderId, sellerLost)` | Authorized | Records dispute outcome |
| `checkAndUpdateTopSeller(seller)` | Authorized | Evaluates Top Seller status |
| `applySanction(seller, status)` | Owner | Suspends or bans seller |
| `getReputation(seller)` | Anyone | Returns full reputation struct |
| `isTopSeller(seller)` | Anyone | Returns boolean |
| `getAutoReleaseDays(seller, isCrossBorder)` | Anyone | Returns auto-release days |

### Events

- `OrderRecorded(seller, orderId, amount)`
- `DisputeRecorded(seller, orderId, sellerLost)`
- `TopSellerGranted(seller)` / `TopSellerRevoked(seller)`
- `SellerSanctioned(seller, newStatus)`
- `ScoreUpdated(seller, newScore)`
