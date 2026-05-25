import type { NextConfig } from "next";
import webpack from "webpack";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Strict-ish CSP. The Nillion testnet + Venice API are the only external
// origins we talk to; everything else stays self. Dev tooling needs unsafe-
// eval for Next.js HMR; we relax this only outside production.
const isProd = process.env.NODE_ENV === "production";

const CSP = [
  "default-src 'self'",
  // Next inlines style tags; transformers.js + libsodium need wasm-unsafe-eval
  // and unsafe-eval (Emscripten); onnxruntime-web dynamically imports its
  // WASM worker via a blob: URL, so we have to allow blob: in script-src too.
  // Restricting tighter than this breaks the embedder.
  isProd
    ? "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' blob:"
    : "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  // Network calls. Venice for inference; nilDB testnet nodes for the vault;
  // huggingface CDN for the embedding model weights on first load.
  "connect-src 'self' https://api.venice.ai https://*.nillion.network https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Lock down what the page can be downgraded to.
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "blindcache-core",
    "@nillion/secretvaults",
    "@nillion/nuc",
    "@nillion/nilai-ts",
  ],
  async headers() {
    return [
      {
        // Apply to every path.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
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
