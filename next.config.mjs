/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      // pdfjs-dist is browser-only — skip parsing it entirely on the server build
      config.externals = [...(config.externals ?? []), 'pdfjs-dist'];
    }
    return config;
  },
};

export default nextConfig;
