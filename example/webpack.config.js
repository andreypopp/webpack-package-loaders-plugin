var path = require('path');
var PackageLoadersPlugin = require('../src/index').default;

module.exports = {
  entry: require.resolve('./index'),
  output: {
    path: path.join(__dirname, 'bundle'),
    filename: 'bundle.js'
  },
  plugins: [new PackageLoadersPlugin()]
};
