/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_CELO_RPC_URL: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_ESCROW_CONTRACT: `0x${string}`;
  readonly VITE_DISPUTE_CONTRACT: `0x${string}`;
  readonly VITE_REPUTATION_CONTRACT: `0x${string}`;
  readonly VITE_USDT_CONTRACT: `0x${string}`;
  readonly VITE_PINATA_GATEWAY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  isMiniPay?: boolean;
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
