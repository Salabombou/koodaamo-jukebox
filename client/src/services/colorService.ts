import { Vibrant } from "node-vibrant/browser";

import { COLOR_FALLBACK_DARK, COLOR_FALLBACK_LIGHT } from "../constants";
import type { Palette, Swatch } from "../types/color";

function luminance(rgb: [number, number, number]): number {
  // Standard luminance formula
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Convert RGB (0-255) to XYZ
function rgbToXyz([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  return [x, y, z];
}

// Convert XYZ to Lab
function xyzToLab([x, y, z]: [number, number, number]): [number, number, number] {
  // D65 reference white
  const refX = 0.95047,
    refY = 1.0,
    refZ = 1.08883;
  x /= refX;
  y /= refY;
  z /= refZ;
  x = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;
  const l = 116 * y - 16;
  const a = 500 * (x - y);
  const b_ = 200 * (y - z);
  return [l, a, b_];
}

// Calculate color difference using CIE76 (Euclidean distance in Lab color space)
function colorDifferenceLab(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lab1 = xyzToLab(rgbToXyz(rgb1));
  const lab2 = xyzToLab(rgbToXyz(rgb2));
  return Math.sqrt(Math.pow(lab1[0] - lab2[0], 2) + Math.pow(lab1[1] - lab2[1], 2) + Math.pow(lab1[2] - lab2[2], 2));
}

function selectMostDifferentColors(palette: Palette): [Swatch, Swatch] | null {
  const swatches = Object.values(palette).filter((s) => s !== null);
  if (swatches.length < 2) return null;

  let maxDiff = -1;
  let colorA = swatches[0];
  let colorB = swatches[1];
  for (let i = 0; i < swatches.length; i++) {
    for (let j = i + 1; j < swatches.length; j++) {
      const swatchI = swatches[i];
      const swatchJ = swatches[j];
      if (swatchI && swatchJ) {
        const diff = colorDifferenceLab(swatchI.rgb, swatchJ.rgb);
        if (diff > maxDiff) {
          maxDiff = diff;
          colorA = swatchI;
          colorB = swatchJ;
        }
      }
    }
  }
  return [colorA, colorB];
}

export async function getProminentColorFromUrl(url: string): Promise<[string, string]> {
  try {
    const palette = await Vibrant.from(url).getPalette();
    const result = selectMostDifferentColors(palette);
    if (!result) {
      console.warn("Not enough vibrant swatches found, returning default colors.");
      return [COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK];
    }
    const [colorA, colorB] = result;
    // Return the lighter color first, darker last
    if (luminance(colorA.rgb) > luminance(colorB.rgb)) {
      return [colorA.hex, colorB.hex];
    } else {
      return [colorB.hex, colorA.hex];
    }
  } catch (e) {
    console.error("Error getting vibrant color from URL:", url, e);
    return [COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK];
  }
}
