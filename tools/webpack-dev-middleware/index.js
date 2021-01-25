var fs = require('fs')

//var { createFsFromVolume, Volume } = require('memfs')
const {MemoryFileSystem} = require('./memory-fs')
var mime = require('mime-types')
var path = require('path')
var querystring = require('querystring')
var { parse } = require('url')

var mem = require("lodash/memoize")
//var mem = require('mem')

const memoizedParse = mem(parse);
//const memoizedParse = parse;


function setupWriteToDisk(context) {
  const compilers = context.compiler.compilers || [context.compiler];

  for (const compiler of compilers) {
    compiler.hooks.emit.tap('DevMiddleware', (compilation) => {
      if (compiler.hasWebpackDevMiddlewareAssetEmittedCallback) {
        return;
      }

      compiler.hooks.assetEmitted.tapAsync(
        'DevMiddleware',
        (file, info, callback) => {
          let targetPath = null;
          let content = null;

          // webpack@5
          if (info.compilation) {
            ({ targetPath, content } = info);
          } else {
            let targetFile = file;

            const queryStringIdx = targetFile.indexOf('?');

            if (queryStringIdx >= 0) {
              targetFile = targetFile.substr(0, queryStringIdx);
            }

            let { outputPath } = compiler;

            outputPath = compilation.getPath(outputPath, {});
            content = info;
            targetPath = path.join(outputPath, targetFile);
          }

          const { writeToDisk: filter } = context.options;
          const allowWrite =
            filter && typeof filter === 'function' ? filter(targetPath) : true;

          if (!allowWrite) {
            return callback();
          }

          const dir = path.dirname(targetPath);
          const name = compiler.options.name
            ? `Child "${compiler.options.name}": `
            : '';

          return fs.mkdir(dir, { recursive: true }, (mkdirError) => {
            if (mkdirError) {
              context.logger.error(
                `${name}Unable to write "${dir}" directory to disk:\n${mkdirError}`
              );

              return callback(mkdirError);
            }

            return fs.writeFile(targetPath, content, (writeFileError) => {
              if (writeFileError) {
                context.logger.error(
                  `${name}Unable to write "${targetPath}" asset to disk:\n${writeFileError}`
                );

                return callback(writeFileError);
              }

              context.logger.log(
                `${name}Asset written to disk: "${targetPath}"`
              );

              return callback();
            });
          });
        }
      );
      compiler.hasWebpackDevMiddlewareAssetEmittedCallback = true;
    });
  }
}


function setupOutputFileSystem(context) {
  let outputFileSystem;

  if (context.options.outputFileSystem) {
    // eslint-disable-next-line no-shadow
    const { outputFileSystem: outputFileSystemFromOptions } = context.options;

    // Todo remove when we drop webpack@4 support
    if (typeof outputFileSystemFromOptions.join !== 'function') {
      throw new Error(
        'Invalid options: options.outputFileSystem.join() method is expected'
      );
    }

    // Todo remove when we drop webpack@4 support
    if (typeof outputFileSystemFromOptions.mkdirp !== 'function') {
      throw new Error(
        'Invalid options: options.outputFileSystem.mkdirp() method is expected'
      );
    }

    outputFileSystem = outputFileSystemFromOptions;
  } 
  else {
    outputFileSystem = new MemoryFileSystem(); //createFsFromVolume(new Volume());
    // TODO: remove when we drop webpack@4 support
    outputFileSystem.join = path.join.bind(path);
  }

  const compilers = context.compiler.compilers || [context.compiler];

  for (const compiler of compilers) {
    // eslint-disable-next-line no-param-reassign
    compiler.outputFileSystem = outputFileSystem;
  }

  // eslint-disable-next-line no-param-reassign
  context.outputFileSystem = outputFileSystem;
}


function handleRangeHeaders(context, content, req, res) {
  // assumes express API. For other servers, need to add logic to access
  // alternative header APIs
  if (res.set) {
    res.set('Accept-Ranges', 'bytes');
  } else {
    res.setHeader('Accept-Ranges', 'bytes');
  }

  let range;

  // Express API
  if (req.get) {
    range = req.get('range');
  }
  // Node.js API
  else {
    ({ range } = req.headers);
  }

  if (range) {
    const ranges = parseRange(content.length, range);

    // unsatisfiable
    if (ranges === -1) {
      // Express API
      if (res.set) {
        res.set('Content-Range', `bytes */${content.length}`);
        res.status(416);
      }
      // Node.js API
      else {
        // eslint-disable-next-line no-param-reassign
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${content.length}`);
      }
    } else if (ranges === -2) {
      // malformed header treated as regular response
      context.logger.error(
        'A malformed Range header was provided. A regular response will be sent for this request.'
      );
    } else if (ranges.length !== 1) {
      // multiple ranges treated as regular response
      context.logger.error(
        'A Range header with multiple ranges was provided. Multiple ranges are not supported, so a regular response will be sent for this request.'
      );
    } else {
      // valid range header
      const { length } = content;

      // Express API
      if (res.set) {
        // Content-Range
        res.status(206);
        res.set(
          'Content-Range',
          `bytes ${ranges[0].start}-${ranges[0].end}/${length}`
        );
      }
      // Node.js API
      else {
        // Content-Range
        // eslint-disable-next-line no-param-reassign
        res.statusCode = 206;
        res.setHeader(
          'Content-Range',
          `bytes ${ranges[0].start}-${ranges[0].end}/${length}`
        );
      }

      // eslint-disable-next-line no-param-reassign
      content = content.slice(ranges[0].start, ranges[0].end + 1);
    }
  }

  return content;
}


function ready(context, callback, req) {
  if (context.state) {
    return callback(context.stats);
  }

  const name = (req && req.url) || callback.name;

  context.logger.info(`wait until bundle finished${name ? `: ${name}` : ''}`);

  context.callbacks.push(callback);
}


function setupHooks(context) {
  function invalid() {
    if (context.state) {
      context.logger.info('Compiling...');
    }

    // We are now in invalid state
    // eslint-disable-next-line no-param-reassign
    context.state = false;
    // eslint-disable-next-line no-param-reassign, no-undefined
    context.stats = undefined;
  }

  function done(stats) {
    // We are now on valid state
    // eslint-disable-next-line no-param-reassign
    context.state = true;
    // eslint-disable-next-line no-param-reassign
    context.stats = stats;

    // Do the stuff in nextTick, because bundle may be invalidated if a change happened while compiling
    process.nextTick(() => {
      const { state, compiler, callbacks, logger } = context;

      // Check if still in valid state
      if (!state) {
        return;
      }

      // Print webpack output
      const printStats = (childCompiler, childStats) => {
        const statsString = childStats.toString(childCompiler.options.stats);
        const name = childCompiler.options.name
          ? `Child "${childCompiler.options.name}": `
          : '';

        if (statsString.length) {
          if (childStats.hasErrors()) {
            logger.error(`${name}${statsString}`);
          } else if (childStats.hasWarnings()) {
            logger.warn(`${name}${statsString}`);
          } else {
            logger.info(`${name}${statsString}`);
          }
        }

        let message = `${name}Compiled successfully.`;

        if (childStats.hasErrors()) {
          message = `${name}Failed to compile.`;
        } else if (childStats.hasWarnings()) {
          message = `${name}Compiled with warnings.`;
        }

        logger.info(message);
      };

      if (compiler.compilers) {
        compiler.compilers.forEach((compilerFromMultiCompileMode, index) => {
          printStats(compilerFromMultiCompileMode, stats.stats[index]);
        });
      } else {
        printStats(compiler, stats);
      }

      // eslint-disable-next-line no-param-reassign
      context.callbacks = [];

      // Execute callback that are delayed
      callbacks.forEach((callback) => {
        callback(stats);
      });
    });
  }

  context.compiler.hooks.watchRun.tap('DevMiddleware', invalid);
  context.compiler.hooks.invalid.tap('DevMiddleware', invalid);
  context.compiler.hooks.done.tap('DevMiddleware', done);
}


const noop = () => {};




function getPaths(context) {
  const { stats, options } = context;
  const childStats = stats.stats ? stats.stats : [stats];
  const publicPaths = [];

  for (const { compilation } of childStats) {
    // The `output.path` is always present and always absolute
    const outputPath = compilation.getPath(compilation.outputOptions.path);
    const publicPath = options.publicPath
      ? compilation.getPath(options.publicPath)
      : compilation.outputOptions.publicPath
      ? compilation.getPath(compilation.outputOptions.publicPath)
      : '';

    publicPaths.push({ outputPath, publicPath });
  }

  return publicPaths;
}

function getFilenameFromUrl(context, url) {
  const { options } = context;
  const paths = getPaths(context);

  let filename;
  let urlObject;

  try {
    // The `url` property of the `request` is contains only  `pathname`, `search` and `hash`
    urlObject = memoizedParse(url, false, true);
  } catch (_ignoreError) {
    return filename;
  }

  for (const { publicPath, outputPath } of paths) {
    let publicPathObject;

    try {
      publicPathObject = memoizedParse(
        publicPath !== 'auto' && publicPath ? publicPath : '/',
        false,
        true
      );
    } catch (_ignoreError) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (
      urlObject.pathname &&
      urlObject.pathname.startsWith(publicPathObject.pathname)
    ) {
      filename = outputPath;

      // Strip the `pathname` property from the `publicPath` option from the start of requested url
      // `/complex/foo.js` => `foo.js`
      const pathname = urlObject.pathname.substr(
        publicPathObject.pathname.length
      );

      if (pathname) {
        filename = path.join(outputPath, querystring.unescape(pathname));
      }

      let fsStats;

      try {
        fsStats = context.outputFileSystem.statSync(filename);
      } catch (_ignoreError) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (fsStats.isFile()) {
        break;
      } else if (
        fsStats.isDirectory() &&
        (typeof options.index === 'undefined' || options.index)
      ) {
        const indexValue =
          typeof options.index === 'undefined' ||
          typeof options.index === 'boolean'
            ? 'index.html'
            : options.index;

        filename = path.join(filename, indexValue);

        try {
          fsStats = context.outputFileSystem.statSync(filename);
        } catch (__ignoreError) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (fsStats.isFile()) {
          break;
        }
      }
    }
  }

  return filename;
}



function withMiddleware(context) {
  return async function middleware(req, res, next) {
    const acceptedMethods = context.options.methods || ['GET', 'HEAD'];

    // fixes #282. credit @cexoso. in certain edge situations res.locals is undefined.
    // eslint-disable-next-line no-param-reassign
    res.locals = res.locals || {};

    if (!acceptedMethods.includes(req.method)) {
      await goNext();
      return;
    }

    ready(context, processRequest, req);

    async function goNext() {
      if (!context.options.serverSideRender) {
        return next();
      }

      return new Promise((resolve) => {
        ready(
          context,
          () => {
            // eslint-disable-next-line no-param-reassign
            res.locals.webpack = { devMiddleware: context };

            resolve(next());
          },
          req
        );
      });
    }

    async function processRequest() {
      const filename = getFilenameFromUrl(context, req.url);
      const { headers } = context.options;
      let content;

      if (!filename) {
        await goNext();
        return;
      }

      try {
        content = context.outputFileSystem.readFileSync(filename);
      } catch (_ignoreError) {
        await goNext();
        return;
      }

      const contentTypeHeader = res.get
        ? res.get('Content-Type')
        : res.getHeader('Content-Type');

      if (!contentTypeHeader) {
        // content-type name(like application/javascript; charset=utf-8) or false
        const contentType = mime.contentType(path.extname(filename));

        // Express API
        if (res.set && contentType) {
          res.set('Content-Type', contentType);
        }
        // Node.js API
        else {
          res.setHeader(
            'Content-Type',
            contentType || 'application/octet-stream'
          );
        }
      }

      if (headers) {
        const names = Object.keys(headers);

        for (const name of names) {
          // Express API
          if (res.set) {
            res.set(name, headers[name]);
          }
          // Node.js API
          else {
            res.setHeader(name, headers[name]);
          }
        }
      }

      // Buffer
      content = handleRangeHeaders(context, content, req, res);

      // Express API
      if (res.send) {
        res.send(content);
      }
      // Node.js API
      else {
        res.setHeader('Content-Length', content.length);

        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(content);
        }
      }
    }
  };
}




function wdm(compiler, options = {}) {
  // var { validate } = require('schema-utils';
  // validate(schema, options, {
  //   name: 'Dev Middleware',
  //   baseDataPath: 'options',
  // });

  const { mimeTypes } = options;

  if (mimeTypes) {
    const { types } = mime;

    // mimeTypes from user provided options should take priority
    // over existing, known types
    mime.types = { ...types, ...mimeTypes };
  }

  const context = {
    state: false,
    stats: null,
    callbacks: [],
    options,
    compiler,
    watching: null,
  };

  // eslint-disable-next-line no-param-reassign
  context.logger = context.compiler.getInfrastructureLogger(
    'webpack-dev-middleware'
  );

  setupHooks(context);

  if (options.writeToDisk) {
    setupWriteToDisk(context);
  }

  setupOutputFileSystem(context);

  // Start watching
  if (context.compiler.watching) {
    context.watching = context.compiler.watching;
  } else {
    let watchOptions;

    if (Array.isArray(context.compiler.compilers)) {
      watchOptions = context.compiler.compilers.map(
        (childCompiler) => childCompiler.options.watchOptions || {}
      );
    } else {
      watchOptions = context.compiler.options.watchOptions || {};
    }

    context.watching = context.compiler.watch(watchOptions, (error) => {
      if (error) {
        // TODO: improve that in future
        // For example - `writeToDisk` can throw an error and right now it is ends watching.
        // We can improve that and keep watching active, but it is require API on webpack side.
        // Let's implement that in webpack@5 because it is rare case.
        context.logger.error(error);
      }
    });
  }

  const instance = withMiddleware(context);

  // API
  instance.waitUntilValid = (callback = noop) => {
    ready(context, callback);
  };
  instance.invalidate = (callback = noop) => {
    ready(context, callback);

    context.watching.invalidate();
  };
  instance.close = (callback = noop) => {
    context.watching.close(callback);
  };
  instance.context = context;

  return instance;
}

module.exports = wdm;





/**
 * Parse "Range" header `str` relative to the given file `size`.
 *
 * @param {Number} size
 * @param {String} str
 * @param {Object} [options]
 * @return {Array}
 * @public
 */

function parseRange (size, str, options) {
  if (typeof str !== 'string') {
    throw new TypeError('argument str must be a string')
  }

  var index = str.indexOf('=')

  if (index === -1) {
    return -2
  }

  // split the range string
  var arr = str.slice(index + 1).split(',')
  var ranges = []

  // add ranges type
  ranges.type = str.slice(0, index)

  // parse all ranges
  for (var i = 0; i < arr.length; i++) {
    var range = arr[i].split('-')
    var start = parseInt(range[0], 10)
    var end = parseInt(range[1], 10)

    // -nnn
    if (isNaN(start)) {
      start = size - end
      end = size - 1
    // nnn-
    } else if (isNaN(end)) {
      end = size - 1
    }

    // limit last-byte-pos to current length
    if (end > size - 1) {
      end = size - 1
    }

    // invalid or unsatisifiable
    if (isNaN(start) || isNaN(end) || start > end || start < 0) {
      continue
    }

    // add range
    ranges.push({
      start: start,
      end: end
    })
  }

  if (ranges.length < 1) {
    // unsatisifiable
    return -1
  }

  return options && options.combine
    ? combineRanges(ranges)
    : ranges
}

/**
 * Combine overlapping & adjacent ranges.
 * @private
 */

function combineRanges (ranges) {
  var ordered = ranges.map(mapWithIndex).sort(sortByRangeStart)

  for (var j = 0, i = 1; i < ordered.length; i++) {
    var range = ordered[i]
    var current = ordered[j]

    if (range.start > current.end + 1) {
      // next range
      ordered[++j] = range
    } else if (range.end > current.end) {
      // extend range
      current.end = range.end
      current.index = Math.min(current.index, range.index)
    }
  }

  // trim ordered array
  ordered.length = j + 1

  // generate combined range
  var combined = ordered.sort(sortByRangeIndex).map(mapWithoutIndex)

  // copy ranges type
  combined.type = ranges.type

  return combined
}

/**
 * Map function to add index value to ranges.
 * @private
 */

function mapWithIndex (range, index) {
  return {
    start: range.start,
    end: range.end,
    index: index
  }
}

/**
 * Map function to remove index value from ranges.
 * @private
 */

function mapWithoutIndex (range) {
  return {
    start: range.start,
    end: range.end
  }
}

/**
 * Sort function to sort ranges by index.
 * @private
 */

function sortByRangeIndex (a, b) {
  return a.index - b.index
}

/**
 * Sort function to sort ranges by start position.
 * @private
 */

function sortByRangeStart (a, b) {
  return a.start - b.start
}