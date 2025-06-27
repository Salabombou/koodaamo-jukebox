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
  useEffect(() => {
    if (settingUp.current || typeof oAuth2Code !== "string") return;
    settingUp.current = true;
    (async () => {
      let accessToken = localStorage.getItem("accessToken");
      let authToken = localStorage.getItem("authToken");
      let refreshToken = localStorage.getItem("refreshToken");
      let expiresAt = localStorage.getItem("expiresAt");
      let responsePromise: Promise<Response>;
      if (
        discordSDK.isEmbedded ||
        !accessToken ||
        !authToken ||
        !refreshToken ||
        !expiresAt ||
        Date.now() >= parseInt(expiresAt)
      ) {
        responsePromise = fetch(
          `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/auth`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oAuth2Code,
              roomCode,
              isEmbedded: discordSDK.isEmbedded,
            }),
          },
        );
      } else {
        responsePromise = fetch(
          `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refreshToken,
              roomCode,
              isEmbedded: discordSDK.isEmbedded,
            }),
          },
        );
      }
      const response = await responsePromise
        .then((res) => res.json() as Promise<AuthResponse>)
        .catch((err) => {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("authToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("expiresAt");
          console.error("Failed to authenticate:", err);
          throw err;
        });
      accessToken = response.accessToken;
      authToken = response.authToken;
      refreshToken = response.refreshToken;
      expiresAt = String(Date.now() + response.expiresIn * 1000);
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("authToken", authToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("expiresAt", expiresAt);
      const newAuth = await discordSDK.commands.authenticate({
        access_token: accessToken,
      });
      setAuth(newAuth);
    })();
  }, [discordSDK, oAuth2Code]);
  if (auth === null) return <p>Loading...</p>;
  return (
    <DiscordAuthContext.Provider value={auth}>
      {children}
    </DiscordAuthContext.Provider>
  );
}
