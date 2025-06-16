import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { DiscordSDK, DiscordSDKMock, RPCCloseCodes } from "@discord/embedded-app-sdk";

const DiscordSDKContext = createContext<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);
export function useDiscordSDK() { return useContext(DiscordSDKContext)!; }

export function DiscordSDKProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);
  const settingUp = useRef(false);
  useEffect(() => {
    if (settingUp.current) return;
    settingUp.current = true;
    (async () => {
      let newSdk: DiscordSDK | DiscordSDKMock;
      const isEmbedded = location.hostname === `${import.meta.env.VITE_DISCORD_APPLICATION_ID}.discordsays.com`;
      if (isEmbedded) {
        newSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_APPLICATION_ID, { disableConsoleLogOverride: true });
      } else {
        newSdk = new DiscordSDKMock(import.meta.env.VITE_DISCORD_APPLICATION_ID, null, null, null);
        newSdk._updateCommandMocks({
          async authenticate({ access_token }: { access_token?: string | null }) {
            if (!access_token) throw new Error("Missing access_token");
            const user = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } }).then(res => res.json());
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
        });
      }
      localStorage.setItem("isEmbedded", String(isEmbedded));
      await newSdk.ready();
      setSdk(Object.assign(newSdk, { isEmbedded }));
    })();
    return () => { if (sdk) sdk.close(RPCCloseCodes.CLOSE_NORMAL, "unmount"); };
  }, []);
  if (sdk === null) return <p>Loading...</p>;
  return <DiscordSDKContext.Provider value={sdk}>{children}</DiscordSDKContext.Provider>;
}
