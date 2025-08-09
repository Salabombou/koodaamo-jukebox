import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Marquee from "react-fast-marquee";

/**
 * Props for the auto–scrolling text wrapper. The component measures overflow and only
 * enables marquee scrolling when the content width exceeds its container.
 */
interface MarqueeTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Conditionally scrolls overflowing text using a marquee animation.
 * Resizes and orientation changes are debounced to limit layout thrash.
 */
export default function MarqueeText({ children }: MarqueeTextProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [containerOffsetWidth, setContainerOffsetWidth] = useState(0);
  const [marqueeKey, setMarqueeKey] = useState(0); // key to force re-mount
  const [measured, setMeasured] = useState(false); // hide until first measurement to prevent flicker
  
  const marqueeWidth = scrollWidth + containerOffsetWidth;

  // Debounced check function to avoid excessive calculations
  const checkMarquee = useCallback(() => {
    if (textRef.current && containerRef.current) {
      const currentScrollWidth = textRef.current.scrollWidth;
      const currentContainerOffsetWidth = containerRef.current.offsetWidth;
      setScrollWidth(currentScrollWidth);
      setContainerOffsetWidth(currentContainerOffsetWidth);
      const needsMarquee = currentScrollWidth > currentContainerOffsetWidth;
      if (needsMarquee !== shouldMarquee) {
        setShouldMarquee(needsMarquee);
      }
    }
  }, [shouldMarquee]);

  // Reset marquee scroll when shouldMarquee becomes false
  useEffect(() => {
    if (!shouldMarquee) {
      setMarqueeKey((k) => k + 1);
    }
  }, [shouldMarquee]);

  // Measure before paint to avoid visual flash from toggling marquee on
  useLayoutEffect(() => {
    checkMarquee();
    setMeasured(true);
  }, [children, checkMarquee]);

  // Handle resizes/orientation changes (can be after paint)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const debouncedCheckMarquee = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        checkMarquee();
      }, 100);
    };
    window.addEventListener("resize", debouncedCheckMarquee);
    window.addEventListener("orientationchange", debouncedCheckMarquee);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", debouncedCheckMarquee);
      window.removeEventListener("orientationchange", debouncedCheckMarquee);
    };
  }, [checkMarquee]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden", visibility: measured ? "visible" : "hidden" }}>
      <Marquee
        play={shouldMarquee}
        style={shouldMarquee ? { width: `${marqueeWidth}px` } : undefined}
        pauseOnHover
        key={marqueeKey}
        delay={1}
      >
        <div className="truncate" ref={textRef}>
          {children}
        </div>
      </Marquee>
    </div>
  );
}
