//const express = require('express');
const {polka} = require('./tools/polka');
const path = require('path');
const webpack = require('webpack');
const config = require('./webpack.config');

const app = polka()
//const app = express();

const compiler = webpack(config);

//app.use(express.static("public"));

app.use(require('./tools/webpack-dev-middleware')(compiler, {
    publicPath: config.output.publicPath,
}));

app.use(require("./tools/webpack-hot-middleware/middleware")(compiler));

app.listen(8888, () => {
    console.log('listening on http://localhost:8888')
})


// app.use('/api', function(req, res) {
//     res.header("Content-Type",'application/json');
//     res.sendFile(path.join(__dirname, './api/data.json'));  
// });