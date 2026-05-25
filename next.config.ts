import type { NextConfig } from "next";
import webpack from "webpack";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "blindcache-core",
    "@nillion/secretvaults",
    "@nillion/nuc",
    "@nillion/nilai-ts",
  ],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    if (!isServer) {
      // The Nillion SDK + transitive deps import via the "node:" scheme.
      // Rewrite to bare names so webpack can resolve through fallbacks.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      // Polyfill the bare names. Anything we don't have a browser shim
      // for falls back to `false` (treated as an empty module).
      config.resolve.fallback = {
        ...config.resolve.fallback,
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        crypto: require.resolve("crypto-browserify"),
        path: require.resolve("path-browserify"),
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        url: require.resolve("url/"),
        util: require.resolve("util/"),
        events: require.resolve("events/"),
        process: require.resolve("process/browser"),
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
        os: false,
        zlib: false,
        assert: false,
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: "process/browser",
          Buffer: ["buffer", "Buffer"],
        })
      );
      // Some deep deps reference bare `process.env.X` at import time. Define
      // an empty env so member access doesn't blow up before ProvidePlugin
      // hoists the shim.
      config.plugins.push(
        new webpack.DefinePlugin({
          "process.env.NODE_DEBUG": JSON.stringify(""),
          "process.env.LOG_LEVEL": JSON.stringify(""),
          "process.env.NILLION_LOG_LEVEL": JSON.stringify(""),
        })
      );
    }
    return config;
  },
};

export default nextConfig;
