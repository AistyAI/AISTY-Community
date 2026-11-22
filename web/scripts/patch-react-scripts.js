// Makes react-scripts 5.0.1 work with webpack-dev-server 5.
'use strict';

const fs = require('fs');
const path = require('path');

let warned = false;

function patch(file, edits) {
  const target = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(target)) {
    warn(`${file} not found - skipping.`);
    return;
  }
  let source = fs.readFileSync(target, 'utf8');
  let changed = false;

  for (const [find, replace, marker] of edits) {
    if (source.includes(marker)) continue; // already patched
    if (!source.includes(find)) {
      warn(`${file}: expected snippet not found, skipping one edit.`);
      continue;
    }
    source = source.replace(find, replace);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(target, source);
    console.log(`patch-react-scripts: patched ${file}`);
  }
}

function warn(message) {
  warned = true;
  console.warn(`patch-react-scripts: ${message}`);
}

// 1.
patch('node_modules/react-scripts/config/webpackDevServer.config.js', [
  [
    '    https: getHttpsConfig(),\n',
    `    // WDS5: \`https\` became \`server\`.
    server: (() => {
      const httpsConfig = getHttpsConfig();
      if (!httpsConfig) return { type: 'http' };
      return {
        type: 'https',
        options: typeof httpsConfig === 'object' ? httpsConfig : undefined,
      };
    })(),\n`,
    'WDS5: `https` became `server`.',
  ],
  [
    `    // \`proxy\` is run between \`before\` and \`after\` \`webpack-dev-server\` hooks
    proxy,`,
    `    // WDS5: an explicit \`undefined\` fails schema validation, and proxy
    // entries now use the http-proxy-middleware v3 option names.
    ...(proxy ? { proxy: proxy.map(normalizeProxyEntry) } : {}),`,
    'WDS5: an explicit `undefined` fails schema validation',
  ],
  [
    `    onBeforeSetupMiddleware(devServer) {
      // Keep \`evalSourceMapMiddleware\`
      // middlewares before \`redirectServedPath\` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }
    },
    onAfterSetupMiddleware(devServer) {
      // Redirect to \`PUBLIC_URL\` or \`homepage\` from \`package.json\` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op' that will reset any
      // previous service worker registered for the same host:port combination.
      // We do this in development to avoid hitting the production cache if
      // it used the same host and port.
      // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));
    },`,
    `    // WDS5: the before/after middleware hooks collapsed into setupMiddlewares.
    setupMiddlewares(middlewares, devServer) {
      // Keep \`evalSourceMapMiddleware\`
      // middlewares before \`redirectServedPath\` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      middlewares.unshift(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }

      // Redirect to \`PUBLIC_URL\` or \`homepage\` from \`package.json\` if url not match
      middlewares.push(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op' that will reset any
      // previous service worker registered for the same host:port combination.
      // We do this in development to avoid hitting the production cache if
      // it used the same host and port.
      // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
      middlewares.push(noopServiceWorkerMiddleware(paths.publicUrlOrPath));

      return middlewares;
    },`,
    'WDS5: the before/after middleware hooks collapsed into setupMiddlewares.',
  ],
  [
    `module.exports = function (proxy, allowedHost) {`,
    `// http-proxy-middleware v3 renamed \`context\` to \`pathFilter\`, moved the
// event handlers under \`on\`, and dropped \`logLevel\`. react-dev-utils still
// emits the v2 shape for the \`proxy\` field in package.json.
function normalizeProxyEntry(entry) {
  const { context, logLevel, onProxyReq, onProxyRes, onError, ...rest } = entry;
  const on = {};
  if (onProxyReq) on.proxyReq = onProxyReq;
  if (onProxyRes) on.proxyRes = onProxyRes;
  if (onError) on.error = onError;
  return {
    ...rest,
    ...(context ? { pathFilter: context } : {}),
    ...(Object.keys(on).length ? { on } : {}),
  };
}

module.exports = function (proxy, allowedHost) {`,
    'function normalizeProxyEntry(entry) {',
  ],
]);

// 2. WDS5 removed `Server#close()` in favour of `stopCallback()`.
patch('node_modules/react-scripts/scripts/start.js', [
  [
    `      process.on(sig, function () {
        devServer.close();
        process.exit();
      });`,
    `      process.on(sig, function () {
        // WDS5: \`close\` was replaced by \`stopCallback\`.
        devServer.stopCallback(() => process.exit());
      });`,
    'WDS5: `close` was replaced by `stopCallback`.',
  ],
  [
    `      process.stdin.on('end', function () {
        devServer.close();
        process.exit();
      });`,
    `      process.stdin.on('end', function () {
        devServer.stopCallback(() => process.exit());
      });`,
    "process.stdin.on('end', function () {\n        devServer.stopCallback",
  ],
]);

// 3.
patch('node_modules/react-dev-utils/evalSourceMapMiddleware.js', [
  [
    'function getSourceById(server, id) {\n  const module = Array.from(server._stats.compilation.modules)',
    'function getSourceById(server, id) {\n  // WDS5 renamed `_stats` to `stats`.\n  const stats = server._stats || server.stats;\n  const module = Array.from(stats.compilation.modules)',
    'WDS5 renamed `_stats` to `stats`.',
  ],
  [
    '      if (!id || !server._stats) {',
    '      if (!id || !(server._stats || server.stats)) {',
    '!(server._stats || server.stats)',
  ],
  [
    '    (m) => server._stats.compilation.chunkGraph.getModuleId(m) == id,',
    '    (m) => stats.compilation.chunkGraph.getModuleId(m) == id,',
    '(m) => stats.compilation.chunkGraph.getModuleId(m) == id,',
  ],
]);

if (warned) {
  console.warn(
    'patch-react-scripts: some patches did not apply. If `npm start` fails, ' +
      'check scripts/patch-react-scripts.js against the installed react-scripts.'
  );
}
