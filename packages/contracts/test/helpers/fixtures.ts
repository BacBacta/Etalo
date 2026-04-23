import { parseUnits } from "viem";

export const USDT_DECIMALS = 6;
export const toUSDT = (amount: number) => parseUnits(amount.toString(), USDT_DECIMALS);

export async function deployReputation(viem: any) {
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [deployer, buyer, seller, mediator] = walletClients;

  const reputation = await viem.deployContract("EtaloReputation");

  return { reputation, deployer, buyer, seller, mediator, publicClient };
}

export async function increaseTime(publicClient: any, seconds: number) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  } as any);
  await publicClient.request({ method: "evm_mine", params: [] } as any);
}

export async function expectRevert(promise: Promise<any>, message?: string) {
  try {
    await promise;
    throw new Error("__EXPECTED_REVERT__");
  } catch (error: any) {
    if (error.message === "__EXPECTED_REVERT__") {
      throw new Error(`Expected transaction to revert${message ? ` with "${message}"` : ""}`);
    }
    if (message) {
      const errorStr = error.message || error.toString();
      if (!errorStr.includes(message)) {
        throw new Error(`Expected revert with "${message}" but got: ${errorStr.slice(0, 200)}`);
      }
    }
  }
}
