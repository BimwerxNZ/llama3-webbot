/** @type {import('next').NextConfig} */
const nextConfig = {
    // node-loader
    webpack: (config, { isServer }) => {
    config.resolve.fallback = {
    fs: false,
    path: false,
    https: false,
    stream: false,
    string_decoder: false,
    zlib: false,
    crypto: false,
    child_process: false,
    };
    
    
    
    config.module.rules.push({
    test: /\.node$/,
    use: 'node-loader'
    });
    
    
    
    return config;
    },
    experimental: {
    serverComponentsExternalPackages: ['fastembed'],
    }
    };
    
    
    
    export default nextConfig;