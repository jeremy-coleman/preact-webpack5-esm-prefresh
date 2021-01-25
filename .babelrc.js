module.exports = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-modules', { loose: true }]
  ],
  plugins: [
    [process.env.NODE_ENV !== 'production' && "@prefresh/babel-plugin"],
    '@babel/plugin-syntax-dynamic-import',
    ['babel-plugin-transform-jsx-to-htm', {
      'import': {
        'module': 'htm/preact',
        'export': 'html'
      }
    }]
  ].filter(Boolean)
}
