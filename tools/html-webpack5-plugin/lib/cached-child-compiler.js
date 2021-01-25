'use strict';
const { HtmlWebpackChildCompiler } = require('./child-compiler');
const fileWatcherApi = require('./file-watcher-api');
const compilerMap = new WeakMap();

class CachedChildCompilation {
    constructor(compiler) {
        this.compiler = compiler;
        if (compilerMap.has(compiler)) {
            return;
        }
        const persistentChildCompilerSingletonPlugin = new PersistentChildCompilerSingletonPlugin();
        compilerMap.set(compiler, persistentChildCompilerSingletonPlugin);
        persistentChildCompilerSingletonPlugin.apply(compiler);
    }
    addEntry(entry) {
        const persistentChildCompilerSingletonPlugin = compilerMap.get(this.compiler);
        if (!persistentChildCompilerSingletonPlugin) {
            throw new Error('PersistentChildCompilerSingletonPlugin instance not found.');
        }
        persistentChildCompilerSingletonPlugin.addEntry(entry);
    }
    getCompilationResult() {
        const persistentChildCompilerSingletonPlugin = compilerMap.get(this.compiler);
        if (!persistentChildCompilerSingletonPlugin) {
            throw new Error('PersistentChildCompilerSingletonPlugin instance not found.');
        }
        return persistentChildCompilerSingletonPlugin.getLatestResult();
    }
    getCompilationEntryResult(entry) {
        const latestResult = this.getCompilationResult();
        const compilationResult = latestResult.compilationResult;
        return 'error' in compilationResult ? {
            mainCompilationHash: latestResult.mainCompilationHash,
            error: compilationResult.error
        } : {
            mainCompilationHash: latestResult.mainCompilationHash,
            compiledEntry: compilationResult.compiledEntries[entry]
        };
    }
}
class PersistentChildCompilerSingletonPlugin {
    constructor() {
        this.compilationState = {
            isCompiling: false,
            isVerifyingCache: false,
            entries: [],
            compiledEntries: [],
            mainCompilationHash: 'initial',
            compilationResult: {
                dependencies: {
                    fileDependencies: [],
                    contextDependencies: [],
                    missingDependencies: []
                },
                compiledEntries: {}
            }
        };
    }
    apply(compiler) {
        let childCompilationResultPromise = Promise.resolve({
            dependencies: {
                fileDependencies: [],
                contextDependencies: [],
                missingDependencies: []
            },
            compiledEntries: {}
        });
        let mainCompilationHashOfLastChildRecompile = '';
        let previousFileSystemSnapshot;
        let compilationStartTime = new Date().getTime();
        compiler.hooks.make.tapAsync('PersistentChildCompilerSingletonPlugin', (mainCompilation, callback) => {
            if (this.compilationState.isCompiling || this.compilationState.isVerifyingCache) {
                return callback(new Error('Child compilation has already started'));
            }
            compilationStartTime = new Date().getTime();
            this.compilationState = {
                isCompiling: false,
                isVerifyingCache: true,
                previousEntries: this.compilationState.compiledEntries,
                previousResult: this.compilationState.compilationResult,
                entries: this.compilationState.entries
            };
            const isCacheValidPromise = this.isCacheValid(previousFileSystemSnapshot, mainCompilation);
            let cachedResult = childCompilationResultPromise;
            childCompilationResultPromise = isCacheValidPromise.then((isCacheValid) => {
                if (isCacheValid) {
                    return cachedResult;
                }
                const compiledEntriesPromise = this.compileEntries(mainCompilation, this.compilationState.entries);
                compiledEntriesPromise.then((childCompilationResult) => {
                    return fileWatcherApi.createSnapshot(childCompilationResult.dependencies, mainCompilation, compilationStartTime);
                }).then((snapshot) => {
                    previousFileSystemSnapshot = snapshot;
                });
                return compiledEntriesPromise;
            });
            mainCompilation.hooks.optimizeTree.tapAsync('PersistentChildCompilerSingletonPlugin', (chunks, modules, callback) => {
                const handleCompilationDonePromise = childCompilationResultPromise.then(childCompilationResult => {
                    this.watchFiles(mainCompilation, childCompilationResult.dependencies);
                });
                handleCompilationDonePromise.then(() => callback(null, chunks, modules), callback);
            });
            mainCompilation.hooks.additionalAssets.tapAsync('PersistentChildCompilerSingletonPlugin', (callback) => {
                const didRecompilePromise = Promise.all([childCompilationResultPromise, cachedResult]).then(([childCompilationResult, cachedResult]) => {
                    return (cachedResult !== childCompilationResult);
                });
                const handleCompilationDonePromise = Promise.all([childCompilationResultPromise, didRecompilePromise]).then(([childCompilationResult, didRecompile]) => {
                    if (didRecompile) {
                        mainCompilationHashOfLastChildRecompile = mainCompilation.hash;
                    }
                    this.compilationState = {
                        isCompiling: false,
                        isVerifyingCache: false,
                        entries: this.compilationState.entries,
                        compiledEntries: this.compilationState.entries,
                        compilationResult: childCompilationResult,
                        mainCompilationHash: mainCompilationHashOfLastChildRecompile
                    };
                });
                handleCompilationDonePromise.then(() => callback(null), callback);
            });
            callback(null);
        });
    }
    addEntry(entry) {
        if (this.compilationState.isCompiling || this.compilationState.isVerifyingCache) {
            throw new Error('The child compiler has already started to compile. ' +
                "Please add entries before the main compiler 'make' phase has started or " +
                'after the compilation is done.');
        }
        if (this.compilationState.entries.indexOf(entry) === -1) {
            this.compilationState.entries = [...this.compilationState.entries, entry];
        }
    }
    getLatestResult() {
        if (this.compilationState.isCompiling || this.compilationState.isVerifyingCache) {
            throw new Error('The child compiler is not done compiling. ' +
                "Please access the result after the compiler 'make' phase has started or " +
                'after the compilation is done.');
        }
        return {
            mainCompilationHash: this.compilationState.mainCompilationHash,
            compilationResult: this.compilationState.compilationResult
        };
    }
    isCacheValid(snapshot, mainCompilation) {
        if (!this.compilationState.isVerifyingCache) {
            return Promise.reject(new Error('Cache validation can only be done right before the compilation starts'));
        }
        if (this.compilationState.entries.length === 0) {
            return Promise.resolve(true);
        }
        if (this.compilationState.entries !== this.compilationState.previousEntries) {
            return Promise.resolve(false);
        }
        if (!snapshot) {
            return Promise.resolve(false);
        }
        return fileWatcherApi.isSnapShotValid(snapshot, mainCompilation);
    }
    compileEntries(mainCompilation, entries) {
        const compiler = new HtmlWebpackChildCompiler(entries);
        return compiler.compileTemplates(mainCompilation).then((result) => {
            return {
                compiledEntries: result,
                dependencies: compiler.fileDependencies,
                mainCompilationHash: mainCompilation.hash
            };
        }, error => ({
            error,
            dependencies: compiler.fileDependencies,
            mainCompilationHash: mainCompilation.hash
        }));
    }
    watchFiles(mainCompilation, files) {
        fileWatcherApi.watchFiles(mainCompilation, files);
    }
}
module.exports = {
    CachedChildCompilation
};
