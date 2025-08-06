import { useState } from "react";
import { useRoomCode } from "../hooks/useRoomCode";
import { useDiscordSDK } from "../hooks/useDiscordSdk";

interface RoomCodeButtonProps {
  className?: string;
}

export default function RoomCodeButton({ className = "" }: RoomCodeButtonProps) {
  const discordSDK = useDiscordSDK();
  const roomCode = useRoomCode();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (!roomCode) return;

    const url = `${window.location.origin}/?room_code=${roomCode}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      alert("Failed to copy room link. Please copy manually: " + url);
    }
  };

  if (!roomCode || discordSDK.isEmbedded) return null;

  return (
    <div onClick={handleCopyLink} className={`cursor-pointer transition-all duration-200 ${className}`} title="Click to copy room link">
      <span className="font-mono text-md">Room: {roomCode}</span>
      {copied && <span className="text-xs opacity-75 ml-2">Copied!</span>}
    </div>
  );
}
