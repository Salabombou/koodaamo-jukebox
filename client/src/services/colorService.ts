import { Vibrant } from "node-vibrant/browser";

export function getProminentColorFromUrl(url: string): Promise<[string, string]> {
  return Vibrant.from(url)
    .getPalette()
    .then((palette) => {
      console.log("Vibrant palette:", palette);

      const swatches = Object.values(palette).filter(
        (swatch) => swatch !== null 
      )

      swatches.sort(
        (a, b) => a.population - b.population,
      )

      return [swatches.at(-2)?.hex ?? "#000000", swatches.at(-1)?.hex ?? "#000000"] as [string, string];
    })
    .catch((e) => {
      console.error("Error getting vibrant color from URL:", url, e);
      return ["#000000", "#000000"];
    });
}
