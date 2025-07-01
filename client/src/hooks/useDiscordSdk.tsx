import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { DiscordSDK, DiscordSDKMock, RPCCloseCodes } from "@discord/embedded-app-sdk";
import { Client } from "@xhayper/discord-rpc";

const DiscordSDKContext = createContext<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);
export function useDiscordSDK() {
  return useContext(DiscordSDKContext)!;
}

export function DiscordSDKProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);
  const rpc = useRef<Client | null>(null);
  const settingUp = useRef(false);
  useEffect(() => {
    if (settingUp.current) return;
    settingUp.current = true;
    (async () => {
      let newSdk: DiscordSDK | DiscordSDKMock;
      const isEmbedded = location.hostname === `${import.meta.env.VITE_DISCORD_APPLICATION_ID}.discordsays.com`;
      if (isEmbedded) {
        newSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_APPLICATION_ID, {
          disableConsoleLogOverride: true,
        });
      } else {
        newSdk = new DiscordSDKMock(import.meta.env.VITE_DISCORD_APPLICATION_ID, null, null, null);

        newSdk._updateCommandMocks({
          async authenticate({ access_token }: { access_token?: string | null }) {
            if (!access_token) throw new Error("Missing access_token");
            const user = await fetch("https://discord.com/api/users/@me", {
              headers: { Authorization: `Bearer ${access_token}` },
            }).then((res) => res.json());

            if (!rpc.current || !rpc.current.isConnected) {
              // Does not work at the moment as RPC is in private beta
              rpc.current?.destroy();
              rpc.current = new Client({
                clientId: import.meta.env.VITE_DISCORD_APPLICATION_ID,
                transport: { type: "websocket" },
                //clientSecret: access_token,
              });

              rpc.current.on("ready", () => {
                console.log("Discord RPC client is ready");
              });

              try {
                await rpc.current.login({
                  accessToken: access_token,
                  scopes: ["rpc.activities.write", "identify"],
                });
                console.log("Discord RPC is ready");
              } catch (error) {
                console.error("Failed to connect to Discord RPC:", error);
              }
            }

            return {
              access_token,
              user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar ?? null,
                public_flags: 1,
                global_name: user.global_name ?? undefined,
              },
              scopes: ["identify"] as const,
              expires: new Date(Date.now() + 3600 * 1000).toISOString(),
              application: {
                description: "mock_description",
                icon: "",
                id: import.meta.env.VITE_DISCORD_APPLICATION_ID,
                name: "Mock Application",
              },
            };
          },
          async setActivity(args) {
            if (!rpc.current || !rpc.current.isConnected || !rpc.current.user) {
              throw new Error("RPC client not initialized");
            }
            try {
              return await rpc.current.user.setActivity({
                applicationId: import.meta.env.VITE_DISCORD_APPLICATION_ID,
                ...args,
              });
            } catch (error) {
              console.error("Failed to set activity:", error);
              throw error;
            }
          },
        });
      }
      localStorage.setItem("isEmbedded", String(isEmbedded));
      await newSdk.ready();
      setSdk(Object.assign(newSdk, { isEmbedded }));
    })();
    return () => {
      if (sdk) sdk.close(RPCCloseCodes.CLOSE_NORMAL, "unmount");
    };
  }, []);
  if (sdk === null) return <p>Loading...</p>;
  return <DiscordSDKContext.Provider value={sdk}>{children}</DiscordSDKContext.Provider>;
}
