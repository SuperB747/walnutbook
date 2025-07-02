const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

const isDevelopment = process.env.NODE_ENV !== 'production';

const commonConfig = {
  mode: isDevelopment ? 'development' : 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@components': path.resolve(__dirname, 'src/components/'),
      '@': path.resolve(__dirname, 'src/'),
    },
  },
  devtool: isDevelopment ? 'source-map' : false,
  stats: isDevelopment ? 'normal' : 'errors-only',
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
  optimization: {
    minimize: !isDevelopment,
    removeAvailableModules: !isDevelopment,
    removeEmptyChunks: !isDevelopment,
    splitChunks: isDevelopment ? false : {
      chunks: 'all',
      minSize: 20000,
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      cacheGroups: {
        defaultVendors: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10,
          reuseExistingChunk: true,
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3'
  }
};

const mainConfig = {
  ...commonConfig,
  target: 'electron-main',
  entry: './src/index.ts',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'build'),
  },
};

const rendererConfig = {
  externalsPresets: { node: false },
  ...commonConfig,
  target: 'electron-renderer',
  entry: './src/renderer.tsx',
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'build'),
    globalObject: 'window',
    publicPath: '/',
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'build'),
    },
    compress: true,
    hot: true,
    port: 3000,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.mjs'],
    fallback: {
      "util": require.resolve("util/"),
      "path": require.resolve("path-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer/"),
      "crypto": require.resolve("crypto-browserify"),
      "fs": false,
      "os": require.resolve("os-browserify/browser")
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/index.html', to: '.' },
        { from: 'src/sql-wasm.wasm', to: '.' },
      ],
    }),
    new webpack.DefinePlugin({
      global: 'window',
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  externals: {
    'node-expat': 'commonjs node-expat',
    'xml2json': 'commonjs xml2json'
  }
};

const preloadConfig = {
  ...commonConfig,
  target: 'electron-preload',
  entry: './src/preload.ts',
  output: {
    filename: 'preload.js',
    path: path.resolve(__dirname, 'build'),
  },
};

// Only compile renderer config when running webpack-dev-server to reduce memory usage
if (process.env.WEBPACK_SERVE) {
  module.exports = rendererConfig;
} else {
  module.exports = rendererConfig;
} 