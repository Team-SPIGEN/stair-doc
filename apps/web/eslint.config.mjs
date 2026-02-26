import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    ignores: ["lib/api/client/**"],
  },
];

export default config;
