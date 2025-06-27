import { useRef, useEffect, useState, ReactNode } from "react";
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

  const checkMarquee = () => {
    if (textRef.current && containerRef.current) {
      setShouldMarquee(
        textRef.current.scrollWidth > containerRef.current.offsetWidth,
      );
      setScrollWidth(textRef.current.scrollWidth);
      setContainerOffsetWidth(containerRef.current.offsetWidth);
    }
  };

  // Reset marquee scroll when shouldMarquee becomes false
  useEffect(() => {
    if (!shouldMarquee) {
      setMarqueeKey((k) => k + 1);
    }
  }, [shouldMarquee]);

  useEffect(() => {
    checkMarquee();
    window.addEventListener("resize", checkMarquee);
    window.addEventListener("orientationchange", checkMarquee);
    return () => {
      window.removeEventListener("resize", checkMarquee);
      window.removeEventListener("orientationchange", checkMarquee);
    };
  }, [children]);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <Marquee
        play={shouldMarquee}
        style={{ width: shouldMarquee ? `${marqueeWidth}px` : "auto" }}
        pauseOnHover
        key={marqueeKey}
      >
        <div className="truncate" ref={textRef}>
          {children}
        </div>
      </Marquee>
    </div>
  );
}
