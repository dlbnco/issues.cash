import { BCHNetwork } from "@prisma/client";
import { Network } from "cashscript";

export const fromElectrumToPrismaNetwork = (network: Network): BCHNetwork => {
  switch (network) {
    case "mainnet":
      return BCHNetwork.MAINNET;
    case "testnet3":
      return BCHNetwork.TESTNET3;
    default:
      throw new Error("Unsupported network");
  }
};
