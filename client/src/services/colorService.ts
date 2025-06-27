import { Vibrant } from "node-vibrant/browser";

export function getProminentColorFromUrl(url: string): Promise<string> {
  return Vibrant.from(url)
    .getPalette()
    .then((palette) => {
      console.log("Vibrant palette:", palette);
      
      const swatches = [];
      
      if (palette.Vibrant) {
        swatches.push(palette.Vibrant);
      }
      if (palette.Muted) {
        swatches.push(palette.Muted);
      }

      if (swatches.length === 0) {
        console.warn("No vibrant or muted swatches found in palette");
        return "#000000";
      }

      let mostProminent = swatches.sort((a, b) => b.population - a.population)[0];
      return mostProminent.hex;
    })
    .catch((e) => {
      console.error("Error getting vibrant color from URL:", url, e);
      return "#000000";
    });
}
