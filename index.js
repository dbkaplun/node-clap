var path = require('path');
var Promise = require('bluebird');
var npm = require('npm');
var fs = Promise.promisifyAll(require('fs'));

function clap () { return clap.load.apply(null, arguments); }

clap.load = Promise.method(function (val, opts) {
  if (arguments.length === 1) { opts = val; val = opts.val; }

  return clap.resolve(opts).map(function (plugin) {
    return {
      plugin: plugin,
      promise: Promise.method(function () { return opts.module.require(plugin)(val); })()
    };
  });
});

clap.resolve = Promise.method(function (opts) {
  var sources = (opts.paths || []).map(function (optPath) {
    return fs.readdirAsync(optPath)
      .catch(function () { return []; })
      .map(function (file) { return path.join(optPath, file); });
  });
  if (opts.keyword) {
    var mod = opts.module || require.main;
    var packageJSON = opts.package || mod.filename;
    if (typeof packageJSON === 'string') packageJSON = clap.resolvePackageJSON(mod, packageJSON);
    if (typeof packageJSON !== 'object') throw new Error("couldn't resolve package.json");
    sources.push(clap.lsGlobalPkgs().then(function (globalPkgs) {
      var pkgs = globalPkgs;
      if (mod) pkgs = pkgs.concat(Object
        .keys(packageJSON.dependencies || {})
        .map(function (dep) { return mod.require(dep+'/package'); }));

      var matchingPkgs = pkgs.reduce(function (matchingPkgs, pkg) {
        if ((pkg.keywords || []).indexOf(opts.keyword) !== -1) matchingPkgs[pkg.name] = pkg;
        return matchingPkgs;
      }, {});
      return Object.keys(matchingPkgs).map(function (pkgName) {
        var pkg = matchingPkgs[pkgName];
        return pkg.realPath || pkg.name;
      });
    }));
  }
  return Promise.reduce(sources, function (results, plugins) {
    return results.concat(plugins);
  }, []);
});

clap.resolvePackageJSON = function (mod, packageJSONPath) {
  if (!packageJSONPath) packageJSONPath = mod.filename;
  do {
    try {
      var packageJSON = mod.require(path.join(packageJSONPath, 'package.json'));
    } catch (e) {}
    var lastPackageJSONPath = packageJSONPath;
    packageJSONPath = path.dirname(packageJSONPath);
  } while (!packageJSON && lastPackageJSONPath !== packageJSONPath);
  return packageJSON;
};
clap.lsGlobalPkgs = Promise.method(function () {
  return clap._lsGlobalPkgs = clap._lsGlobalPkgs || clap.loadNpmGlobal()
    .then(function () { return Promise.promisify(npm.commands.ls, npm)([], true); })
    .spread(function (ls) {
      var globalPkgs = ls.dependencies || {};
      return Object.keys(globalPkgs).map(function (globalPkg) { return globalPkgs[globalPkg]; });
    });
});
clap.loadNpmGlobal = Promise.method(function () {
  return clap._loadNpmGlobal = clap._loadNpmGlobal ||
    Promise.promisify(npm.load, npm)({global: true, depth: 1, loglevel: 'silent'});
});

module.exports = clap;
