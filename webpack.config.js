const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const commonConfig = {
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              experimentalWatchApi: true
            }
          }
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  devtool: false,
  stats: 'errors-only',
  cache: {
    type: 'memory'
  },
  optimization: {
    minimize: false,
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false,
  },
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
  ...commonConfig,
  target: 'electron-renderer',
  entry: './src/renderer.tsx',
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'build'),
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/index.html', to: '.' },
        { from: 'src/sql-wasm.wasm', to: '.' },
      ],
    }),
  ],
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

module.exports = [mainConfig, rendererConfig, preloadConfig]; 