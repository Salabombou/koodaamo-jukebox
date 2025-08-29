import ColorThief from "colorthief";

import { COLOR_FALLBACK_DARK, COLOR_FALLBACK_LIGHT } from "../constants";

const colorThief = new ColorThief();

// Calculate vibrance score: higher chroma (distance from gray) and mid luminance are more vibrant
function vibranceScore([r, g, b]: ColorThief.RGBColor): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  return chroma;
}

function luminance(rgb: ColorThief.RGBColor): number {
  // Standard luminance formula
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Convert RGB (0-255) to XYZ
function rgbToXyz([r, g, b]: ColorThief.RGBColor): ColorThief.RGBColor {
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
function xyzToLab([x, y, z]: ColorThief.RGBColor): ColorThief.RGBColor {
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

function selectMostDifferentColor(color: ColorThief.RGBColor, palette: ColorThief.RGBColor[]): ColorThief.RGBColor | null {
  let maxDiff = -1;
  let mostDifferentColor = null;

  for (const swatch of palette) {
    const diff = colorDifferenceLab(color, swatch);
    if (diff > maxDiff) {
      maxDiff = diff;
      mostDifferentColor = swatch;
    }
  }

  return mostDifferentColor;
}

const rgbToCss = ([r, g, b]: [number, number, number]): string => {
  return `rgb(${r}, ${g}, ${b})`;
};

const colorCount = 20;
const paletteLength = 10;
const quality = 1;
export function getProminentColor(url: string): Promise<[string, string]> {
  try {
    const image = new Image();
    image.crossOrigin = "Anonymous";

    return new Promise((resolve) => {
      image.onload = () => {
        try {
          const palette = colorThief.getPalette(image, colorCount, quality);
          palette.sort((a, b) => vibranceScore(b) - vibranceScore(a));
          palette.length = Math.min(paletteLength, palette.length);

          const colorA = palette.shift();
          if (!colorA) {
            console.warn("No vibrant swatches found, returning default colors.");
            resolve([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
            return;
          }

          const colorB = selectMostDifferentColor(colorA, palette);
          if (!colorB) {
            console.warn("Not enough vibrant swatches found, returning default colors.");
            resolve([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
            return;
          }

          // Return the lighter color first, darker last
          if (luminance(colorA) > luminance(colorB)) {
            resolve([rgbToCss(colorA), rgbToCss(colorB)]);
          } else {
            resolve([rgbToCss(colorB), rgbToCss(colorA)]);
          }
        } catch (e) {
          console.error("Error getting vibrant color from URL (onload):", url, e);
          resolve([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
        }
      };
      image.onerror = (e) => {
        console.error("Error loading image for color extraction:", url, e);
        resolve([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
      };
      image.src = url;
    });
  } catch (e) {
    console.error("Error getting vibrant color from URL:", url, e);
    return Promise.resolve([COLOR_FALLBACK_LIGHT, COLOR_FALLBACK_DARK]);
  }
}
