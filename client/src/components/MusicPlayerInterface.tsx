import {
  FaBackwardStep,
  FaForwardStep,
  FaPlay,
  FaPause,
  FaRepeat,
  FaShuffle,
  FaQuestion,
} from "react-icons/fa6";
import Timestamp from "./Timestamp";
import { FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { useEffect, useState, useRef } from "react";
import { Track } from "../types/track";

interface MusicPlayerInterfaceProps {
  track: Track | null;
  duration: number;
  timestamp: number;
  paused: boolean;
  looping: boolean;
  onShuffle: () => void;
  onBackward: () => void;
  onPlayToggle: () => void;
  onForward: () => void;
  onLoopToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (seekTime: number) => void; // Added prop
}

export default function MusicPlayerInterface({
  track,
  duration,
  timestamp,
  paused,
  looping,
  onShuffle,
  onBackward,
  onPlayToggle,
  onForward,
  onLoopToggle,
  onVolumeChange,
  onSeek, // Added prop
}: MusicPlayerInterfaceProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const volumeRef = useRef(1);
  const [volume, setVolume] = useState(1);

  useEffect(() => {}, [volume]);

  return (
    <div className="flex flex-col ml-6">
      <div className="card h-180 bg-base-200 rounded-none">
        <figure className="select-none bg-base-300 dark:bg-black">
          <div className="w-240 h-135 flex align-middle justify-center">
            {track?.id ? (
              <img
                src={`/.proxy/api/track/${track.id}/thumbnail-high`}
                width="100%"
                height="100%"
              />
            ) : (
              <FaQuestion size="100%" />
            )}
          </div>
        </figure>
        <div className="card-body x-10 h-50">
          <div>
            <h2 className="card-title font-bold truncate">
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
                />
                <div className="flex justify-between select-none">
                  <label children={<Timestamp timestamp={timestamp} />} />
                  <label children={<Timestamp timestamp={duration ?? 0} />} />
                </div>
              </div>
              <div className="flex justify-center items-center space-x-8">
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onShuffle}
                  children={<FaShuffle />}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onBackward}
                  children={<FaBackwardStep />}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onPlayToggle}
                  children={paused ? <FaPlay /> : <FaPause />}
                />
                <button
                  className="btn btn-xl btn-ghost btn-circle"
                  onClick={onForward}
                  children={<FaForwardStep />}
                />
                <button
                  className={`btn btn-xl btn-ghost btn-circle ${looping ? "btn-accent" : ""}`}
                  onClick={onLoopToggle}
                  children={<FaRepeat />}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center w-full mt-2 px-4 bg-base-200">
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
          />
        </div>
      </div>
    </div>
  );
}
