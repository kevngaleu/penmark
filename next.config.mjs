/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // PDF.js optionally requires 'canvas' for Node.js — stub it out in the browser bundle
    config.resolve.alias.canvas = false
    return config
  },
};

export default nextConfig;
