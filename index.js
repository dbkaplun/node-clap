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
  var sources = (opts.paths || []).map(function (path) {
    return fs.readdirAsync(path).map(function (file) {
      return path.join(path, file);
    });
  });
  if (opts.keyword) {
    var mod = opts.module || require.main;
    sources.push(clap.lsGlobalPkgs().then(function (globalPkgs) {
      var pkgs = globalPkgs;
      if (mod) pkgs = pkgs.concat(Object
        .keys(mod.require('./package').dependencies || {})
        .map(function (dep) { return mod.require(dep+'/package'); }));
      return pkgs.reduce(function (pkgs, pkg) {
        if ((pkg.keywords || []).indexOf(opts.keyword) !== -1) pkgs.push(pkg.name);
        return pkgs;
      }, []);
    }));
  }
  return Promise.reduce(sources, function (results, plugins) {
    return results.concat(plugins);
  }, []);
});

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
