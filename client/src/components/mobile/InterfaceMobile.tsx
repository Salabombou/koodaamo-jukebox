import { FaBackwardStep, FaForwardStep, FaPlay, FaPause, FaRepeat, FaShuffle } from "react-icons/fa6";
import PlayerSeekBar from "../common/PlayerSeekBar";
import { useEffect, useState, useRef } from "react";
import { Track } from "../../types/track";
import { useDiscordSDK } from "../../hooks/useDiscordSdk";
import { useThumbnail } from "../../hooks/useThumbnail";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import MarqueeText from "../common/MarqueeText";
import VolumeSlider from "../common/VolumeSlider";
import { useRoomCode } from "../../hooks/useRoomCode";
import AboutModal, { AboutModalRef } from "../common/AboutModal";

interface InterfaceMobileProps {
  visible: boolean;
  track: (Track & { itemId: number }) | null;
  duration: number;
  timestamp: number;
  paused: boolean;
  shuffled: boolean;
  looping: boolean;
  disabled?: boolean;
  backgroundColor: string;
  onShuffle: () => void;
  onBackward: () => void;
  onPlayToggle: () => void;
  onForward: () => void;
  onLoopToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (seekTime: number) => void;
  setSecret: (unlocked: boolean) => void;
}

export default function InterfaceMobile({
  visible,
  track,
  duration,
  timestamp,
  paused,
  looping,
  shuffled,
  disabled,
  onShuffle,
  onBackward,
  onPlayToggle,
  onForward,
  onLoopToggle,
  onVolumeChange,
  onSeek,
  setSecret,
}: InterfaceMobileProps) {
  const discordSDK = useDiscordSDK();
  const roomCode = useRoomCode();
  const aboutModalRef = useRef<AboutModalRef>(null);

  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const { getThumbnail, clearThumbnails, removeThumbnail } = useThumbnail();

  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnail() {
      if (!track?.id) {
        setImageBlobUrl(null);
        return;
      }
      const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${track.id}/thumbnail-high`;
      const objectUrl = await getThumbnail(thumbnailUrl);
      if (!cancelled) setImageBlobUrl(objectUrl);
    }
    fetchThumbnail();
    return () => {
      cancelled = true;
      removeThumbnail(track?.id ?? "");
    };
  }, [track?.id, discordSDK.isEmbedded, getThumbnail, clearThumbnails]);

  // Create context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      children: "Copy URL",
      action: () => {
        if (track?.webpage_url) {
          navigator.clipboard.writeText(track.webpage_url);
        }
      },
    },
    {
      children: "Copy Room URL",
      action: async () => {
        if (!roomCode) return;

        const url = `${window.location.origin}/?room_code=${roomCode}`;

        try {
          await navigator.clipboard.writeText(url);
        } catch (err) {
          console.error("Failed to copy to clipboard:", err);
          alert("Failed to copy room link. Please copy manually: " + url);
        }
      },
    },
    {
      children: "About",
      action: () => {
        aboutModalRef.current?.open();
      },
    },
  ];

  return (
    <div className={`w-7/8 mb-20 flex flex-col text-white transition-opacity duration-300 ease-in-out justify-start ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      <ContextMenu controlsDisabled={disabled} items={contextMenuItems}>
        <div>
          <img src={imageBlobUrl || "/black.jpg"} alt="Track Thumbnail" className="aspect-square object-cover w-full h-full rounded-lg" />
        </div>
        <div className="flex flex-col items-center mt-2">
          <MarqueeText>
            <h2 className="text-lg font-semibold">{track?.title?.trim() || "???"}</h2>
          </MarqueeText>
          <MarqueeText>
            <h4 className="text-sm opacity-75">{track?.uploader?.trim() ?? "???"}</h4>
          </MarqueeText>
        </div>
      </ContextMenu>
      <div className="mt-2">
        <PlayerSeekBar track={track} duration={duration} timestamp={timestamp} onSeek={onSeek} />
      </div>
      <div className="mt-4">
        <div className="flex justify-between items-center">
          <button className={`btn btn-xl btn-ghost btn-circle ${shuffled ? "bg-white text-black" : ""}`} onClick={onShuffle} disabled={disabled} aria-label="Shuffle">
            <FaShuffle />
          </button>
          <button className="btn btn-xl btn-ghost btn-circle" onClick={onBackward} disabled={disabled} aria-label="Backward">
            <FaBackwardStep />
          </button>
          <button className="btn btn-xl btn-ghost btn-circle text-black bg-white" onClick={onPlayToggle} disabled={disabled} aria-label="Play/Pause">
            {paused ? <FaPlay /> : <FaPause />}
          </button>
          <button className="btn btn-xl btn-ghost btn-circle" onClick={onForward} disabled={disabled} aria-label="Forward">
            <FaForwardStep />
          </button>
          <button className={`btn btn-xl btn-ghost btn-circle ${looping ? "bg-white text-black" : ""}`} onClick={onLoopToggle} disabled={disabled} aria-label="Loop">
            <FaRepeat />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <VolumeSlider onVolumeChange={onVolumeChange} setSecret={setSecret} />
      </div>
      <AboutModal ref={aboutModalRef} />
    </div>
  );
}
