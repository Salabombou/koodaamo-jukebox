import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { DiscordSDK, RPCCloseCodes } from "@discord/embedded-app-sdk";

const DiscordSDKContext = createContext<DiscordSDK | null>(null);

export function useDiscordSDK() {
  return useContext(DiscordSDKContext)!;
}

export function DiscordSDKProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<DiscordSDK | null>(null);

  const setupDiscordSDK = async () => {
    const newSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_APPLICATION_ID, {
      disableConsoleLogOverride: true,
    });

    await newSdk.ready();
    setSdk(newSdk);
  };

  const settingUp = useRef(false);
  useEffect(() => {
    if (!settingUp.current) {
      settingUp.current = true;
      setupDiscordSDK();
    }

    return () => {
      if (sdk) {
        sdk.close(RPCCloseCodes.CLOSE_NORMAL, "unmount");
      }
    };
  }, []);

  if (sdk === null) {
    return <p>Setting up SDK...</p>;
  }

  return (
    <DiscordSDKContext.Provider value={sdk}>
      {children}
    </DiscordSDKContext.Provider>
  );
}
