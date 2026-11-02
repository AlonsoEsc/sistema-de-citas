import { defineConfig } from "tsup";

// Empaqueta la app con los paquetes del workspace (@citas/*), que se publican como
// TypeScript. Las dependencias de node_modules quedan externas; Prisma y pg se marcan
// explicitamente porque llegan como dependencias de @citas/db y no de la app.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@citas\//],
  external: [/^@prisma\//, "pg"],
});
