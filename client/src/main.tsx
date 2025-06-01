import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";

import { DiscordSDKProvider } from "./hooks/useDiscordSdk";
import { DiscordAuthProvider } from "./hooks/useDiscordAuth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DiscordSDKProvider>
      <DiscordAuthProvider>
        <App />
      </DiscordAuthProvider>
    </DiscordSDKProvider>
  </StrictMode>,
);
