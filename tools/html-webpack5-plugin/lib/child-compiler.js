'use strict';
'use strict';
let instanceId = 0;

class HtmlWebpackChildCompiler {
    constructor(templates) {
        this.id = instanceId++;
        this.templates = templates;
        this.compilationPromise;
        this.compilationStartedTimestamp;
        this.compilationEndedTimestamp;
        this.fileDependencies = { fileDependencies: [], contextDependencies: [], missingDependencies: [] };
    }
    isCompiling() {
        return !this.didCompile() && this.compilationStartedTimestamp !== undefined;
    }
    didCompile() {
        return this.compilationEndedTimestamp !== undefined;
    }
    compileTemplates(mainCompilation) {
        const webpack = mainCompilation.compiler.webpack;
        const Compilation = webpack.Compilation;
        const NodeTemplatePlugin = webpack.node.NodeTemplatePlugin;
        const NodeTargetPlugin = webpack.node.NodeTargetPlugin;
        const LoaderTargetPlugin = webpack.LoaderTargetPlugin;
        const EntryPlugin = webpack.EntryPlugin;
        if (this.compilationPromise) {
            return this.compilationPromise;
        }
        const outputOptions = {
            filename: '__child-[name]',
            publicPath: mainCompilation.outputOptions.publicPath,
            library: {
                type: 'var',
                name: 'HTML_WEBPACK_PLUGIN_RESULT'
            },
            scriptType: ('text/javascript'),
            iife: false
        };
        const compilerName = 'HtmlWebpackCompiler';
        const childCompiler = mainCompilation.createChildCompiler(compilerName, outputOptions, [
            new NodeTemplatePlugin(outputOptions),
            new NodeTargetPlugin(),
            new LoaderTargetPlugin('node')
        ]);
        childCompiler.context = mainCompilation.compiler.context;
        const temporaryTemplateNames = this.templates.map((template, index) => `__child-HtmlWebpackPlugin_${index}-${this.id}`);
        this.templates.forEach((template, index) => {
            new EntryPlugin(childCompiler.context, template, `HtmlWebpackPlugin_${index}-${this.id}`).apply(childCompiler);
        });
        this.compilationStartedTimestamp = new Date().getTime();
        this.compilationPromise = new Promise((resolve, reject) => {
            const extractedAssets = [];
            childCompiler.hooks.thisCompilation.tap('HtmlWebpackPlugin', (compilation) => {
                compilation.hooks.processAssets.tap({
                    name: 'HtmlWebpackPlugin',
                    stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
                }, (assets) => {
                    temporaryTemplateNames.forEach((temporaryTemplateName) => {
                        if (assets[temporaryTemplateName]) {
                            extractedAssets.push(assets[temporaryTemplateName]);
                            compilation.deleteAsset(temporaryTemplateName);
                        }
                    });
                });
            });
            childCompiler.runAsChild((err, entries, childCompilation) => {
                const compiledTemplates = entries
                    ? extractedAssets.map((asset) => asset.source())
                    : [];
                if (entries && childCompilation) {
                    this.fileDependencies = { fileDependencies: Array.from(childCompilation.fileDependencies), contextDependencies: Array.from(childCompilation.contextDependencies), missingDependencies: Array.from(childCompilation.missingDependencies) };
                }
                if (childCompilation && childCompilation.errors && childCompilation.errors.length) {
                    const errorDetails = childCompilation.errors.map(error => {
                        let message = error.message;
                        if ('error' in error) {
                            message += ':\n' + error.error;
                        }
                        if (error.stack) {
                            message += '\n' + error.stack;
                        }
                        return message;
                    }).join('\n');
                    reject(new Error('Child compilation failed:\n' + errorDetails));
                    return;
                }
                if (err) {
                    reject(err);
                    return;
                }
                if (!childCompilation || !entries) {
                    reject(new Error('Empty child compilation'));
                    return;
                }
                const result = {};
                compiledTemplates.forEach((templateSource, entryIndex) => {
                    result[this.templates[entryIndex]] = {
                        content: templateSource,
                        hash: childCompilation.hash,
                        entry: entries[entryIndex]
                    };
                });
                this.compilationEndedTimestamp = new Date().getTime();
                resolve(result);
            });
        });
        return this.compilationPromise;
    }
}
module.exports = {
    HtmlWebpackChildCompiler
};
