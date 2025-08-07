import { useRef, useEffect, useState, ReactNode, useCallback } from "react";
import Marquee from "react-fast-marquee";

interface MarqueeTextProps {
  children: ReactNode;
  className?: string;
}

export default function MarqueeText({ children }: MarqueeTextProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [containerOffsetWidth, setContainerOffsetWidth] = useState(0);
  const [marqueeKey, setMarqueeKey] = useState(0); // key to force re-mount
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

  useEffect(() => {
    checkMarquee();

    // Debounced resize handler
    let timeoutId: NodeJS.Timeout;
    const debouncedCheckMarquee = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMarquee, 100);
    };

    window.addEventListener("resize", debouncedCheckMarquee);
    window.addEventListener("orientationchange", debouncedCheckMarquee);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", debouncedCheckMarquee);
      window.removeEventListener("orientationchange", debouncedCheckMarquee);
    };
  }, [children, checkMarquee]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <Marquee play={shouldMarquee} style={{ width: shouldMarquee ? `${marqueeWidth}px` : "auto" }} pauseOnHover key={marqueeKey}>
        <div className="truncate" ref={textRef}>
          {children}
        </div>
      </Marquee>
    </div>
  );
}
