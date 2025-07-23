import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import type { TAuthenticateResponse } from "../types/discord";
import type { AuthResponse } from "../types/auth";
import { useDiscordSDK } from "./useDiscordSdk";
import { useRoomCode } from "./useRoomCode";
import { useOAuth2Code } from "./useOAuth2Code";

const DiscordAuthContext = createContext<TAuthenticateResponse | null>(null);
export function useDiscordAuth() {
  return useContext(DiscordAuthContext);
}

export function DiscordAuthProvider({ children }: { children: ReactNode }) {
  const discordSDK = useDiscordSDK();
  const roomCode = useRoomCode();
  const oAuth2Code = useOAuth2Code();
  const [auth, setAuth] = useState<TAuthenticateResponse | null>(null);
  const settingUp = useRef(false);
  // Function to refresh authentication
  const refreshAuth = async () => {
    let accessToken = localStorage.getItem("access_token");
    let authToken = localStorage.getItem("auth_token");
    let refreshToken = localStorage.getItem("refresh_token");
    let expiresAt = localStorage.getItem("expires_at");
    let responsePromise: Promise<Response>;
    if (discordSDK.isEmbedded || !accessToken || !authToken || !refreshToken || !expiresAt || Date.now() >= parseInt(expiresAt)) {
      responsePromise = fetch(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          o_auth2_code: oAuth2Code,
          room_code: roomCode,
          is_embedded: discordSDK.isEmbedded,
        }),
      });
    } else {
      responsePromise = fetch(`${discordSDK.isEmbedded ? "/.proxy" : ""}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: refreshToken,
          room_code: roomCode,
          is_embedded: discordSDK.isEmbedded,
        }),
      });
    }
    const response = await responsePromise
      .then((res) => res.json() as Promise<AuthResponse>)
      .catch((err) => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("expires_at");
        console.error("Failed to authenticate:", err);
        throw err;
      });
    accessToken = response.access_token;
    authToken = response.auth_token;
    refreshToken = response.refresh_token;
    expiresAt = String(Date.now() + response.expires_in * 1000);
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("auth_token", authToken);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("expires_at", expiresAt);
    const newAuth = await discordSDK.commands.authenticate({
      access_token: accessToken,
    });
    setAuth(newAuth);
  };

  useEffect(() => {
    if (settingUp.current || typeof oAuth2Code !== "string") return;
    settingUp.current = true;
    refreshAuth();
  }, [discordSDK, oAuth2Code]);

  // Set up interval to refresh auth every 60 minutes
  useEffect(() => {
    if (!auth) return;
    const interval = setInterval(() => {
      refreshAuth();
    }, 60 * 60 * 1000); // 60 minutes
    return () => clearInterval(interval);
  }, [auth, discordSDK, oAuth2Code, roomCode]);
  if (auth === null) return <p>Loading...</p>;
  return <DiscordAuthContext.Provider value={auth}>{children}</DiscordAuthContext.Provider>;
}
