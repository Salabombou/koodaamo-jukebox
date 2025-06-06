import type { AsyncReturnType } from "type-fest";
import { DiscordSDK } from "@discord/embedded-app-sdk";

export type TDiscordSDK = InstanceType<typeof DiscordSDK>;
export type TAuthenticateResponse = AsyncReturnType<
  TDiscordSDK["commands"]["authenticate"]
>;
