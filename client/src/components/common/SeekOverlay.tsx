import React, { useRef, useState } from "react";
import { FaPlay } from "react-icons/fa";

type SeekOverlayProps = {
  className?: string;
  width: string;
  onSeek: (seconds: number) => void;
};

type Ripple = {
  key: number;
  x: number;
  y: number;
  size: number;
};

function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const clearRipples = () => setRipples([]);
  const createRipple = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    setRipples((prev) => [...prev, { key: Date.now() + Math.random(), x, y, size }]);
    setTimeout(() => setRipples((prev) => prev.slice(1)), 500);
  };
  return { ripples, createRipple, clearRipples };
}

const RippleCircle: React.FC<{ ripple: Ripple }> = ({ ripple }) => (
  <span
    className="absolute bg-white/25 rounded-full pointer-events-none z-20"
    style={{
      left: ripple.x,
      top: ripple.y,
      width: ripple.size,
      height: ripple.size,
      transform: `scale(0)`,
      animation: "ripple-effect 0.5s linear forwards",
    }}
  />
);

const SkipVisual: React.FC<{ seconds: number }> = ({ seconds }) => {
  const isNegative = seconds < 0;
  const playIcons = [0, 1, 2].map((i) => (
    <FaPlay
      key={i}
      className="animate-pulse"
      style={{
        ...(isNegative ? { transform: "scaleX(-1)" } : {}),
        animationDelay: `${500 * i}ms`,
      }}
    />
  ));
  return (
    <span className="mt-5 flex flex-col justify-center items-center text-white">
      <span className="flex flex-row">{isNegative ? playIcons.slice().reverse() : playIcons}</span>
      <span>{seconds} seconds</span>
    </span>
  );
};

// ...existing code...

const SeekOverlay: React.FC<SeekOverlayProps> = ({ className, width, onSeek }) => {
  const leftRipple = useRipple();
  const rightRipple = useRipple();
  const [seekCount, setSeekCount] = useState<number | null>(null); // positive for right, negative for left
  const [seekingActive, setSeekingActive] = useState(false);
  const [lastSide, setLastSide] = useState<"left" | "right" | null>(null);
  const nullingTimeout = useRef<number | null>(null);

  const reset = () => {
    setSeekCount(null);
    setSeekingActive(false);
    setLastSide(null);
  };
  const refreshNullingTimeout = () => {
    if (nullingTimeout.current) window.clearTimeout(nullingTimeout.current);
    nullingTimeout.current = window.setTimeout(reset, 500);
  };

  const handleClick = (side: "left" | "right", ripple: ReturnType<typeof useRipple>, otherRipple: ReturnType<typeof useRipple>) => (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    let newCount = 0;
    if (!seekingActive) {
      // Require double click to activate seeking
      if (seekCount === null) {
        setSeekCount(side === "right" ? 0 : 0);
        setLastSide(side);
        refreshNullingTimeout();
        return;
      }
      if (seekCount === 0 && lastSide === side) {
        newCount = side === "right" ? 1 : -1;
        setSeekCount(newCount);
        setSeekingActive(true);
        setLastSide(side);
        onSeek(newCount * 5);
        ripple.createRipple(e);
        otherRipple.clearRipples();
        refreshNullingTimeout();
        return;
      }
    } else {
      // Seeking is active
      if (lastSide !== side) {
        newCount = side === "right" ? 1 : -1;
      } else {
        newCount = (seekCount ?? 0) + (side === "right" ? 1 : -1);
      }
      setSeekCount(newCount);
      setLastSide(side);
      onSeek((side === "right" ? 1 : -1) * 5);
      ripple.createRipple(e);
      otherRipple.clearRipples();
      refreshNullingTimeout();
      return;
    }
    // If switching sides before seekingActive, reset for double click
    setSeekCount(0);
    setLastSide(side);
    refreshNullingTimeout();
  };

  React.useEffect(() => {
    return () => {
      if (nullingTimeout.current) window.clearTimeout(nullingTimeout.current);
    };
  }, []);

  return (
    <div className={`absolute inset-0 w-full h-full transition-colors duration-75 ${className} ${leftRipple.ripples.length || rightRipple.ripples.length || seekingActive ? "bg-black/50" : ""}`}>
      <button
        className={`absolute top-0 left-0 h-full z-10 overflow-hidden focus:outline-none focus:ring-0 transform-none ${className} ${leftRipple.ripples.length > 0 ? "bg-white/5" : "bg-transparent"}`}
        style={{ borderTopRightRadius: "50% 50%", borderBottomRightRadius: "50% 50%", width }}
        onClick={handleClick("left", leftRipple, rightRipple)}
      >
        {leftRipple.ripples.map((r) => (
          <RippleCircle key={r.key} ripple={r} />
        ))}
        {seekingActive && seekCount && seekCount < 0 && <SkipVisual seconds={seekCount * 5} />}
      </button>
      <button
        className={`absolute top-0 right-0 h-full z-10 overflow-hidden focus:outline-none focus:ring-0 transform-none ${className} ${rightRipple.ripples.length > 0 ? "bg-white/5" : "bg-transparent"}`}
        style={{ borderTopLeftRadius: "50% 50%", borderBottomLeftRadius: "50% 50%", width }}
        onClick={handleClick("right", rightRipple, leftRipple)}
      >
        {rightRipple.ripples.map((r) => (
          <RippleCircle key={r.key} ripple={r} />
        ))}
        {seekingActive && seekCount && seekCount > 0 && <SkipVisual seconds={seekCount * 5} />}
      </button>
    </div>
  );
};

export default SeekOverlay;
