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
import Marquee from "react-fast-marquee";

interface MusicPlayerInterfaceProps {
  track: Track | null;
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
  onPrimaryColorChange: (color: string) => void;
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
}: MusicPlayerInterfaceProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const [activeButtonColor, setActiveButtonColor] = useState<string>("#ffffff");
  const volumeRef = useRef(1);
  // Initialize volume from localStorage, fallback to 1
  const [volume, setVolume] = useState(() => {
    const stored = localStorage.getItem("volume");
    return stored !== null ? Number(stored) : 1;
  });
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

  // Refs for measuring text and container widths
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const uploaderRef = useRef<HTMLHeadingElement>(null);
  const uploaderContainerRef = useRef<HTMLDivElement>(null);
  const [shouldMarqueeTitle, setShouldMarqueeTitle] = useState(false);
  const [shouldMarqueeUploader, setShouldMarqueeUploader] = useState(false);

  const [titleScrollWidth, setTitleScrollWidth] = useState(0);
  const [uploaderScrollWidth, setUploaderScrollWidth] = useState(0);

  // Helper to check marquee conditions
  const checkMarquee = () => {
    if (titleRef.current && titleContainerRef.current) {
      setShouldMarqueeTitle(
        titleRef.current.scrollWidth > titleContainerRef.current.offsetWidth
      );
      setTitleScrollWidth(titleRef.current.scrollWidth);
    }
    if (uploaderRef.current && uploaderContainerRef.current) {
      setShouldMarqueeUploader(
        uploaderRef.current.scrollWidth > uploaderContainerRef.current.offsetWidth
      );
      setUploaderScrollWidth(uploaderRef.current.scrollWidth);
    }
  };

  useEffect(() => {
    checkMarquee();
    window.addEventListener("resize", checkMarquee);
    window.addEventListener("orientationchange", checkMarquee);
    return () => {
      window.removeEventListener("resize", checkMarquee);
      window.removeEventListener("orientationchange", checkMarquee);
    };
  }, [track?.title, track?.uploader]);

  useEffect(() => {
    if (!isSeeking) setSeekValue(timestamp % duration);
  }, [timestamp, duration, isSeeking]);

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
    <div className="flex flex-col md:ml-6 w-full xl:w-1/2 max-w-150">
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
                  className="object-cover"
                  onLoad={(e) =>
                    colorService
                      .getProminentColorFromUrl(e.currentTarget.src)
                      .then((color) => {
                        onPrimaryColorChange(color);
                        setActiveButtonColor(color);
                      })
                  }
                />
              </div>
            </div>
          </figure>
        </ContextMenu>
        <div className="card-body h-50">
          <div>
            <div
              ref={titleContainerRef}
              style={{ width: "100%", overflow: "hidden" }}
            >
              {shouldMarqueeTitle ? (
                <Marquee pauseOnHover style={{ width: `${titleScrollWidth*2}px` }}>
                  <h2 ref={titleRef} className="card-title font-bold truncate">
                    {track?.title}
                  </h2>
                </Marquee>
              ) : (
                <h2 ref={titleRef} className="card-title font-bold truncate">
                  {track?.title }
                </h2>
              )}
            </div>
            <div
              ref={uploaderContainerRef}
              style={{ width: "100%", overflow: "hidden" }}
            >
              {shouldMarqueeUploader ? (
                <Marquee pauseOnHover style={{ width: `${uploaderScrollWidth*2}px` }}>
                  <h4 ref={uploaderRef} className="text-sm">
                    {track?.uploader ?? "???"}
                  </h4>
                </Marquee>
              ) : (
                <h4 ref={uploaderRef} className="text-sm">
                  {track?.uploader ?? "???"}
                </h4>
              )}
            </div>
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
                  //disabled={disabled}
                />
                <div className="flex justify-between select-none">
                  <label children={<Timestamp timestamp={timestamp} />} />
                  <label children={<Timestamp timestamp={duration ?? 0} />} />
                </div>
              </div>
              <div className="hidden xs:flex justify-center items-center space-x-3 md:space-x-8">
                <button
                  className={`btn btn-xl btn-ghost btn-circle hover:bg-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                  style={{
                    color: (shuffled && activeButtonColor) || undefined,
                    backgroundColor:
                      (shuffled && activeButtonColor + "33") || undefined,
                  }}
                  onClick={onShuffle}
                  children={<FaShuffle />}
                  //disabled={disabled}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle hover:bg-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                  onClick={onBackward}
                  children={<FaBackwardStep />}
                  //disabled={disabled}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle hover:bg-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                  onClick={onPlayToggle}
                  children={paused ? <FaPlay /> : <FaPause />}
                  //disabled={disabled}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle hover:bg-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                  onClick={onForward}
                  children={<FaForwardStep />}
                  //disabled={disabled}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle hover:bg-button-hover focus:outline-none focus:ring-0 focus:border-0`}
                  style={{
                    color: (looping && activeButtonColor) || undefined,
                    backgroundColor:
                      (looping && activeButtonColor + "33") || undefined,
                  }}
                  onClick={onLoopToggle}
                  children={<FaRepeat />}
                  //disabled={disabled}
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
            onClick={() => {
              if (volume === 0 && volumeRef.current === 0) {
                setVolume(0.05);
                volumeRef.current = 0.05;
                onVolumeChange(0.05);
                localStorage.setItem("volume", "0.05");
              } else if (volume === 0) {
                setVolume(volumeRef.current);
                onVolumeChange(volumeRef.current);
                localStorage.setItem("volume", String(volumeRef.current));
              } else {
                volumeRef.current = volume;
                setVolume(0);
                onVolumeChange(0);
                localStorage.setItem("volume", "0");
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
            className="range range-sm w-full focus:outline-none focus:ring-0 focus:border-0"
            value={volume}
            onChange={(e) => {
              const newVolume = e.target.valueAsNumber;
              volumeRef.current = newVolume;
              setVolume(newVolume);
              onVolumeChange(newVolume);
              localStorage.setItem("volume", String(newVolume));
            }}
          />
        </div>
      </div>
    </div>
  );
}
