import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { TAuthenticateResponse } from "../types/discord";
import type { AuthResponse } from "../types/auth";
import { useDiscordSDK } from "./useDiscordSdk";

const DiscordAuthContext = createContext<TAuthenticateResponse | null>(null);

export function useDiscordAuth() {
  return useContext(DiscordAuthContext)! as TAuthenticateResponse;
}

export function DiscordAuthProvider({ children }: { children: ReactNode }) {
  async function setupDiscordAuth() {
    const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_APPLICATION_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });

    const response = await fetch("/.proxy/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, instanceId: discordSdk.instanceId }),
    }).then((res) => res.json() as Promise<AuthResponse>);

    const { accessToken, authToken } = response;

    localStorage.setItem("authToken", authToken);

    const newAuth = await discordSdk.commands.authenticate({
      access_token: accessToken,
    });

    setAuth(newAuth);
  }

  const [auth, setAuth] = useState<TAuthenticateResponse | null>(null);

  const discordSdk = useDiscordSDK();

  const settingUp = useRef(false);
  useEffect(() => {
    if (!settingUp.current) {
      settingUp.current = true;
      setupDiscordAuth();
    }
  }, [discordSdk]);

  if (auth === null) {
    return <p>Authenticating...</p>;
  }

  return (
    <DiscordAuthContext.Provider value={auth}>
      {children}
    </DiscordAuthContext.Provider>
  );
}
