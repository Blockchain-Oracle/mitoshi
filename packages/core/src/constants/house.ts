import type { Network } from "./network";

/**
 * The house's own trading keys per network (acceptance/S0.md S0.10): `keeper` (the house taker), `seed-maker` (the
 * venue's maker), `earn-quoter` (quotes the maker vault) and `desk` (fills private tickets for their owners). `/stats`
 * and the leaderboard count wallets without them (L-15, L-48), so the house never reads as demand. Mainnet's role keys
 * are created at S19, which adds them here before the first mainnet Window.
 */
export const HOUSE_TRADERS: Record<Network, readonly `0x${string}`[]> = {
  testnet: [
    "0x6ed3a4b6e42b2c45211074f8d7ba58dbb2faad0c",
    "0x160a25fffa76652ba236ce97395b4d6c51bc3fc0",
    "0x51d3f6367fdcaba7f1efbbc04d0d960bc8eede9a",
    "0x9540cdcd69636229be905225979a7e5baa044cb9",
  ],
  mainnet: [],
};

/**
 * Keys whose launches are the team's own — QA and drive runs, not the market (R6 money, S08; D-230): the launch area's
 * deployer (`contracts/deployments/42431/launch.json`, also the drive scripts' launch lane key, `deployer-launch`) and
 * the house's trading keys. `/launch` hides their launches unless asked (`?test=1`) and tags them "Test" when shown;
 * a link to one always opens.
 */
export const TEAM_LAUNCHERS: Record<Network, readonly `0x${string}`[]> = {
  testnet: ["0x64b70cdd6dc30c3ff3eb79493ba17487a1071c96", ...HOUSE_TRADERS.testnet],
  mainnet: [...HOUSE_TRADERS.mainnet],
};

/** Whether `creator` is one of the team's keys on `network`. */
export const isTeamLauncher = (network: Network, creator: string): boolean => TEAM_LAUNCHERS[network].includes(creator.toLowerCase() as `0x${string}`);
