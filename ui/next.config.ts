import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  // contentDirBasePath: "/docs",
  readingTime: true,
});

const nextConfig: NextConfig = withNextra({
  turbopack: {
    resolveAlias: {
      // Path to your `mdx-components` file with extension
      "next-mdx-import-source-file": "./mdx-components.ts",
    },
  },
});

export default nextConfig;
