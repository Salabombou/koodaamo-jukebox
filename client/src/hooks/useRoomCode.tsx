import { type ReactNode, createContext, useContext, useState } from "react";
import { useDiscordSDK } from "./useDiscordSdk";
import { CodeInput } from "../components/CodeInput";

const RoomCodeContext = createContext<string | null>(null);
export function useRoomCode() {
  return useContext(RoomCodeContext);
}

export function RoomCodeProvider({ children }: { children: ReactNode }) {
  const discordSdk = useDiscordSDK();
  const [roomCode, setRoomCode] = useState<string | null>(discordSdk.isEmbedded ? discordSdk.instanceId : sessionStorage.getItem("roomCode"));
  const [inputCode, setInputCode] = useState("");
  const handleRandom = () => setInputCode(Math.floor(100000 + Math.random() * 900000).toString());
  const handleSet = () => {
    if (/^[0-9]{6}$/.test(inputCode)) setRoomCode(inputCode);
  };
  if (roomCode === null || (!/^[0-9]{6}$/.test(roomCode) && !discordSdk.isEmbedded)) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8">
          <h2 className="text-2xl md:text-4xl font-bold mb-6 text-center">Enter Room Code</h2>
          <CodeInput value={inputCode} onChange={setInputCode} onRandom={handleRandom} onSet={handleSet} />
        </div>
      </div>
    );
  }
  sessionStorage.setItem("roomCode", roomCode);
  const url = new URL(window.location.href);
  url.searchParams.set("roomCode", roomCode);
  window.history.replaceState({}, "", url.toString());
  return <RoomCodeContext.Provider value={roomCode}>{children}</RoomCodeContext.Provider>;
}
