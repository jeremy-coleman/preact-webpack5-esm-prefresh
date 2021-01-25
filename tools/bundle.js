const assert = require("assert")
const webpack = require("webpack")
const config = require("./webpack.config.js")
const {logSymbols} = require("./tools/cli-helpers.js")

var rimraf = require("rimraf")
var fs = require('fs')

rimraf.sync("dist")
assert(true, !fs.existsSync("dist/app/index.html"))
fs.mkdirSync("dist/app", {recursive: true})


const args = process.argv.slice(1)
args.forEach((arg) => console.info(arg))
args.some((arg) => arg === "--sayhi") && console.log("hi")


function start() {
  //console.log("is it really clean?", !fs.existsSync("dist/app/index.html"))
  const compiler = webpack(config)
  let started = false
  console.info(logSymbols.info, "Bundling")
  const watcher = compiler.watch({}, (err, stats) => {
    if (!err && !stats.hasErrors() && !started) {
      started = true
      console.info(logSymbols.success, 'bundled');
      if (err) {
        console.warn(err)
      }
    }
  })
  return watcher
}

start()
