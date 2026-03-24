const isPages = process.env.GITHUB_PAGES === "true";
const isElectron = process.env.ELECTRON === "true";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";

/** @type {import('next').NextConfig} */
const config = isPages
  ? {
      output: "export",
      images: { unoptimized: true },
      trailingSlash: true,
      basePath: `/${repo}`,
      assetPrefix: `/${repo}`,
    }
  : isElectron
  ? {
      output: "export",
      images: { unoptimized: true },
      trailingSlash: true,
      assetPrefix: "./",
    }
  : {
      reactStrictMode: true, // Vercel 기본
    };

export default config;
