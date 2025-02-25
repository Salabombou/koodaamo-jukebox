import type { AsyncReturnType } from "type-fest";
import type { Vibrant } from "node-vibrant/browser";

export type Palette = AsyncReturnType<ReturnType<typeof Vibrant.from>["getPalette"]>;
export type Swatch = NonNullable<Palette[keyof Palette]>;
