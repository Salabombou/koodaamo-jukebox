import { useEffect, useState } from "react";

import type { Track } from "../../types/track";

import Timestamp from "./Timestamp";

interface PlayerSeekBarProps {
  track: (Track & { itemId: number }) | null;
  duration: number;
  timestamp: number;
  onSeek: (seekTime: number) => void;
}

export default function PlayerSeekBar({ track, duration, timestamp, onSeek }: PlayerSeekBarProps) {
  const [seekValue, setSeekValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    if (!isSeeking) {
      // Prevent NaN: ensure timestamp and duration are valid numbers and duration > 0
      const safeTimestamp = typeof timestamp === "number" && !isNaN(timestamp) ? timestamp : 0;
      const safeDuration = typeof duration === "number" && duration > 0 ? duration : 1;
      setSeekValue(safeTimestamp % safeDuration);
    }
  }, [timestamp, duration, isSeeking]);

  useEffect(() => {
    setSeekValue(0);
  }, [track?.itemId]);

  return (
    <div className="flex flex-col w-full">
      <input
        type="range"
        min="0"
        max={duration}
        value={Math.floor(seekValue)}
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
        onKeyDown={(e) => e.preventDefault()}
      />
      <div className="flex justify-between select-none">
        <label children={<Timestamp timestamp={timestamp} />} />
        <label children={<Timestamp timestamp={duration ?? 0} />} />
      </div>
    </div>
  );
}
