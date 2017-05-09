# Webpack Package Loaders Plugin

This is a [webpack][] plugin which discovers which loaders to apply to files
through `package.json` metadata. This is similar to how [browserify][] allows to
configure its local per-package transforms.

**WARNING:** Tested with webpack 1 only for now.

## Installation

    % npm install webpack-package-loaders-plugin

## Usage

Activate plugin in `webpack.config.js`:

    var PackageLoadersPlugin = require('webpack-package-loaders-plugin')

    module.exports = {
      ...
      plugins: [new PackageLoadersPlugin()]
    }

Packages can define local configuration for loaders in their `package.json`
files:

    {
      "name": "some-package",
      ...
      "webpack": {
        "loaders": [
          {
            "test": "*.js",
            "loader": "babel-loader?presets[]=es2015"
          }
        ]
      }
    }

Now `PackageLoadersPlugin` will automatically activate `babel-loader` transform
for all `*.js` files within the `some-package` package so you don't need to
specify `babel-loader` in global `webpack.config.js` configuration.

[webpack]: http://webpack.github.io
[browserify]: http://browserify.org
