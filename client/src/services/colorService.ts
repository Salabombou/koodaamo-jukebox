import { Vibrant } from "node-vibrant/browser";

export function getProminentColorFromUrl(url: string): Promise<string> {
  return Vibrant.from(url)
    .getPalette()
    .then((palette) => {
      console.log("Vibrant palette:", palette);
      if (!palette.Vibrant) {
        console.warn("No vibrant color found for image");
        return "#000000";
      }
      return palette.Vibrant.hex;
    })
    .catch((e) => {
      console.error("Error getting vibrant color from URL:", url, e);
      return "#000000";
    });
}
