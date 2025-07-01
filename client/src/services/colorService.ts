import { Vibrant } from "node-vibrant/browser";

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
}

export async function getProminentColorFromUrl(url: string): Promise<[string, string]> {
  try {
    const palette = await Vibrant.from(url).getPalette();

    let firstColor = palette.Vibrant;
    if (!firstColor && palette.LightVibrant) {
      firstColor = palette.LightVibrant;
    }

    const swatches = Object.values(palette).filter((swatch) => swatch && swatch !== firstColor);

    let secondColor: typeof firstColor = null;
    if (firstColor && swatches.length > 0) {
      const firstRgb = firstColor.rgb;
      let maxDist = -1;
      for (const swatch of swatches) {
        if (!swatch) continue;
        const dist = colorDistance(firstRgb, swatch.rgb);
        if (dist > maxDist) {
          maxDist = dist;
          secondColor = swatch;
        }
      }
    }
    return [firstColor?.hex || "#ffffff", secondColor?.hex || "#000000"];
  } catch (e) {
    console.error("Error getting vibrant color from URL:", url, e);
    return ["#ffffff", "#000000"];
  }
}
