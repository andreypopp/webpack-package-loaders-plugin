import fs from 'fs';
import path from 'path';
import debug from 'debug';
import webpack from 'webpack';
import Promise from 'bluebird';
import findParentDir from 'find-parent-dir';
import escapeRegexp from 'escape-regexp';

let findParentDirPromise = Promise.promisify(findParentDir);
let readFilePromise = Promise.promisify(fs.readFile);

let log = debug('webpack-package-loaders-plugin');

/**
 * Turn a method which returns a promise into a method which accepts a
 * Node-style callback.
 */
function asNodeCallback(target, name, descriptor) {
  let value = descriptor.value;
  return {
    ...descriptor,
    value(...args) {
      let callback = args.pop();
      let promise = new Promise((resolve, reject) =>
          value.apply(this, args).then(resolve, reject));
      promise.done(
        result => callback(null, result),
        err => callback(err));
    }
  };
}

/**
 * Coerce a string into a regexp.
 */
function asRegExp(maybeRegexp) {
  if (typeof maybeRegexp === 'string') {
    return new RegExp(escapeRegexp(maybeRegexp));
  } else {
    return maybeRegexp;
  }
}

export default class PackageLoadersPlugin {

  constructor() {
    this._packagesByDirectory = {};
  }

  apply(compiler) {
    compiler.plugin('normal-module-factory', this.onNormalModuleFactory.bind(this, compiler));
  }

  onNormalModuleFactory(compiler, factory) {
    factory.plugin('after-resolve', this.onAfterResolve.bind(this, compiler, factory));
  }

  @asNodeCallback
  async onAfterResolve(compiler, factory, data) {
    log(`processing ${data.resource} resource`);
    let resolveLoader = Promise.promisify(compiler.resolvers.loader.resolve);
    let packageData = await this.findPackageForResource(data.resource);
    if (packageData && packageData.webpack && packageData.webpack.loaders) {
      let loaders = await Promise.all(packageData.webpack.loaders
        .filter(loader => loader.test.test(data.resource))
        .map(loader => resolveLoader(data.context, loader.loader)));
      log(`adding ${loaders} loaders for ${data.resource} resource`);
      data = {...data, loaders: data.loaders.concat(loaders)};
    }
    return data;
  }

  /**
   * Find a package metadata for a specified resource.
   */
  async findPackageForResource(resource) {
    let requestDirname = path.dirname(resource);
    // TODO: We are not using caching fs here.
    let packageDirname = await findParentDirPromise(requestDirname, 'package.json');
    if (!packageDirname) {
      log(`no package metadata found for ${resource} resource`);
      return null;
    }
    if (this._packagesByDirectory[packageDirname] !== undefined) {
      log(`found cached package metadata for ${resource} resource`);
      return this._packagesByDirectory[packageDirname];
    }
    let packageFilename = path.join(packageDirname, 'package.json');
    // TODO: We are not using caching fs here.
    let packageSource = await readFilePromise(packageFilename, 'utf8');
    let packageData = JSON.parse(packageSource);
    if (packageData.webpack && packageData.webpack.loaders) {
      packageData.webpack.loaders.forEach(loader => {
        if (typeof loader.loader === 'string') {
          loader.test = asRegExp(loader.test);
        }
      });
    }
    log(`found package metadata for ${resource} resource`);
    this._packagesByDirectory[packageDirname] = packageData;
    return packageData;
  }
}
