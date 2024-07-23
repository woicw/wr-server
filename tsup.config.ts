import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: true,
  outDir: "./dist",
  sourcemap: false,
  clean: true,
  minify: !options.watch,
}));
