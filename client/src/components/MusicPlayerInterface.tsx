import {
  FaBackwardStep,
  FaForwardStep,
  FaPlay,
  FaPause,
  FaRepeat,
  FaShuffle,
} from "react-icons/fa6";
import Timestamp from "./Timestamp";
import { FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { useEffect, useState, useRef } from "react";
import { Track } from "../types/track";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { thumbnailUrlCacheHigh } from "../services/thumbnailCache";
import * as colorService from "../services/colorService";
import ContextMenu from "./ContextMenu";
import MarqueeText from "./MarqueeText";

interface MusicPlayerInterfaceProps {
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
  onPrimaryColorChange: (colors: [string, string]) => void;
  setSecret: (unlocked: boolean) => void;
}

export default function MusicPlayerInterface({
  track,
  duration,
  timestamp,
  paused,
  looping,
  shuffled,
  disabled = false,
  onShuffle,
  onBackward,
  onPlayToggle,
  onForward,
  onLoopToggle,
  onVolumeChange,
  onSeek,
  onPrimaryColorChange,
  setSecret,
}: MusicPlayerInterfaceProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const volumeRef = useRef(1);
  const [volume, setVolume] = useState(0.5);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const discordSDK = useDiscordSDK();
  let thumbUrl = "/black.jpg";
  if (track?.id) {
    if (thumbnailUrlCacheHigh.has(track.id))
      thumbUrl = thumbnailUrlCacheHigh.get(track.id)!;
    else {
      thumbUrl = `/api/track/${track.id}/thumbnail-high`;
      thumbnailUrlCacheHigh.set(track.id, thumbUrl);
    }
  }
  const [seekValue, setSeekValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  const secretClickCount = useRef(0);
  const secretClickTimeout = useRef<NodeJS.Timeout | null>(null);
  const secretUnlocked = useRef(false);
  const secretCooldown = useRef(false);
  
  useEffect(() => {
    if (!isSeeking) {
      // Prevent NaN: ensure timestamp and duration are valid numbers and duration > 0
      const safeTimestamp =
        typeof timestamp === "number" && !isNaN(timestamp) ? timestamp : 0;
      const safeDuration =
        typeof duration === "number" && duration > 0 ? duration : 1;
      setSeekValue(safeTimestamp % safeDuration);
    }
  }, [timestamp, duration, isSeeking]);

  useEffect(() => {
    setSeekValue(0);
  }, [track?.itemId]);

  useEffect(() => {
    let isMounted = true,
      objectUrl: string | null = null;
    async function fetchImage() {
      if (!thumbUrl) return;
      try {
        const response = await fetch(
          `${discordSDK.isEmbedded ? "/.proxy" : ""}${thumbUrl}`,
        );
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isMounted) setImageBlobUrl(objectUrl);
      } catch {
        setImageBlobUrl(null);
      }
    }
    fetchImage();
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [thumbUrl, discordSDK.isEmbedded]);

  return (
    <div className="flex flex-col md:ml-6 w-full md:w-1/2 max-w-200">
      <div className="card bg-transparent xs:bg-music-player-interface h-38 xs:h-auto rounded-none">
        <ContextMenu
          controlsDisabled={disabled}
          onCopyUrl={() => {
            if (track?.webpageUrl) {
              navigator.clipboard.writeText(track.webpageUrl);
            }
          }}
        >
          <figure className="select-none dark:bg-black">
            <div className="hidden xs:[@media(min-height:600px)]:flex w-200 align-middle justify-center aspect-video">
              <div className="flex items-center justify-center relative">
                <img
                  src={imageBlobUrl || "/black.jpg"}
                  width="100%"
                  height="100%"
                  className="object-cover w-full h-full"
                  onLoad={(e) =>
                    colorService
                      .getProminentColorFromUrl(e.currentTarget.src)
                      .then((colors) => {
                        onPrimaryColorChange(colors);
                      })
                  }
                />
              </div>
            </div>
          </figure>
        </ContextMenu>
        <div className="card-body h-50">
          <div>
            <MarqueeText>
              <h2 className="card-title font-bold">
                {track?.title?.trim() || "???"}
              </h2>
            </MarqueeText>
            <MarqueeText>
              <h4 className="text-sm">{track?.uploader?.trim() ?? "???"}</h4>
            </MarqueeText>
          </div>
          <div className="card-actions w-full">
            <div className="flex w-full justify-start flex-col ">
              <div>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={seekValue}
                  className="range range-sm w-full focus:outline-none focus:ring-0 focus:border-0"
                  onChange={(e) => {
                    setSeekValue(Number(e.target.value));
                    setIsSeeking(true);
                  }}
                  onMouseUp={() => {
                    onSeek(seekValue);
                    setIsSeeking(false);
                  }}
                  onTouchEnd={() => {
                    onSeek(seekValue);
                    setIsSeeking(false);
                  }}
                />
                <div className="flex justify-between select-none">
                  <label children={<Timestamp timestamp={timestamp} />} />
                  <label children={<Timestamp timestamp={duration ?? 0} />} />
                </div>
              </div>
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
      <div className="hidden xs:flex z-1 items-center justify-center w-full mt-2 px-4 bg-volume-slider">
        <div className="-ml-4">
          <button
            className="btn btn-xl btn-ghost btn-circle focus:outline-none focus:ring-0 focus:border-0"
            children={volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
            onDoubleClick={() => {
            }}
            onClick={() => {
              if (secretCooldown.current) return; // Prevent rapid toggling
              secretClickCount.current++;
              console.log("Secret click count:", secretClickCount.current);
              if (secretClickTimeout.current) {
                clearTimeout(secretClickTimeout.current);
              }
              if (secretClickCount.current >= 10) {
                secretUnlocked.current = !secretUnlocked.current;
                setSecret(secretUnlocked.current);
                secretClickCount.current = 0;
                secretCooldown.current = true;
                setTimeout(() => {
                  secretCooldown.current = false;
                }, 1000); // 1 second cooldown
              }
              secretClickTimeout.current = setTimeout(() => {
                secretClickCount.current = 0;
              }, 1000);
              if (volume === 0 && volumeRef.current === 0) {
                setVolume(0.5);
                volumeRef.current = 0.5;
                onVolumeChange(0.5);
              } else if (volume === 0) {
                setVolume(volumeRef.current);
                onVolumeChange(volumeRef.current);
              } else {
                volumeRef.current = volume;
                setVolume(0);
                onVolumeChange(0);
              }
            }}
          />
        </div>
        <div className="w-full">
          <input
            ref={volumeSlider}
            type="range"
            min={0}
            max={1}
            step={0.01}
            className={`range range-sm w-full focus:outline-none focus:ring-0 focus:border-0${isDraggingVolume ? " ring-2 ring-primary" : ""}`}
            value={volume}
            onChange={(e) => {
              const newVolume = e.target.valueAsNumber;
              volumeRef.current = newVolume;
              setVolume(newVolume);
              onVolumeChange(newVolume);
            }}
            onMouseDown={() => setIsDraggingVolume(true)}
            onMouseUp={() => setIsDraggingVolume(false)}
            onTouchStart={() => setIsDraggingVolume(true)}
            onTouchEnd={() => setIsDraggingVolume(false)}
          />
        </div>
      </div>
    </div>
  );
}
