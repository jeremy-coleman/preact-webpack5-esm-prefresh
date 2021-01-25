'use strict';

const _ = require('lodash');
const loaderUtils = require('loader-utils');

module.exports = function (source) {
    const options = this.query !== '' ? loaderUtils.getOptions(this) : {};
    const force = options.force || false;
    const allLoadersButThisOne = this.loaders.filter(function (loader) {
        return loader.normal !== module.exports;
    });
    if (allLoadersButThisOne.length > 0 && !force) {
        return source;
    }
    if (/\.js$/.test(this.resourcePath) && !force) {
        return source;
    }
    const template = _.template(source, _.defaults(options, { interpolate: /<%=([\s\S]+?)%>/g, variable: 'data' }));
    return 'var _ = __non_webpack_require__(' + JSON.stringify(require.resolve('lodash')) + ');' +
        'module.exports = function (templateParams) { with(templateParams) {' +
        'return (' + template.source + ')();' +
        '}}';
};
