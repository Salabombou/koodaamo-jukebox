import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { AsyncReturnType } from "type-fest";

export type TDiscordSDK = InstanceType<typeof DiscordSDK>;
export type TAuthenticateResponse = AsyncReturnType<TDiscordSDK["commands"]["authenticate"]>;
