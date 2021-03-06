/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const errors = require("./errno");
const stream = require("stream");

const ReadableStream = stream.Readable;
const WritableStream = stream.Writable;

class MemoryFileSystemError extends Error {
	constructor(err, path, operation) {
		super(err, path);

		// Set `name` and `message` before call `Error.captureStackTrace` \
		// so that we will obtain the correct 1st line of stack, like:
		// [Error]: [Message]
		this.name = this.constructor.name;
		var message = [`${err.code}:`, `${err.description},`];
		// Add operation name and path into message, similar to node `fs` style.
		if(operation) {
			message.push(operation);
		}
		message.push(`\'${path}\'`);
		this.message = message.join(' ');

		this.code = err.code;
		this.errno = err.errno;
		this.path = path;
		this.operation = operation;

		if(Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

const absoluteWinRegExp = /^[A-Z]:([\\\/]|$)/i;
const absoluteNixRegExp = /^\//i;

function join(path, request) {
	if(!request) return normalize(path);
	if(absoluteWinRegExp.test(request)) return normalize(request.replace(/\//g, "\\"));
	if(absoluteNixRegExp.test(request)) return normalize(request);
	if(path == "/") return normalize(path + request);
	if(absoluteWinRegExp.test(path)) return normalize(path.replace(/\//g, "\\") + "\\" + request.replace(/\//g, "\\"));
	if(absoluteNixRegExp.test(path)) return normalize(path + "/" + request);
	return normalize(path + "/" + request);
};


function normalize(path) {
	var parts = path.split(/(\\+|\/+)/);
	if(parts.length === 1)
		return path;
	var result = [];
	var absolutePathStart = 0;
	for(var i = 0, sep = false; i < parts.length; i += 1, sep = !sep) {
		var part = parts[i];
		if(i === 0 && /^([A-Z]:)?$/i.test(part)) {
			result.push(part);
			absolutePathStart = 2;
		} else if(sep) {
			// UNC paths on Windows begin with a double backslash.
			if (i === 1 && parts[0].length === 0 && part === "\\\\") {
				result.push(part);
			} else {
				result.push(part[0]);
			}
		} else if(part === "..") {
			switch(result.length) {
				case 0:
					// i. e. ".." => ".."
					// i. e. "../a/b/c" => "../a/b/c"
					result.push(part);
					break;
				case 2:
					// i. e. "a/.." => ""
					// i. e. "/.." => "/"
					// i. e. "C:\.." => "C:\"
					// i. e. "a/../b/c" => "b/c"
					// i. e. "/../b/c" => "/b/c"
					// i. e. "C:\..\a\b\c" => "C:\a\b\c"
					if (result[0] !== ".") {
						i += 1;
						sep = !sep;
						result.length = absolutePathStart;
					} else {
						result.length = 0;
						result.push(part);
					}
					break;
				case 4:
					// i. e. "a/b/.." => "a"
					// i. e. "/a/.." => "/"
					// i. e. "C:\a\.." => "C:\"
					// i. e. "/a/../b/c" => "/b/c"
					if(absolutePathStart === 0) {
						result.length -= 3;
					} else {
						i += 1;
						sep = !sep;
						result.length = 2;
					}
					break;
				default:
					// i. e. "/a/b/.." => "/a"
					// i. e. "/a/b/../c" => "/a/c"
					result.length -= 3;
					break;
			}
		} else if(part === ".") {
			switch(result.length) {
				case 0:
					// i. e. "." => "."
					// i. e. "./a/b/c" => "./a/b/c"
					result.push(part);
					break;
				case 2:
					// i. e. "a/." => "a"
					// i. e. "/." => "/"
					// i. e. "C:\." => "C:\"
					// i. e. "C:\.\a\b\c" => "C:\a\b\c"
					if(absolutePathStart === 0) {
						result.length -= 1;
					} else {
						i += 1;
						sep = !sep;
					}
					break;
				default:
					// i. e. "a/b/." => "a/b"
					// i. e. "/a/." => "/"
					// i. e. "C:\a\." => "C:\"
					// i. e. "a/./b/c" => "a/b/c"
					// i. e. "/a/./b/c" => "/a/b/c"
					result.length -= 1;
					break;
			}
		} else if(part) {
			result.push(part);
		}
	}
	if(result.length === 1 && /^[A-Za-z]:$/.test(result[0]))
		return result[0] + "\\";
	return result.join("");
};


function isDir(item) {
	if(typeof item !== "object") return false;
	return item[""] === true;
}

function isFile(item) {
	if(typeof item !== "object") return false;
	return !item[""];
}

function pathToArray(path) {
	path = normalize(path);
	const nix = /^\//.test(path);
	if(!nix) {
		if(!/^[A-Za-z]:/.test(path)) {
			throw new MemoryFileSystemError(errors.code.EINVAL, path);
		}
		path = path.replace(/[\\\/]+/g, "\\"); // multi slashs
		path = path.split(/[\\\/]/);
		path[0] = path[0].toUpperCase();
	} else {
		path = path.replace(/\/+/g, "/"); // multi slashs
		path = path.substr(1).split("/");
	}
	if(!path[path.length-1]) path.pop();
	return path;
}

function trueFn() { return true; }
function falseFn() { return false; }

class MemoryFileSystem {
	constructor(data) {
		this.data = data || {};
		this.join = join;
		this.pathToArray = pathToArray;
		this.normalize = normalize;
	}

	meta(_path) {
		const path = pathToArray(_path);
		let current = this.data;
		let i = 0;
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				return;
			current = current[path[i]];
		}
		return current[path[i]];
	}

	existsSync(_path) {
		return !!this.meta(_path);
	}

	statSync(_path) {
		let current = this.meta(_path);
		if(_path === "/" || isDir(current)) {
			return {
				isFile: falseFn,
				isDirectory: trueFn,
				isBlockDevice: falseFn,
				isCharacterDevice: falseFn,
				isSymbolicLink: falseFn,
				isFIFO: falseFn,
				isSocket: falseFn
			};
		} else if(isFile(current)) {
			return {
				isFile: trueFn,
				isDirectory: falseFn,
				isBlockDevice: falseFn,
				isCharacterDevice: falseFn,
				isSymbolicLink: falseFn,
				isFIFO: falseFn,
				isSocket: falseFn
			};
		} else {
			throw new MemoryFileSystemError(errors.code.ENOENT, _path, "stat");
		}
	}

	readFileSync(_path, optionsOrEncoding) {
		const path = pathToArray(_path);
		let current = this.data;
		let i = 0
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "readFile");
			current = current[path[i]];
		}
		if(!isFile(current[path[i]])) {
			if(isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.EISDIR, _path, "readFile");
			else
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "readFile");
		}
		current = current[path[i]];
		const encoding = typeof optionsOrEncoding === "object" ? optionsOrEncoding.encoding : optionsOrEncoding;
		return encoding ? current.toString(encoding) : current;
	}

	readdirSync(_path) {
		if(_path === "/") return Object.keys(this.data).filter(Boolean);
		const path = pathToArray(_path);
		let current = this.data;
		let i = 0;
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "readdir");
			current = current[path[i]];
		}
		if(!isDir(current[path[i]])) {
			if(isFile(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOTDIR, _path, "readdir");
			else
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "readdir");
		}
		return Object.keys(current[path[i]]).filter(Boolean);
	}

	mkdirpSync(_path) {
		const path = pathToArray(_path);
		if(path.length === 0) return;
		let current = this.data;
		for(let i = 0; i < path.length; i++) {
			if(isFile(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOTDIR, _path, "mkdirp");
			else if(!isDir(current[path[i]]))
				current[path[i]] = {"":true};
			current = current[path[i]];
		}
		return;
	}

	mkdirSync(_path) {
		const path = pathToArray(_path);
		if(path.length === 0) return;
		let current = this.data;
		let i = 0;
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "mkdir");
			current = current[path[i]];
		}
		if(isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.EEXIST, _path, "mkdir");
		else if(isFile(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOTDIR, _path, "mkdir");
		current[path[i]] = {"":true};
		return;
	}

	_remove(_path, name, testFn) {
		const path = pathToArray(_path);
		const operation = name === "File" ? "unlink" : "rmdir";
		if(path.length === 0) {
			throw new MemoryFileSystemError(errors.code.EPERM, _path, operation);
		}
		let current = this.data;
		let i = 0;
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, operation);
			current = current[path[i]];
		}
		if(!testFn(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path, operation);
		delete current[path[i]];
		return;
	}

	rmdirSync(_path) {
		return this._remove(_path, "Directory", isDir);
	}

	unlinkSync(_path) {
		return this._remove(_path, "File", isFile);
	}

	readlinkSync(_path) {
		throw new MemoryFileSystemError(errors.code.ENOSYS, _path, "readlink");
	}

	writeFileSync(_path, content, optionsOrEncoding) {
		if(!content && !optionsOrEncoding) throw new Error("No content");
		const path = pathToArray(_path);
		if(path.length === 0) {
			throw new MemoryFileSystemError(errors.code.EISDIR, _path, "writeFile");
		}
		let current = this.data;
		let i = 0
		for(; i < path.length - 1; i++) {
			if(!isDir(current[path[i]]))
				throw new MemoryFileSystemError(errors.code.ENOENT, _path, "writeFile");
			current = current[path[i]];
		}
		if(isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.EISDIR, _path, "writeFile");
		const encoding = typeof optionsOrEncoding === "object" ? optionsOrEncoding.encoding : optionsOrEncoding;
		current[path[i]] = optionsOrEncoding || typeof content === "string" ? Buffer.from(content, encoding) : content;
		return;
	}

	// stream methods
	createReadStream(path, options) {
		let stream = new ReadableStream();
		let done = false;
		let data;
		try {
			data = this.readFileSync(path);
		} catch (e) {
			stream._read = function() {
				if (done) {
					return;
				}
				done = true;
				this.emit('error', e);
				this.push(null);
			};
			return stream;
		}
		options = options || { };
		options.start = options.start || 0;
		options.end = options.end || data.length;
		stream._read = function() {
			if (done) {
				return;
			}
			done = true;
			this.push(data.slice(options.start, options.end));
			this.push(null);
		};
		return stream;
	}

	createWriteStream(path) {
		let stream = new WritableStream();
		try {
			// Zero the file and make sure it is writable
			this.writeFileSync(path, Buffer.from(0));
		} catch(e) {
			// This or setImmediate?
			stream.once('prefinish', function() {
				stream.emit('error', e);
			});
			return stream;
		}
		let bl = [ ], len = 0;
		stream._write = (chunk, encoding, callback) => {
			bl.push(chunk);
			len += chunk.length;
			this.writeFile(path, Buffer.concat(bl, len), callback);
		}
		return stream;
	}

	// async functions
	exists(path, callback) {
		return callback(this.existsSync(path));
	}

	writeFile(path, content, encoding, callback) {
		if(!callback) {
			callback = encoding;
			encoding = undefined;
		}
		try {
			this.writeFileSync(path, content, encoding);
		} catch(e) {
			return callback(e);
		}
		return callback();
	}
}

// async functions

["stat", "readdir", "mkdirp", "rmdir", "unlink", "readlink"].forEach(function(fn) {
	MemoryFileSystem.prototype[fn] = function(path, callback) {
		let result;
		try {
			result = this[fn + "Sync"](path);
		} catch(e) {
			setImmediate(function() {
				callback(e);
			});

			return;
		}
		setImmediate(function() {
			callback(null, result);
		});
	};
});

["mkdir", "readFile"].forEach(function(fn) {
	MemoryFileSystem.prototype[fn] = function(path, optArg, callback) {
		if(!callback) {
			callback = optArg;
			optArg = undefined;
		}
		let result;
		try {
			result = this[fn + "Sync"](path, optArg);
		} catch(e) {
			setImmediate(function() {
				callback(e);
			});

			return;
		}
		setImmediate(function() {
			callback(null, result);
		});
	};
});

module.exports = {MemoryFileSystem};
