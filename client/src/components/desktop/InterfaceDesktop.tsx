import { FaBackwardStep, FaForwardStep, FaPlay, FaPause, FaRepeat, FaShuffle } from "react-icons/fa6";
import { FaInfoCircle } from "react-icons/fa";
import RoomCodeButton from "../common/RoomCodeButton";
import PlayerSeekBar from "../common/PlayerSeekBar";
import { useEffect, useState, useRef } from "react";
import { Track } from "../../types/track";
import { useDiscordSDK } from "../../hooks/useDiscordSdk";
import { useThumbnail } from "../../hooks/useThumbnail";
import ContextMenu from "../common/ContextMenu";
import MarqueeText from "../common/MarqueeText";
import AboutModal, { AboutModalRef } from "../common/AboutModal";
import VolumeSlider from "../common/VolumeSlider";

interface InterfaceDesktopProps {
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

export default function MusicPlayerInterface({
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
}: InterfaceDesktopProps) {
  const discordSDK = useDiscordSDK();
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

  return (
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
              <PlayerSeekBar track={track} duration={duration} timestamp={timestamp} onSeek={onSeek} />
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
      <VolumeSlider onVolumeChange={onVolumeChange} setSecret={setSecret} className="bg-volume-slider mt-4 p-4" />
      <AboutModal ref={aboutModalRef} />
    </div>
  );
}
