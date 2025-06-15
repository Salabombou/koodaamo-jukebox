import { Vibrant } from "node-vibrant/browser";

export function getProminentColorFromUrl(url: string): Promise<string> {
  return Vibrant.from(url)
    .getPalette()
    .then((palette) => {
      console.log("Vibrant palette:", palette);
      if (!palette.DarkVibrant) {
        console.warn("No vibrant color found for image");
        return "rgba(0, 0, 0, 0.7)"; // Fallback if no vibrant color is found
      }
      return `rgba(${palette.DarkVibrant.rgb.join(",")}, 0.7)`;
    })
    .catch((e) => {
      console.error("Error getting vibrant color from URL:", url, e);
      return "rgba(0, 0, 0, 0.7)"; // Fallback in case of error
    });
}
