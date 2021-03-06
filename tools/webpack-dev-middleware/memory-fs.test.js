var bl = require("bl");
var should = require("should");
var {MemoryFileSystem , MemoryFileSystemError } = require("./memory-fs");

describe("error", function() {
	function catchError(fn) {
		try {
			fn();
		} catch(e) {
			return e;
		}
		return null;
	}

	it("should include the path in Error message", function(done) {
		var fs = new MemoryFileSystem();
		var invalidPath = "/nonexist/file";
		var error = catchError(function() {
			fs.statSync(invalidPath);
		});
		error.message.should.containEql(invalidPath);

		fs.readFile(invalidPath, function(err) {
			err.message.should.containEql(invalidPath);
			done();
		});
	});
	it("should use correct error message in the first line of Error stack", function(done) {
		var fs = new MemoryFileSystem();
		fs.unlink("/test/abcd", function(error) {
			error.should.be.instanceof(Error);
			error.stack.should.startWith(error.name);

			var firstLine = error.stack.split(/\r\n|\n/)[0];
			firstLine.should.containEql(error.code);
			firstLine.should.containEql(error.message);
			firstLine.should.containEql(error.operation);
			done();
		});
	});
	it("should work fine without operation name", function() {
		var errorData = {
			code:"ETEST",
			description:"testerror"
		};
		var errorPath = "file";
		var error = new MemoryFileSystemError(errorData, errorPath);
		error.message.should.startWith(error.code);
		error.stack.should.startWith(error.name);
		error.stack.should.containEql(error.message);
		error.stack.should.containEql(errorPath);
	});
});


describe("directory", function() {
	it("should have a empty root directory as startup", function(done) {
		var fs = new MemoryFileSystem();
		fs.readdirSync("/").should.be.eql([]);
		var stat = fs.statSync("/");
		stat.isFile().should.be.eql(false);
		stat.isDirectory().should.be.eql(true);
		fs.readdir("/", function(err, files) {
			if(err) throw err;
			files.should.be.eql([]);
			done();
		});
	});
	it("should make and remove directories (linux style)", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirSync("/test");
		fs.mkdirSync("/test//sub/");
		fs.mkdirpSync("/test/sub2");
		fs.mkdirSync("/root\\dir");
		fs.mkdirpSync("/");
		fs.mkdirSync("/");
		fs.readdirSync("/").should.be.eql(["test", "root\\dir"]);
		fs.readdirSync("/test/").should.be.eql(["sub", "sub2"]);
		fs.rmdirSync("/test/sub//");
		fs.readdirSync("//test").should.be.eql(["sub2"]);
		fs.rmdirSync("/test/sub2");
		fs.rmdirSync("/test");
		fs.existsSync("/test").should.be.eql(false);
		(function() {
			fs.readdirSync("/test");
		}).should.throw();
		fs.readdirSync("/").should.be.eql(["root\\dir"]);
		fs.mkdirpSync("/a/depth/sub/dir");
		fs.existsSync("/a/depth/sub").should.be.eql(true);
		var stat = fs.statSync("/a/depth/sub");
		stat.isFile().should.be.eql(false);
		stat.isDirectory().should.be.eql(true);
	});
	it("should make and remove directories (windows style)", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirSync("C:\\");
		fs.mkdirSync("C:\\test");
		fs.mkdirSync("C:\\test\\\\sub/");
		fs.mkdirpSync("c:\\test/sub2");
		fs.mkdirSync("C:\\root-dir");
		fs.readdirSync("C:").should.be.eql(["test", "root-dir"]);
		fs.readdirSync("C:/test/").should.be.eql(["sub", "sub2"]);
		fs.rmdirSync("C:/test\\sub\\\\");
		fs.readdirSync("C:\\\\test").should.be.eql(["sub2"]);
		fs.rmdirSync("C:\\test\\sub2");
		fs.rmdirSync("C:\\test");
		fs.existsSync("C:\\test").should.be.eql(false);
		(function() {
			fs.readdirSync("C:\\test");
		}).should.throw();
		fs.readdirSync("C:").should.be.eql(["root-dir"]);
		fs.mkdirpSync("D:\\a\\depth\\sub\\dir");
		fs.existsSync("D:\\a\\depth\\sub").should.be.eql(true);
		var stat = fs.statSync("D:\\a\\depth\\sub");
		stat.isFile().should.be.eql(false);
		stat.isDirectory().should.be.eql(true);
		fs.readdirSync("D:\\//a/depth/\\sub").should.be.eql(["dir"]);
	});
	it("should call a mkdir callback when passed as the third argument", function(done) {
		var fs = new MemoryFileSystem();
		fs.mkdir('/test', {}, function(err) {
			if (err) throw err;
			done();
		});
	});
});
describe("files", function() {
	it("should make and remove files", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirSync("/test");
		var buf = new Buffer("Hello World", "utf-8");
		fs.writeFileSync("/test/hello-world.txt", buf);
		fs.readFileSync("/test/hello-world.txt").should.be.eql(buf);
		fs.readFileSync("/test/hello-world.txt", "utf-8").should.be.eql("Hello World");
		fs.readFileSync("/test/hello-world.txt", {encoding: "utf-8"}).should.be.eql("Hello World");
		(function() {
			fs.readFileSync("/test/other-file");
		}).should.throw();
		(function() {
			fs.readFileSync("/test/other-file", "utf-8");
		}).should.throw();
		fs.writeFileSync("/a", "Test", "utf-8");
		fs.readFileSync("/a", "utf-8").should.be.eql("Test");
		var stat = fs.statSync("/a");
		stat.isFile().should.be.eql(true);
		stat.isDirectory().should.be.eql(false);
		fs.writeFileSync("/b", "Test", {encoding: "utf-8"});
		fs.readFileSync("/b", "utf-8").should.be.eql("Test");
	});
});
describe("errors", function() {
	it("should fail on invalid paths", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirpSync("/test/a/b/c");
		fs.mkdirpSync("/test/a/bc");
		fs.mkdirpSync("/test/abc");
		(function() {
			fs.mkdirpSync("xyz");
		}).should.throw();
		(function() {
			fs.readdirSync("/test/abc/a/b/c");
		}).should.throw();
		(function() {
			fs.readdirSync("/abc");
		}).should.throw();
		(function() {
			fs.statSync("/abc");
		}).should.throw();
		(function() {
			fs.mkdirSync("/test/a/d/b/c");
		}).should.throw();
		(function() {
			fs.writeFileSync("/test/a/d/b/c", "Hello");
		}).should.throw();
		(function() {
			fs.readFileSync("/test/a/d/b/c");
		}).should.throw();
		(function() {
			fs.readFileSync("/test/abcd");
		}).should.throw();
		(function() {
			fs.mkdirSync("/test/abcd/dir");
		}).should.throw();
		(function() {
			fs.unlinkSync("/test/abcd");
		}).should.throw();
		(function() {
			fs.unlinkSync("/test/abcd/file");
		}).should.throw();
		(function() {
			fs.statSync("/test/a/d/b/c");
		}).should.throw();
		(function() {
			fs.statSync("/test/abcd");
		}).should.throw();
		fs.mkdir("/test/a/d/b/c", function(err) {
			err.should.be.instanceof(Error);
		});
	});
	it("should fail incorrect arguments", function() {
		var fs = new MemoryFileSystem();
		(function() {
			fs.writeFileSync("/test");
		}).should.throw();
	});
	it("should fail on wrong type", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirpSync("/test/dir");
		fs.mkdirpSync("/test/dir");
		fs.writeFileSync("/test/file", "Hello");
		(function() {
			fs.writeFileSync("/test/dir", "Hello");
		}).should.throw();
		(function() {
			fs.readFileSync("/test/dir");
		}).should.throw();
		(function() {
			fs.writeFileSync("/", "Hello");
		}).should.throw();
		(function() {
			fs.rmdirSync("/");
		}).should.throw();
		(function() {
			fs.unlinkSync("/");
		}).should.throw();
		(function() {
			fs.mkdirSync("/test/dir");
		}).should.throw();
		(function() {
			fs.mkdirSync("/test/file");
		}).should.throw();
		(function() {
			fs.mkdirpSync("/test/file");
		}).should.throw();
		(function() {
			fs.readdirSync("/test/file");
		}).should.throw();
		fs.readdirSync("/test/").should.be.eql(["dir", "file"]);
	});
	it("should throw on readlink", function() {
		var fs = new MemoryFileSystem();
		fs.mkdirpSync("/test/dir");
		(function() {
			fs.readlinkSync("/");
		}).should.throw();
		(function() {
			fs.readlinkSync("/link");
		}).should.throw();
		(function() {
			fs.readlinkSync("/test");
		}).should.throw();
		(function() {
			fs.readlinkSync("/test/dir");
		}).should.throw();
		(function() {
			fs.readlinkSync("/test/dir/link");
		}).should.throw();
	});
});
describe("async", function() {
	["stat", "readdir", "mkdirp", "rmdir", "unlink", "readlink"].forEach(function(methodName) {
		it("should call " + methodName + " callback in a new event cycle", function(done) {
			var fs = new MemoryFileSystem();
			var isCalled = false;
			fs[methodName]('/test', function() {
				isCalled = true;
				done();
			});
			should(isCalled).eql(false);
		});
	});
	["mkdir", "readFile"].forEach(function(methodName) {
		it("should call " + methodName + " a callback in a new event cycle", function(done) {
			var fs = new MemoryFileSystem();
			var isCalled = false;
			fs[methodName]('/test', {}, function() {
				isCalled = true;
				done();
			});
			should(isCalled).eql(false);
		});
	});
	it("should be able to use the async versions", function(done) {
		var fs = new MemoryFileSystem();
		fs.mkdirp("/test/dir", function(err) {
			if(err) throw err;
			fs.writeFile("/test/dir/a", "Hello", function(err) {
				if(err) throw err;
				fs.writeFile("/test/dir/b", "World", "utf-8", function(err) {
					if(err) throw err;
					fs.readFile("/test/dir/a", "utf-8", function(err, content) {
						if(err) throw err;
						content.should.be.eql("Hello");
						fs.readFile("/test/dir/b", function(err, content) {
							if(err) throw err;
							content.should.be.eql(new Buffer("World"));
							fs.exists("/test/dir/b", function(exists) {
								exists.should.be.eql(true);
								done();
							});
						});
					});
				});
			});
		});
	});
	it("should return errors", function(done) {
		var fs = new MemoryFileSystem();
		fs.readFile("/fail/file", function(err, content) {
			err.should.be.instanceof(Error);
			fs.writeFile("/fail/file", "", function(err) {
				err.should.be.instanceof(Error);
				done();
			});
		});
	});
});
describe("streams", function() {
	describe("writable streams", function() {
		it("should write files", function() {
			var fs = new MemoryFileSystem();
			fs.createWriteStream("/file").end("Hello");
			fs.readFileSync("/file", "utf8").should.be.eql("Hello");
		});
		it("should zero files", function() {
			var fs = new MemoryFileSystem();
			fs.createWriteStream("/file").end();
			fs.readFileSync("/file", "utf8").should.be.eql("");
		});
		it("should accept pipes", function(done) {
			// TODO: Any way to avoid the asyncness of this?
			var fs = new MemoryFileSystem();
			bl(new Buffer("Hello"))
				.pipe(fs.createWriteStream("/file"))
				.once('finish', function() {
					fs.readFileSync("/file", "utf8").should.be.eql("Hello");
					done();
				});
		});
		it("should propagate errors", function(done) {
			var fs = new MemoryFileSystem();
			var stream = fs.createWriteStream("file");
			var err = false;
			stream.once('error', function() {
				err = true;
			}).once('finish', function() {
				err.should.eql(true);
				done();
			});
			stream.end();
		});
	});
	describe("readable streams", function() {
		it("should read files", function(done) {
			var fs = new MemoryFileSystem();
			fs.writeFileSync("/file", "Hello");
			fs.createReadStream("/file").pipe(bl(function(err, data) {
				data.toString('utf8').should.be.eql("Hello");
				done();
			}));
		});
		it("should respect start/end", function(done) {
			var fs = new MemoryFileSystem();
			fs.writeFileSync("/file", "Hello");
			fs.createReadStream("/file", {
				start: 1,
				end: 3
			}).pipe(bl(function(err, data) {
				data.toString('utf8').should.be.eql("el");
				done();
			}));
		});
		it("should propagate errors", function(done) {
			var fs = new MemoryFileSystem();
			var stream = fs.createReadStream("file");
			var err = false;
			// Why does this dummy event need to be here? It looks like it
			// either has to be this or data before the stream will actually
			// do anything.
			stream.on('readable', function() { }).on('error', function() {
				err = true;
			}).on('end', function() {
				err.should.eql(true);
				done();
			});
			stream.read(0);
		});
	});
});
describe("normalize", function() {
	it("should normalize paths", function() {
		var fs = new MemoryFileSystem();
		fs.normalize("/a/b/c").should.be.eql("/a/b/c");
		fs.normalize("/a//b/c").should.be.eql("/a/b/c");
		fs.normalize("/a//b//c").should.be.eql("/a/b/c");
		fs.normalize("//a//b//c").should.be.eql("/a/b/c");
		fs.normalize("/a/////b/c").should.be.eql("/a/b/c");
		fs.normalize("/./a/d///..////b/c").should.be.eql("/a/b/c");
		fs.normalize("/..").should.be.eql("/");
		fs.normalize("/.").should.be.eql("/");
		fs.normalize("/.git").should.be.eql("/.git");
		fs.normalize("/a/b/c/.git").should.be.eql("/a/b/c/.git");
		fs.normalize("/a/b/c/..git").should.be.eql("/a/b/c/..git");
		fs.normalize("/a/b/c/..").should.be.eql("/a/b");
		fs.normalize("/a/b/c/../..").should.be.eql("/a");
		fs.normalize("/a/b/c/../../..").should.be.eql("/");
		fs.normalize("C:\\a\\..").should.be.eql("C:\\");
		fs.normalize("C:\\a\\b\\..").should.be.eql("C:\\a");
		fs.normalize("C:\\a\\b\\\c\\..\\..").should.be.eql("C:\\a");
		fs.normalize("C:\\a\\b\\d\\..\\c\\..\\..").should.be.eql("C:\\a");
		fs.normalize("C:\\a\\b\\d\\\\.\\\\.\\c\\.\\..").should.be.eql("C:\\a\\b\\d");
		fs.normalize("\\\\remote-computer\\c$\\file").should.be.eql("\\\\remote-computer\\c$\\file");
		fs.normalize("./../a").should.be.eql("../a");
		fs.normalize("/a/./../b").should.be.eql("/b");
		fs.normalize("/./../b").should.be.eql("/b");
		fs.normalize("C:\\.\\..\\a").should.be.eql("C:\\a");
		fs.normalize("C:\\a\\.\\..\\b").should.be.eql("C:\\b");
	});
});
describe("pathToArray", function() {
	it("should split path to an array of parts", function() {
		var fs = new MemoryFileSystem();
		fs.pathToArray("/a/b/c").should.be.eql(["a", "b", "c"]);
		fs.pathToArray("C:/a/b").should.be.eql(["C:", "a", "b"]);
		fs.pathToArray("C:\\a\\b").should.be.eql(["C:", "a", "b"]);
	});
	it("should fail on invalid paths", function() {
		var fs = new MemoryFileSystem();
		(function() {
			fs.pathToArray("0:/");
		}).should.throw();
	});
});
describe("join", function() {
	it("should join paths", function() {
		var fs = new MemoryFileSystem();
		fs.join("/", "a/b/c").should.be.eql("/a/b/c");
		fs.join("/a", "b/c").should.be.eql("/a/b/c");
		fs.join("/a/b", "c").should.be.eql("/a/b/c");
		fs.join("/a/", "b/c").should.be.eql("/a/b/c");
		fs.join("/a//", "b/c").should.be.eql("/a/b/c");
		fs.join("a", "b/c").should.be.eql("a/b/c");
		fs.join("a/b", "c").should.be.eql("a/b/c");
		fs.join("C:", "a/b").should.be.eql("C:\\a\\b");
		fs.join("C:\\", "a/b").should.be.eql("C:\\a\\b");
		fs.join("C:\\", "a\\b").should.be.eql("C:\\a\\b");
		fs.join("C:/a/b", "./../c/d").should.be.eql("C:\\a\\c\\d");
		fs.join("C:\\a\\b", "./../c/d").should.be.eql("C:\\a\\c\\d");
	});
	it("should join paths (weird cases)", function() {
		var fs = new MemoryFileSystem();
		fs.join("/", "").should.be.eql("/");
		// https://github.com/webpack/memory-fs/pull/17
		fs.join("/", undefined).should.be.eql("/");
		fs.join("/a/b/", "").should.be.eql("/a/b/");
		fs.join("/a/b/c", "").should.be.eql("/a/b/c");
		fs.join("C:", "").should.be.eql("C:");
		fs.join("C:\\a\\b", "").should.be.eql("C:\\a\\b");
	});
	it("should join paths (absolute request)", function() {
		var fs = new MemoryFileSystem();
		fs.join("/a/b/c", "/d/e/f").should.be.eql("/d/e/f");
		fs.join("C:\\a\\b\\c", "/d/e/f").should.be.eql("/d/e/f");
		fs.join("/a/b/c", "C:\\d\\e\\f").should.be.eql("C:\\d\\e\\f");
		fs.join("C:\\a\\b\\c", "C:\\d\\e\\f").should.be.eql("C:\\d\\e\\f");
	});
});
describe("os", function() {
	var fileSystem;

	beforeEach(function() {
		fileSystem = new MemoryFileSystem({
			"": true,
			a: {
				"": true,
				index: new Buffer("1"), // /a/index
				dir: {
					"": true,
					index: new Buffer("2") // /a/dir/index
				}
			},
			"C:": {
				"": true,
				a: {
					"": true,
					index: new Buffer("3"),  // C:\files\index
					dir: {
						"": true,
						index: new Buffer("4")  // C:\files\a\index
					}
				}
			}
		});
	});

	describe("unix", function() {
		it("should stat stuff", function() {
			fileSystem.statSync("/a").isDirectory().should.be.eql(true);
			fileSystem.statSync("/a").isFile().should.be.eql(false);
			fileSystem.statSync("/a/index").isDirectory().should.be.eql(false);
			fileSystem.statSync("/a/index").isFile().should.be.eql(true);
			fileSystem.statSync("/a/dir").isDirectory().should.be.eql(true);
			fileSystem.statSync("/a/dir").isFile().should.be.eql(false);
			fileSystem.statSync("/a/dir/index").isDirectory().should.be.eql(false);
			fileSystem.statSync("/a/dir/index").isFile().should.be.eql(true);
		});
		it("should readdir directories", function() {
			fileSystem.readdirSync("/a").should.be.eql(["index", "dir"]);
			fileSystem.readdirSync("/a/dir").should.be.eql(["index"]);
		});
		it("should readdir directories", function() {
			fileSystem.readFileSync("/a/index", "utf-8").should.be.eql("1");
			fileSystem.readFileSync("/a/dir/index", "utf-8").should.be.eql("2");
		});
		it("should also accept multi slashs", function() {
			fileSystem.statSync("/a///dir//index").isFile().should.be.eql(true);
		});
	});

	describe("windows", function() {
		it("should stat stuff", function() {
			fileSystem.statSync("C:\\a").isDirectory().should.be.eql(true);
			fileSystem.statSync("C:\\a").isFile().should.be.eql(false);
			fileSystem.statSync("C:\\a\\index").isDirectory().should.be.eql(false);
			fileSystem.statSync("C:\\a\\index").isFile().should.be.eql(true);
			fileSystem.statSync("C:\\a\\dir").isDirectory().should.be.eql(true);
			fileSystem.statSync("C:\\a\\dir").isFile().should.be.eql(false);
			fileSystem.statSync("C:\\a\\dir\\index").isDirectory().should.be.eql(false);
			fileSystem.statSync("C:\\a\\dir\\index").isFile().should.be.eql(true);
		});
		it("should readdir directories", function() {
			fileSystem.readdirSync("C:\\a").should.be.eql(["index", "dir"]);
			fileSystem.readdirSync("C:\\a\\dir").should.be.eql(["index"]);
		});
		it("should readdir directories", function() {
			fileSystem.readFileSync("C:\\a\\index", "utf-8").should.be.eql("3");
			fileSystem.readFileSync("C:\\a\\dir\\index", "utf-8").should.be.eql("4");
		});
		it("should also accept multi slashs", function() {
			fileSystem.statSync("C:\\\\a\\\\\\dir\\\\index").isFile().should.be.eql(true);
		});
		it("should also accept a normal slash", function() {
			fileSystem.statSync("C:\\a\\dir/index").isFile().should.be.eql(true);
			fileSystem.statSync("C:\\a\\dir\\index").isFile().should.be.eql(true);
			fileSystem.statSync("C:\\a/dir/index").isFile().should.be.eql(true);
			fileSystem.statSync("C:\\a/dir\\index").isFile().should.be.eql(true);
		});
	});
});
