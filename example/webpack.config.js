var path = require('path');
var PackageLoadersPlugin = require('../lib/index');

module.exports = {
  entry: require.resolve('./index'),
  output: {
    path: path.join(__dirname, 'bundle'),
    filename: 'bundle.js'
  },
  module: {
    loaders: [
      {test: /\.js/, loader: 'jsx-loader?harmony=true'}
    ]
  },
  plugins: [new PackageLoadersPlugin()]
};
