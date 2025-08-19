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
      <label>{seconds} seconds</label>
    </span>
  );
};

type SeekClicks = {
  totalClicks: number | null;
  handleClick: (cb: () => void) => void;
  reset: () => void;
};
function useSeekClicks(): SeekClicks {
  const [totalClicks, setTotalClicks] = useState<number | null>(null);
  const lastClick = useRef<number | null>(null);
  const nullingTimeout = useRef<number | null>(null);
  const reset = () => {
    setTotalClicks(null);
    lastClick.current = null;
  };
  const refreshNullingTimeout = () => {
    if (nullingTimeout.current) window.clearTimeout(nullingTimeout.current);
    nullingTimeout.current = window.setTimeout(reset, 500);
  };
  const handleClick = (cb: () => void) => {
    const now = Date.now();
    if (totalClicks === null) {
      lastClick.current = now;
      setTotalClicks(0);
      refreshNullingTimeout();
      return;
    }
    if (totalClicks === 0 && lastClick.current && now - lastClick.current <= 500) {
      setTotalClicks(1);
      refreshNullingTimeout();
      cb();
      return;
    }
    if (totalClicks > 0) {
      setTotalClicks(totalClicks + 1);
      refreshNullingTimeout();
      cb();
      return;
    }
    lastClick.current = now;
    setTotalClicks(0);
    refreshNullingTimeout();
  };
  return { totalClicks, handleClick, reset };
}

const SeekOverlay: React.FC<SeekOverlayProps> = ({ className, width, onSeek }) => {
  const leftRipple = useRipple();
  const rightRipple = useRipple();
  const left = useSeekClicks();
  const right = useSeekClicks();
  const [activeSide, setActiveSide] = useState<"left" | "right" | null>(null);

  // Unified click handler for both sides
  const handleClick =
    (side: "left" | "right", clicks: SeekClicks, seek: number, ripple: ReturnType<typeof useRipple>, otherRipple: ReturnType<typeof useRipple>) =>
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      clicks.handleClick(() => {
        setActiveSide(side);
        onSeek(seek);
        ripple.createRipple(e);
        otherRipple.clearRipples();
      });
    };

  React.useEffect(() => {
    if ((left.totalClicks ?? 0) === 0 && (right.totalClicks ?? 0) === 0) setActiveSide(null);
  }, [left.totalClicks, right.totalClicks]);

  return (
    <div className={`absolute inset-0 w-full h-full transition-colors duration-75 ${className} ${leftRipple.ripples.length || rightRipple.ripples.length ? "bg-black/50" : ""}`}>
      <button
        className={`absolute top-0 left-0 h-full z-10 overflow-hidden focus:outline-none focus:ring-0 transform-none ${className} ${leftRipple.ripples.length > 0 ? "bg-white/5" : "bg-transparent"}`}
        style={{ borderTopRightRadius: "50% 50%", borderBottomRightRadius: "50% 50%", width }}
        onClick={handleClick("left", left, -5, leftRipple, rightRipple)}
      >
        {leftRipple.ripples.map((r) => (
          <RippleCircle key={r.key} ripple={r} />
        ))}
        {activeSide === "left" && left.totalClicks && left.totalClicks > 0 && <SkipVisual seconds={-left.totalClicks * 5} />}
      </button>
      <button
        className={`absolute top-0 right-0 h-full z-10 overflow-hidden focus:outline-none focus:ring-0 transform-none ${className} ${rightRipple.ripples.length > 0 ? "bg-white/5" : "bg-transparent"}`}
        style={{ borderTopLeftRadius: "50% 50%", borderBottomLeftRadius: "50% 50%", width }}
        onClick={handleClick("right", right, 5, rightRipple, leftRipple)}
      >
        {rightRipple.ripples.map((r) => (
          <RippleCircle key={r.key} ripple={r} />
        ))}
        {activeSide === "right" && right.totalClicks && right.totalClicks > 0 && <SkipVisual seconds={right.totalClicks * 5} />}
      </button>
    </div>
  );
};

export default SeekOverlay;
