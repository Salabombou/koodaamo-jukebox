import React, { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';

import type { TAuthenticateResponse } from '../types/discordAuth.ts';
import { useDiscordSDK } from './useDiscordSdk.tsx';

const DiscordAuthContext = createContext<TAuthenticateResponse | null>(null);

export function useDiscordAuth() {
  return useContext(DiscordAuthContext)! as TAuthenticateResponse;
}

export function DiscordAuthProvider({ children }: { children: ReactNode }) {
  const setupDiscordAuth = async () => {
    if (!discordSdk.isEmbedded) {
      const mockAuth = await discordSdk.commands.authenticate({});
      setAuth(mockAuth);
      return;
    }

    const authBody = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify']
    });

    const response = await fetch('/.proxy/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...authBody, room: discordSdk.instanceId })
    }).then((res) => res.json());

    const { access_token } = response;

    const newAuth = await discordSdk.commands.authenticate({
      access_token
    });

    setAuth(newAuth);
  };
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

  return <DiscordAuthContext.Provider value={auth}>{children}</DiscordAuthContext.Provider>;
}
