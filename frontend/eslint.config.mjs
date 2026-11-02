import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  // Existing data hydration effects intentionally initialize state from storage/API responses.
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"])
]);
