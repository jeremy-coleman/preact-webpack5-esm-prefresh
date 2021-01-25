require('dotenv').config();
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const BABEL_CONFIG = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-modules', { loose: true }]
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    ['babel-plugin-transform-jsx-to-htm', {
      'import': {
        'module': 'htm/preact',
        'export': 'html'
      }
    }]
  ].filter(Boolean)
}

const makeConfig = () => {
  const apiUrl = process.env.API_URL
  
  // Return configuration
  return {
    mode: 'production',
    stats: 'normal',
    devtool: false,
    experiments:{
      outputModule: true
    },
    entry: "./src/app/index.tsx",
    output: {
      module: true,
      chunkFilename: `[name]-[contenthash].js`,
      filename: `[name]-[contenthash].js`,
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/',
    },
    plugins: [
      new HtmlWebpackPlugin({ inject: true, template: './src/app/index.html' }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify("production"),
        'process.env.API_URL': JSON.stringify(apiUrl),
      }),
    ],
    resolve: {
      mainFields: ['module', 'browser','main'],
      extensions: [".tsx", ".ts", ".mjs", ".js", ".jsx"],
    },
    module: {
      rules: [
        {
          // This is to support our `graphql` dependency, they expose a .mjs bundle instead of .js
          test: /\.mjs$/,
          include: /node_modules/,
          type: 'javascript/auto',
        },
        {
          // Pre-compile graphql strings.
          test: /\.(graphql|gql)$/,
          exclude: /node_modules/,
          loader: 'graphql-tag/loader'
        },
        {
          test: /\.(png|jpe?g|gif)$/,
          use: [
            {
              loader: 'file-loader',
              options: {},
            },
          ],
        },
        {
          test: /\.[tj]sx?$/,
          enforce: 'pre',
          exclude: /node_modules/,
          loader: 'source-map-loader',
        },
        {
          test: /\.[tj]sx?$/,
          include: [
            path.resolve(__dirname, "src"),
          ],
          loader: 'babel-loader',
          options: BABEL_CONFIG
        },
      ],
    },
  };
};

module.exports = makeConfig();
