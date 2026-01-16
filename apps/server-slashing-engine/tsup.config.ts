import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'], // Can specify multiple entries if CLI etc is added
  outDir: 'dist', // Output directory
  format: ['cjs'], // Can also be ['cjs', 'esm'] if needed
  dts: true, // Generate type declaration files (.d.ts)
  sourcemap: true, // Generate sourcemaps
  clean: true, // Clean dist folder before build
  target: 'es2020', // Transpile target
  minify: false, // Compresses (minifies) JS files to make them smaller
  treeshake: true, // Removes unused code. Default is true but explicit
  // alias, swc options are automatically applied based on tsconfig.json
  // external: [], // When you want to exclude node_modules
});
