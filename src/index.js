/**
 * @copyright 2015, Andrey Popp <8mayday@gmail.com>
 */

import fs                   from 'fs';
import path                 from 'path';
import debug                from 'debug';
import webpack              from 'webpack';
import Promise              from 'bluebird';
import findParentDir        from 'find-parent-dir';
import escapeRegexp         from 'escape-regexp';
import nodeCallbackAdapter  from 'node-callback-adapter';
import {Minimatch}          from 'minimatch';

let findParentDirPromise = Promise.promisify(findParentDir);
let readFilePromise = Promise.promisify(fs.readFile);

let log = debug('webpack-package-loaders-plugin');


function getByKeyPath(obj, keyPath) {
  for (var i = 0; i < keyPath.length; i++) {
    if (obj == null) {
      return;
    }
    obj = obj[keyPath[i]];
  }
  return obj;
}

function parsePackageData(src, loadersKeyPath) {
  let data = JSON.parse(src);
  var loaders = getByKeyPath(data, loadersKeyPath);
  if (loaders) {
    loaders.forEach(loader => {
      if (typeof loader.loader === 'string') {
        loader.test = new Minimatch(loader.test);
      }
    });
  }
  return data;
}

function injectNoLoaders(packageData, packageDirname) {
  return [];
}

const DEFAULT_OPTIONS = {
  packageMeta: 'package.json',
  loadersKeyPath: ['webpack', 'loaders'],
  injectLoaders: injectNoLoaders
}

/**
 * Plugin which injects per-package loaders.
 *
 * @param {Object} options Options object allows the following keys
 */
export default class PackageLoadersPlugin {

  constructor(options) {
    this.options = {...DEFAULT_OPTIONS, ...options};
    this._packagesByDirectory = {};
    this._packageDirectoriesByDirectory = {};
  }

  apply(compiler) {
    compiler.plugin('normal-module-factory', factory =>
      factory.plugin('after-resolve', (data, callback) =>
        this.onAfterResolve(compiler, factory, data, callback)));
  }

  @nodeCallbackAdapter
  async onAfterResolve(compiler, factory, data) {
    log(`processing ${data.resource} resource`);
    let resolveLoader = Promise.promisify(compiler.resolvers.loader.resolve);
    let {packageData, packageDirname} = await this.findPackageForResource(data.resource);
    if (!packageData) {
      return data;
    }
    let loaders = getByKeyPath(packageData, this.options.loadersKeyPath)
    if (!loaders) {
      loaders = [];
    }
    let resourceRelative = path.relative(packageDirname, data.resource);
    loaders = loaders
      .filter(loader => loader.test.match(resourceRelative))
      .concat(this.options.injectLoaders(packageData, packageDirname))
      .map(loader => resolveLoader(path.dirname(data.resource), loader.loader));
    loaders = await Promise.all(loaders);
    log(`adding ${loaders} loaders for ${resourceRelative} resource`);
    return {
      ...data,
      loaders: data.loaders.concat(loaders)
    };
  }

  /**
   * Find a package metadata for a specified resource.
   */
  async findPackageForResource(resource) {
    let dirname = path.dirname(resource);
    if (this._packageDirectoriesByDirectory[dirname] === undefined) {
      log(`finding package directory for ${dirname}`);
      // TODO: We are not using caching fs here.
      this._packageDirectoriesByDirectory[dirname] = findParentDirPromise(dirname, this.options.packageMeta);
    }
    let packageDirname = await this._packageDirectoriesByDirectory[dirname];
    if (!packageDirname) {
      log(`no package metadata found for ${resource} resource`);
      return {packageData: null, packageDirname};
    }
    if (this._packagesByDirectory[packageDirname] === undefined) {
      this._packagesByDirectory[packageDirname] = Promise.try(async () => {
        log(`reading package data for ${packageDirname}`);
        let packageMeta = path.join(packageDirname, this.options.packageMeta);
        // TODO: We are not using caching fs here.
        let packageSource = await readFilePromise(packageMeta, 'utf8');
        return parsePackageData(packageSource, this.options.loadersKeyPath);
      });
    }
    let packageData = await this._packagesByDirectory[packageDirname];
    return {packageData, packageDirname};
  }
}
