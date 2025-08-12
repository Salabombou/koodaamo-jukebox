import { useCallback, useEffect, useRef, useState } from "react";
import { FaBackwardStep, FaForwardStep, FaPause, FaPlay, FaRepeat, FaShuffle } from "react-icons/fa6";

import { useDiscordSDK } from "../../hooks/useDiscordSDK";
import { useRoomCode } from "../../hooks/useRoomCode";
import * as thumbnailService from "../../services/thumbnailService";
import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import type { AboutModalRef } from "../common/AboutModal";
import AboutModal from "../common/AboutModal";
import type { ContextMenuItem } from "../common/ContextMenu";
import ContextMenu from "../common/ContextMenu";
import MarqueeText from "../common/MarqueeText";
import PlayerSeekBar from "../common/PlayerSeekBar";
import VolumeSlider from "../common/VolumeSlider";

import QueueMobile from "./QueueMobile";

/**
 * Props for the mobile interface component that encapsulates player controls and the queue overlay.
 */
interface InterfaceMobileProps {
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
  // Queue props
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentItemIndex: number | null;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
}

/**
 * Mobile layout wrapper combining artwork, track metadata (with marquee overflow), controls and the queue overlay.
 */
export default function InterfaceMobile({
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
  tracks,
  queueList,
  currentItemIndex,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
}: InterfaceMobileProps) {
  const discordSDK = useDiscordSDK();
  const roomCode = useRoomCode();
  const aboutModalRef = useRef<AboutModalRef>(null);

  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [dropdownClosed, setDropdownClosed] = useState(true);
  const handleDropdownAction = useCallback((action: "open" | "close") => {
    setDropdownClosed(action === "close");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnail() {
      if (!track?.id) {
        setImageBlobUrl(null);
        return;
      }
      const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${track.id}/thumbnail-high`;
      const objectUrl = await thumbnailService.getThumbnail(thumbnailUrl);
      if (!cancelled) setImageBlobUrl(objectUrl);
    }
    fetchThumbnail();
    return () => {
      cancelled = true;
      if (track?.id) {
        const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${track.id}/thumbnail-high`;
        thumbnailService.removeThumbnail(thumbnailUrl);
      }
    };
  }, [track?.id, discordSDK.isEmbedded]);

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
    <>
      {/* Player section: hidden when dropdown is open */}
      <div className={`w-5/6 mb-20 flex flex-col text-white transition-opacity duration-300 ease-in-out justify-start ${dropdownClosed ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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

      {/* Mobile Queue Overlay toggle and list - stays visible */}
      <QueueMobile
        tracks={tracks}
        queueList={queueList}
        currentTrack={track}
        currentItemIndex={currentItemIndex}
        paused={paused}
        loop={looping}
        controlsDisabled={disabled}
        timestamp={timestamp}
        duration={duration}
        onDropdownAction={handleDropdownAction}
        onPlayToggle={onPlayToggle}
        onLoopToggle={onLoopToggle}
        onMove={onMove}
        onSkip={onSkip}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
      />
    </>
  );
}
