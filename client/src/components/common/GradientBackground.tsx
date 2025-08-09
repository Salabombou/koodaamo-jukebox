import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Props for the animated gradient background component.
 * @property backgroundColors Pair of hex / css color strings used for the vertical gradient (top,bottom).
 */
interface GradientBackgroundProps {
  backgroundColors: [string, string];
}

/**
 * Smoothly cross–fades between two linear–gradient backgrounds whenever the provided
 * color pair changes. The previous gradient is temporarily rendered underneath and faded out
 * to create a subtle transition without flashing.
 */
export default function GradientBackground({ backgroundColors }: GradientBackgroundProps) {
  const [previousBackgroundColors, setPreviousBackgroundColors] = useState<[string, string] | null>(null);
  const prevColorsRef = useRef<[string, string]>(backgroundColors);

  useEffect(() => {
    if (prevColorsRef.current[0] !== backgroundColors[0] || prevColorsRef.current[1] !== backgroundColors[1]) {
      setPreviousBackgroundColors(prevColorsRef.current);
      prevColorsRef.current = backgroundColors;
    }
  }, [backgroundColors]);

  return (
    <>
      <AnimatePresence>
        {previousBackgroundColors && (
          <motion.div
            key={previousBackgroundColors.join(",")}
            initial={{ opacity: 1 }}
            animate={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 0,
              background: `linear-gradient(to bottom, ${previousBackgroundColors[0]} 0%, ${previousBackgroundColors[1]} 100%)`,
            }}
            onAnimationComplete={() => setPreviousBackgroundColors(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div
          key={backgroundColors.join(",")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 1 }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 1,
            background: `linear-gradient(to bottom, ${backgroundColors[0]} 0%, ${backgroundColors[1]} 100%)`,
          }}
        />
      </AnimatePresence>
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 2,
          background: "rgba(0,0,0,0.4)", // Adjust opacity for desired darkness
        }}
      />
    </>
  );
}
