import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { COLOR_FALLBACK_DARK, COLOR_FALLBACK_LIGHT } from "../../constants";
import * as colorService from "../../services/colorService";
import * as thumbnailService from "../../services/thumbnailService";
/**
 * Props for the animated gradient background component.
 * @property sourceImage Optional source image URL for extracting colors.
 */
interface GradientBackgroundProps {
  sourceImage?: string;
}

/**
 * Smoothly cross–fades between two linear–gradient backgrounds whenever the provided
 * color pair changes. The previous gradient is temporarily rendered underneath and faded out
 * to create a subtle transition without flashing.
 */
export default function GradientBackground({ sourceImage }: GradientBackgroundProps) {
  const [backgroundColors, setBackgroundColors] = useState<[string, string]>([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
  const [previousBackgroundColors, setPreviousBackgroundColors] = useState<[string, string] | null>(null);
  const prevColorsRef = useRef<[string, string]>(backgroundColors);

  // Extract colors from current track thumbnail
  useEffect(() => {
    if (!sourceImage) return;
    const extractColors = async () => {
      try {
        const blobUrl = await thumbnailService.getThumbnail(sourceImage);

        if (blobUrl) {
          const colors = await colorService.getProminentColor(blobUrl);
          setBackgroundColors(colors);
        }
      } catch (error) {
        console.warn("Failed to extract colors from thumbnail:", error);
        setBackgroundColors([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
      }
    };

    extractColors();

    return () => {
      thumbnailService.removeThumbnail(sourceImage);
    };
  }, [sourceImage]);

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
