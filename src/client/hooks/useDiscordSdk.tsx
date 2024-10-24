import React, { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';

import { DiscordSDK, DiscordSDKMock, RPCCloseCodes } from '@discord/embedded-app-sdk';

const DiscordSDKContext = createContext<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);

export function useDiscordSDK() {
  return useContext(DiscordSDKContext)!;
}

export function DiscordSDKProvider({ children }: { children: ReactNode }) {
  const setupDiscordSDK = async () => {
    let sdk: (DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean };

    const isEmbedded = location.hostname === `${import.meta.env.VITE_DISCORD_CLIENT_ID}.discordsays.com`;
    if (isEmbedded) {
      sdk = Object.assign(
        new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID, {
          disableConsoleLogOverride: true
        }),
        { isEmbedded }
      );
    } else {
      let mockUserId = sessionStorage.getItem('mock_user_id');
      let mockAccessToken = sessionStorage.getItem('mock_access_token');

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          code: 'mock',
          user_id: mockUserId,
          access_token: mockAccessToken
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then((res) => {
        if (!res.ok) {
          throw new Error('Failed to authenticate');
        }
        return res.json();
      });

      mockUserId = response.user_id as string;
      mockAccessToken = response.access_token as string;

      sessionStorage.setItem('mock_user_id', mockUserId);
      sessionStorage.setItem('mock_access_token', mockAccessToken);

      sdk = Object.assign(new DiscordSDKMock(import.meta.env.VITE_DISCORD_CLIENT_ID, null, null), {
        isEmbedded
      });

      sdk._updateCommandMocks({
        authenticate: async () => {
          return {
            access_token: mockAccessToken,
            user: {
              username: mockUserId,
              discriminator: '0001',
              id: mockUserId,
              avatar: null,
              public_flags: 1
            },
            scopes: [],
            expires: new Date(3000, 1, 1).toString(),
            application: {
              description: 'mock_description',
              icon: 'mock_icon',
              id: 'mock_id',
              name: 'mock_name'
            }
          };
        }
      });
    }

    await sdk.ready();
    setSDK(sdk);
  };
  const [sdk, setSDK] = useState<((DiscordSDK | DiscordSDKMock) & { isEmbedded: boolean }) | null>(null);

  const settingUp = useRef(false);
  useEffect(() => {
    if (!settingUp.current) {
      settingUp.current = true;
      setupDiscordSDK();
    }

    return () => {
      if (sdk) {
        sdk.close(RPCCloseCodes.CLOSE_NORMAL, 'unmount');
      }
    };
  }, []);

  if (sdk === null) {
    return <p>Setting up SDK...</p>;
  }

  return <DiscordSDKContext.Provider value={sdk}>{children}</DiscordSDKContext.Provider>;
}
