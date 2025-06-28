import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { DiscordSDKProvider } from "./hooks/useDiscordSdk";
import { DiscordAuthProvider } from "./hooks/useDiscordAuth";
import { RoomCodeProvider } from "./hooks/useRoomCode";
import { OAuth2CodeProvider } from "./hooks/useOAuth2Code";
import ErrorBoundary from "./components/ErrorBoundary";

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
