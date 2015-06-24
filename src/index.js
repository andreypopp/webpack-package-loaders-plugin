/**
 * @copyright 2015, Andrey Popp <8mayday@gmail.com>
 */

import path                 from 'path';
import debug                from 'debug';
import Promise              from 'bluebird';
import escapeRegexp         from 'escape-regexp';
import nodeCallbackAdapter  from 'node-callback-adapter';
import {Minimatch}          from 'minimatch';

let log = debug('webpack-package-loaders-plugin');

const SPLIT_PATH = /(\/|\\)/;

function readFilePromise(fs, filename, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(filename, function(err, data) {
      if (err) {
        reject(err);
      } else {
        if (encoding !== undefined) {
          data = data.toString(encoding);
        }
        resolve(data);
      }
    });
  });
}

function splitPath(path) {
  let parts = path.split(SPLIT_PATH);
  if (parts.length === 0) {
    return parts;
  } else if (parts[0].length === 0) {
    // when path starts with a slash, the first part is empty string
    return parts.slice(1);
  } else {
    return parts;
  }
}

function pathExists(fs, path) {
  return new Promise(function(resolve, reject) {
    fs.stat(path, function(err) {
      resolve(!err);
    });
  });
}

function findPackageMetadataFilename(fs, currentFullPath, clue) {
  currentFullPath = splitPath(currentFullPath);
  if (!Array.isArray(clue)) {
    clue = [clue];
  }
  return findPackageMetadataFilenameImpl(fs, currentFullPath, clue);
}

async function findPackageMetadataFilenameImpl(fs, parts, clue) {
  if (parts.length === 0) {
    return {filename: null, dirname: null};
  } else {
    let p = parts.join('');
    for (let i = 0; i < clue.length; i++) {
      let filename = path.join(p, clue[i]);
      let exists = await pathExists(fs, filename);
      if (exists) {
        return {filename, dirname: p};
      }
    }
    return findPackageMetadataFilenameImpl(fs, parts.slice(0, -1), clue);
  }
}

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

function testPattern(pattern, string) {
  if (pattern instanceof RegExp) {
    return pattern.exec(string);
  } else if (pattern) {
    return pattern.match(string);
  } else {
    return false;
  }
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
    this._packageMetadatFilenameByDirectory = {};
    this._loadersByResource = {};
  }

  apply(compiler) {
    compiler.plugin('normal-module-factory', factory =>
      factory.plugin('after-resolve', (data, callback) =>
        this.onAfterResolve(compiler, factory, data, callback)));
  }

  @nodeCallbackAdapter
  async onAfterResolve(compiler, factory, data) {
    if (this._loadersByResource[data.resource] !== undefined) {
      return {
        ...data,
        loaders: data.loaders.concat(this._loadersByResource[data.resource])
      };
    }
    log(`processing ${data.resource} resource`);
    let resolveLoader = Promise.promisify(compiler.resolvers.loader.resolve);
    let fs = compiler.inputFileSystem;
    let {packageData, packageDirname} = await this.findPackageForResource(fs, data.resource);
    if (!packageData) {
      return data;
    }
    let loaders = getByKeyPath(packageData, this.options.loadersKeyPath)
    if (!loaders) {
      loaders = [];
    }
    let resourceRelative = path.relative(packageDirname, data.resource);
    loaders = loaders
      .concat(this.options.injectLoaders(packageData, packageDirname, data.resource))
      .filter(loader =>
        (testPattern(loader.test, resourceRelative) ||
         testPattern(loader.include, resourceRelative)) &&
        !testPattern(loader.exclude, resourceRelative))
      .map(loader => resolveLoader(path.dirname(data.resource), loader.loader));
    loaders = await Promise.all(loaders);
    this._loadersByResource[data.resource] = loaders;
    log(`adding ${loaders} loaders for ${resourceRelative} resource`);
    return {
      ...data,
      loaders: data.loaders.concat(loaders)
    };
  }

  /**
   * Find a package metadata for a specified resource.
   */
  async findPackageForResource(fs, resource) {
    let dirname = path.dirname(resource);
    if (this._packageMetadatFilenameByDirectory[dirname] === undefined) {
      log(`finding package directory for ${dirname}`);
      this._packageMetadatFilenameByDirectory[dirname] = findPackageMetadataFilename(fs, dirname, this.options.packageMeta);
    }
    let {dirname: packageDirname, filename: packageMeta} = await this._packageMetadatFilenameByDirectory[dirname];
    if (!packageDirname) {
      log(`no package metadata found for ${resource} resource`);
      return {packageData: null, packageDirname};
    }
    if (this._packagesByDirectory[packageDirname] === undefined) {
      this._packagesByDirectory[packageDirname] = Promise.try(async () => {
        log(`reading package data for ${packageDirname}`);
        let packageSource = await readFilePromise(fs, packageMeta, 'utf8');
        return parsePackageData(packageSource, this.options.loadersKeyPath);
      });
    }
    let packageData = await this._packagesByDirectory[packageDirname];
    return {packageData, packageDirname};
  }
}
