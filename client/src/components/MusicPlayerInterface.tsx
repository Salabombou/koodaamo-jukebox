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

interface MusicPlayerInterfaceProps {
  track: Track | null;
  duration: number;
  timestamp: number;
  paused: boolean;
  looping: boolean;
  disabled?: boolean;
  onShuffle: () => void;
  onBackward: () => void;
  onPlayToggle: () => void;
  onForward: () => void;
  onLoopToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (seekTime: number) => void; // Added prop
  onPrimaryColorChange: (color: string) => void;
}

export default function MusicPlayerInterface({
  track,
  duration,
  timestamp,
  paused,
  looping,
  disabled = false,
  onShuffle,
  onBackward,
  onPlayToggle,
  onForward,
  onLoopToggle,
  onVolumeChange,
  onSeek, // Added prop
  onPrimaryColorChange,
}: MusicPlayerInterfaceProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const volumeRef = useRef(1);
  const [volume, setVolume] = useState(1);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const discordSDK = useDiscordSDK();

  let thumbUrl = "/black.jpg";
  if (track?.id) {
    if (thumbnailUrlCacheHigh.has(track.id)) {
      thumbUrl = thumbnailUrlCacheHigh.get(track.id)!;
    } else {
      thumbUrl = `/api/track/${track.id}/thumbnail-high`;
      thumbnailUrlCacheHigh.set(track.id, thumbUrl);
    }
  }
  
  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    async function fetchImage() {
      if (!thumbUrl) return;
      try {
        const response = await fetch(
          `${discordSDK.isEmbedded ? "/.proxy/" : ""}${thumbUrl}`,
        );
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isMounted) setImageBlobUrl(objectUrl);
      } catch (e) {
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
    <div className="flex flex-col md:ml-6 w-full md:max-w-150 md:min-w-150">
      <div className="card bg-music-player-interface h-38  xs:h-auto rounded-none">
        <figure className="select-none dark:bg-black">
          <div className="w-200 flex align-middle justify-center">
            <div className="hidden xs:flex w-full h-full items-center justify-center">
              <img
                src={imageBlobUrl || ""}
                width="100%"
                height="100%"
                className="object-cover"
                onLoad={(e) => {
                  colorService
                    .getProminentColorFromUrl(e.currentTarget.src)
                    .then((color) => {
                      onPrimaryColorChange(color);
                    });
                }}
              />
            </div>
          </div>
        </figure>
        <div className="card-body h-50">
          <div>
            <h2 className="card-title font-bold truncate ">
              {track?.title ?? "???"}
            </h2>
            <h4 className="text-sm truncate">{track?.uploader ?? "???"}</h4>
          </div>
          <div className="card-actions w-full">
            <div className="flex w-full justify-start flex-col ">
              <div>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={timestamp}
                  className="range range-sm w-full"
                  onChange={(e) => onSeek(Number(e.target.value))}
                  disabled={disabled}
                />
                <div className="flex justify-between select-none">
                  <label children={<Timestamp timestamp={timestamp} />} />
                  <label children={<Timestamp timestamp={duration ?? 0} />} />
                </div>
              </div>
              <div className="hidden xs:flex justify-center items-center space-x-3 md:space-x-8">
                <button
                  className="btn btn-xl btn-ghost btn-circle hover:bg-button-hover"
                  onClick={onShuffle}
                  children={<FaShuffle />}
                  disabled={disabled}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onBackward}
                  children={<FaBackwardStep />}
                  disabled={disabled}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onPlayToggle}
                  children={paused ? <FaPlay /> : <FaPause />}
                  disabled={disabled}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onForward}
                  children={<FaForwardStep />}
                  disabled={disabled}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle ${
                    looping ? "btn-accent" : ""
                  }`}
                  onClick={onLoopToggle}
                  children={<FaRepeat />}
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden xs:flex items-center justify-center w-full mt-2 px-4 bg-volume-slider">
        <div className="-ml-4">
          <button
            className="btn btn-xl btn-ghost btn-circle"
            children={volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
            onClick={() => {
              if (
                volumeSlider.current!.valueAsNumber === 0 &&
                volumeRef.current === 0
              ) {
                volumeSlider.current!.valueAsNumber = 0.05;
                volumeRef.current = 0.05;
                setVolume(0.05);
                onVolumeChange(0.05);
              } else if (volumeSlider.current!.valueAsNumber === 0) {
                volumeSlider.current!.valueAsNumber = volumeRef.current;
                setVolume(volumeRef.current);
                onVolumeChange(volumeRef.current);
              } else {
                volumeSlider.current!.valueAsNumber = 0;
                setVolume(0);
                onVolumeChange(0);
              }
            }}
            disabled={disabled}
          />
        </div>
        <div className="w-full">
          <input
            ref={volumeSlider}
            type="range"
            min={0}
            max={1}
            step={0.01}
            className="range range-sm w-full"
            onChange={(e) => {
              volumeRef.current = e.target.valueAsNumber;
              setVolume(e.target.valueAsNumber);
              onVolumeChange(e.target.valueAsNumber);
            }}
            defaultValue={1}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
