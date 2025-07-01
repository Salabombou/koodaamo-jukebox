import { type ReactNode, createContext, useContext, useState, useRef, useEffect } from "react";
import { useDiscordSDK } from "./useDiscordSdk";

const OAuth2CodeContext = createContext<string | null>(null);
export function useOAuth2Code() {
  return useContext(OAuth2CodeContext);
}

export function OAuth2CodeProvider({ children }: { children: ReactNode }) {
  const discordSdk = useDiscordSDK();
  const [oAuth2Code, setOAuth2Code] = useState<string | null>(null);
  const settingUp = useRef(false);
  useEffect(() => {
    if (settingUp.current) return;
    settingUp.current = true;
    (async () => {
      if (import.meta.env.DEV) {
        console.log(localStorage);
        console.log(new URLSearchParams(window.location.search));
      }
      if (!discordSdk.isEmbedded) {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) setOAuth2Code(code);
        else if (Date.now() >= parseInt(localStorage.getItem("expiresAt") || "0")) {
          window.location.href = import.meta.env.VITE_DISCORD_OAUTH2_URL;
        } else setOAuth2Code("");
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.toString());
      } else {
        const { code } = await discordSdk.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_APPLICATION_ID,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "rpc.activities.write"],
        });
        setOAuth2Code(code);
      }
    })();
  }, [discordSdk]);
  if (oAuth2Code === null) return <p>Loading...</p>;
  return <OAuth2CodeContext.Provider value={oAuth2Code}>{children}</OAuth2CodeContext.Provider>;
}
