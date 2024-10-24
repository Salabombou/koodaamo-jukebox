import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DiscordAuthProvider } from './hooks/useDiscordAuth.tsx';
import { DiscordSDKProvider } from './hooks/useDiscordSdk.tsx';
import { RoomProvider } from './hooks/useRoom.tsx';

import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiscordSDKProvider>
      <DiscordAuthProvider>
        <RoomProvider>
          <App />
        </RoomProvider>
      </DiscordAuthProvider>
    </DiscordSDKProvider>
  </StrictMode>
);
