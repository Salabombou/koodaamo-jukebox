import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import ErrorBoundary from "./components/common/ErrorBoundary";
import { DiscordAuthProvider } from "./hooks/useDiscordAuth";
import { DiscordSDKProvider } from "./hooks/useDiscordSDK";
import { OAuth2CodeProvider } from "./hooks/useOAuth2Code";
import { RoomCodeProvider } from "./hooks/useRoomCode";
import App from "./App";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <DiscordSDKProvider>
        <OAuth2CodeProvider>
          <RoomCodeProvider>
            <DiscordAuthProvider>
              <App />
            </DiscordAuthProvider>
          </RoomCodeProvider>
        </OAuth2CodeProvider>
      </DiscordSDKProvider>
    </ErrorBoundary>
  </StrictMode>,
);
