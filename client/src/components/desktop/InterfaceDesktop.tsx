import { useEffect, useRef, useState } from "react";
import { FaInfoCircle } from "react-icons/fa";
import { FaBackwardStep, FaForwardStep, FaPause, FaPlay, FaRepeat, FaShuffle } from "react-icons/fa6";

import { useDiscordSDK } from "../../hooks/useDiscordSDK";
import * as thumbnailService from "../../services/thumbnailService";
import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import type { AboutModalRef } from "../common/AboutModal";
import AboutModal from "../common/AboutModal";
import ContextMenu from "../common/ContextMenu";
import MarqueeText from "../common/MarqueeText";
import PlayerSeekBar from "../common/PlayerSeekBar";
import RoomCodeButton from "../common/RoomCodeButton";
import SeekOverlay from "../common/SeekOverlay";
import VolumeSlider from "../common/VolumeSlider";

import QueueDesktop from "./QueueDesktop";

interface InterfaceDesktopProps {
  track: Track | null;
  currentItemId: number | null;
  duration: number;
  volume: number;
  timestamp: number;
  paused: boolean;
  shuffled: boolean;
  looping: boolean;
  disabled?: boolean;
  onShuffle: () => void;
  onBackward: () => void;
  onPlayToggle: () => void;
  onForward: () => void;
  onLoopToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onSeekBarSeek: (seekTime: number) => void;
  onPositionSeek: (seconds: number) => void;
  // Queue props moved inside InterfaceDesktop
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentItemIndex: number | null;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
}

export default function MusicPlayerInterface({
  track,
  currentItemId,
  duration,
  volume,
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
  onSeekBarSeek,
  onPositionSeek,
  tracks,
  queueList,
  currentItemIndex,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
}: InterfaceDesktopProps) {
  const discordSDK = useDiscordSDK();
  const aboutModalRef = useRef<AboutModalRef>(null);

  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  // Replaced useThumbnail hook with direct service usage

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

  return (
    <div className="hidden md:flex relative z-2 w-full h-full flex-1 items-center justify-center">
      {/* Left: Player UI */}
      <div className={`flex flex-col md:ml-6 w-full md:w-1/2 max-w-200 transition-opacity duration-300 ease-in-out`}>
        <div className="hidden xs:flex justify-between items-center mx-1">
          <RoomCodeButton />
          <div className="flex-1" />
          <button className="btn btn-xs btn-ghost btn-circle hover:bg-base-200" onClick={() => aboutModalRef.current?.open()} aria-label="About">
            <FaInfoCircle className="text-lg" />
          </button>
        </div>

        <div className="card bg-transparent xs:bg-music-player-interface h-38 xs:h-auto rounded-none">
          <ContextMenu
            controlsDisabled={disabled}
            items={[
              {
                children: "Copy URL",
                action: () => {
                  if (track?.webpage_url) {
                    navigator.clipboard.writeText(track.webpage_url);
                  }
                },
              },
            ]}
          >
            <figure className="select-none dark:bg-black">
              <div className="hidden xs:[@media(min-height:700px)]:flex w-200 align-middle justify-center aspect-video select-none">
                <div className="aspect-video flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative select-none">
                  <img src={imageBlobUrl || "/black.jpg"} width="100%" height="100%" className="w-full h-full object-cover object-center aspect-square bg-black select-none" draggable={false} />
                  <SeekOverlay className="rounded-none" width="25%" onSeek={onPositionSeek} />
                </div>
              </div>
            </figure>
          </ContextMenu>
          <div className="card-body h-50">
            <div>
              <MarqueeText>
                <h2 className="card-title font-semibold select-none">{track?.title?.trim() || "???"}</h2>
              </MarqueeText>
              <MarqueeText>
                <h4 className="text-s opacity-75 select-none">{track?.uploader?.trim() ?? "???"}</h4>
              </MarqueeText>
            </div>
            <div className="card-actions w-full">
              <div className="flex w-full justify-start flex-col ">
                <PlayerSeekBar itemId={currentItemId} duration={duration} timestamp={timestamp} onSeek={onSeekBarSeek} />
                <div className="hidden xs:flex justify-center items-center space-x-3 lg:space-x-8 xl:space-x-5">
                  <button
                    className={`btn btn-xl btn-ghost btn-circle border-0 shadow-none hover:bg-music-player-interface-button-hover focus:outline-none focus:ring-0 focus:border-0 ${shuffled ? "btn-active" : ""}`}
                    onClick={onShuffle}
                    children={<FaShuffle />}
                  />
                  <button
                    className={`btn btn-xl btn-ghost btn-circle border-0 shadow-none hover:bg-music-player-interface-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                    onClick={onBackward}
                    children={<FaBackwardStep />}
                  />
                  <button
                    className={`btn btn-xl btn-ghost btn-circle border-0 shadow-none hover:bg-music-player-interface-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                    onClick={onPlayToggle}
                    children={paused ? <FaPlay /> : <FaPause />}
                  />
                  <button
                    className={`btn btn-xl btn-ghost btn-circle border-0 shadow-none hover:bg-music-player-interface-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                    onClick={onForward}
                    children={<FaForwardStep />}
                  />
                  <button
                    className={`btn btn-xl btn-ghost btn-circle border-0 shadow-none hover:bg-music-player-interface-button-hover focus:outline-none focus:ring-0 focus:border-0 ${looping ? "btn-active" : ""}`}
                    onClick={onLoopToggle}
                    children={<FaRepeat />}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <VolumeSlider volume={volume} onVolumeChange={onVolumeChange} className="bg-volume-slider mt-4 p-4" />
        <AboutModal ref={aboutModalRef} />
      </div>

      {/* Right: Queue */}
      <QueueDesktop
        tracks={tracks}
        queueList={queueList}
        currentItemId={currentItemId}
        currentItemIndex={currentItemIndex}
        controlsDisabled={disabled}
        onMove={onMove}
        onSkip={onSkip}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
      />
    </div>
  );
}
