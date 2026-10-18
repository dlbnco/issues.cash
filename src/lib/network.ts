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

export const fromPrismaToElectrumNetwork = (network: BCHNetwork): Network => {
  switch (network) {
    case BCHNetwork.MAINNET:
      return "mainnet";
    case BCHNetwork.TESTNET3:
      return "testnet3";
    default:
      throw new Error("Unsupported network");
  }
};
