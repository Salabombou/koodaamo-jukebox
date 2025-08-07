import { FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { useEffect, useState, useRef, memo } from "react";

interface VolumeSliderProps {
  onVolumeChange: (volume: number) => void;
  setSecret: (unlocked: boolean) => void;
  className?: string;
}

function VolumeSlider({ onVolumeChange, setSecret, className = "" }: VolumeSliderProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const volumeRef = useRef(1);
  const [volume, setVolume] = useState(Number(localStorage.getItem("volume") ?? 0.01));
  const secretUnlocked = useRef(localStorage.getItem("secret") === "true");
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  const secretClickCount = useRef(0);
  const secretSinceLastClick = useRef(0);

  useEffect(() => {
    localStorage.setItem("volume", String(volume));
  }, [volume]);

  return (
    <div className={`flex z-1 items-center justify-center ${className}`}>
      <div className="-ml-4 -mr-2 -my-4">
        <button
          className="btn btn-xl btn-ghost btn-square rounded-none border-0 focus:outline-none focus:ring-0 focus:border-0 bg-transparent"
          children={volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          onClick={() => {
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
      <div className="w-full mb-1">
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
          onKeyDown={(e) => e.preventDefault()}
          onClick={() => {
            if (Date.now() - secretSinceLastClick.current >= 1000) {
              secretClickCount.current = 0;
            }
            secretSinceLastClick.current = Date.now();
            secretClickCount.current++;
            console.log("Secret click count:", secretClickCount.current);

            if (secretClickCount.current >= 10) {
              secretUnlocked.current = !secretUnlocked.current;
              localStorage.setItem("secret", String(secretUnlocked.current));
              setSecret(secretUnlocked.current);
              secretClickCount.current = 0;
            }
          }}
          onMouseDown={() => setIsDraggingVolume(true)}
          onMouseUp={() => setIsDraggingVolume(false)}
          onTouchStart={() => setIsDraggingVolume(true)}
          onTouchEnd={() => setIsDraggingVolume(false)}
        />
      </div>
    </div>
  );
}

export default memo(VolumeSlider);
