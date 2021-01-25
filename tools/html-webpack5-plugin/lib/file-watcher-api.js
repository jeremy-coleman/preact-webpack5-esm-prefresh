'use strict';
function createSnapshot(fileDependencies, mainCompilation, startTime) {
    return new Promise((resolve, reject) => {
        mainCompilation.fileSystemInfo.createSnapshot(startTime, fileDependencies.fileDependencies, fileDependencies.contextDependencies, fileDependencies.missingDependencies, null, (err, snapshot) => {
            if (err) {
                return reject(err);
            }
            resolve(snapshot);
        });
    });
}
function isSnapShotValid(snapshot, mainCompilation) {
    return new Promise((resolve, reject) => {
        mainCompilation.fileSystemInfo.checkSnapshotValid(snapshot, (err, isValid) => {
            if (err) {
                reject(err);
            }
            resolve(isValid);
        });
    });
}
function watchFiles(mainCompilation, fileDependencies) {
    Object.keys(fileDependencies).forEach((depencyTypes) => {
        fileDependencies[depencyTypes].forEach(fileDependency => {
            mainCompilation[depencyTypes].add(fileDependency);
        });
    });
}

module.exports = {
    createSnapshot,
    isSnapShotValid,
    watchFiles
};
