import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Etalo Deployment Module
 *
 * Deploys: MockUSDT (testnet only) -> EtaloReputation -> EtaloEscrow -> EtaloDispute
 * Then links contracts together (dispute contract + authorized callers).
 *
 * Parameters:
 *   - treasury: address to receive commissions (defaults to deployer)
 *   - usdtAddress: use existing USDT (mainnet). If not set, deploys MockUSDT.
 */
const EtaloModule = buildModule("EtaloModule", (m) => {
  const deployer = m.getAccount(0);
  const treasury = m.getParameter("treasury", deployer);

  // If no USDT address provided, deploy MockUSDT (testnet)
  const mockUSDT = m.contract("MockUSDT", [], { id: "MockUSDT" });
  const usdtAddress = m.getParameter("usdtAddress", mockUSDT);

  // 1. Deploy EtaloReputation
  const reputation = m.contract("EtaloReputation", [], { id: "EtaloReputation" });

  // 2. Deploy EtaloEscrow
  const escrow = m.contract(
    "EtaloEscrow",
    [usdtAddress, treasury, reputation],
    { id: "EtaloEscrow" }
  );

  // 3. Deploy EtaloDispute
  const dispute = m.contract(
    "EtaloDispute",
    [escrow, reputation],
    { id: "EtaloDispute" }
  );

  // 4. Link: Escrow -> Dispute
  m.call(escrow, "setDisputeContract", [dispute], { id: "linkEscrowDispute" });

  // 5. Link: Reputation -> authorize Escrow
  m.call(reputation, "setAuthorizedCaller", [escrow, true], {
    id: "authorizeEscrow",
  });

  // 6. Link: Reputation -> authorize Dispute
  m.call(reputation, "setAuthorizedCaller", [dispute, true], {
    id: "authorizeDispute",
  });

  return { mockUSDT, reputation, escrow, dispute };
});

export default EtaloModule;
