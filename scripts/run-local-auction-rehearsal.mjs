import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const { fetch, AbortSignal } = globalThis;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();

function start(args, options = {}) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', ...options });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function run(args, options) {
  const child = start(args, options);
  await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? done()
        : reject(new Error(`Local rehearsal subprocess failed (${signal ?? code})`)),
    );
  });
}

async function portAvailable(port) {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
}

async function freezeArtifacts(contractRoot, destination) {
  const from = process.env.ART_AUCTION_ARTIFACT_ROOT ?? contractRoot;
  for (const entry of ['artifacts/production', 'cache/production'])
    await cp(resolve(from, entry), resolve(destination, entry), { recursive: true });
  const names = [
    ['production/CosmicSignatureArtAuction.sol', 'CosmicSignatureArtAuction'],
    ['production/CosmicSignatureGameV4.sol', 'CosmicSignatureGameV4'],
    ['production/CosmicSignatureNft.sol', 'CosmicSignatureNft'],
  ];
  const evidence = [];
  const checkedBuilds = new Map();
  for (const [source, name] of names) {
    const path = resolve(destination, 'artifacts/production/contracts', source, `${name}.json`);
    const bytes = await readFile(path);
    const artifact = JSON.parse(bytes.toString('utf8'));
    const debug = JSON.parse(await readFile(path.replace(/\.json$/, '.dbg.json'), 'utf8'));
    const buildPath = resolve(dirname(path), debug.buildInfo);
    const buildBytes = await readFile(buildPath);
    const build = JSON.parse(buildBytes.toString('utf8'));
    assert.equal(
      build.solcVersion,
      '0.8.38',
      'Compile the approved V4 candidate before rehearsing',
    );
    assert.equal(build.input.settings.viaIR, true);
    assert.equal(build.input.settings.optimizer.runs, 400);
    if (!checkedBuilds.has(buildPath)) {
      for (const [sourceName, input] of Object.entries(build.input.sources)) {
        const sourcePath = sourceName.startsWith('contracts/')
          ? resolve(contractRoot, sourceName)
          : resolve(contractRoot, 'node_modules', sourceName);
        assert.equal(
          input.content,
          await readFile(sourcePath, 'utf8'),
          `Compiled input differs from source: ${sourceName}`,
        );
      }
      checkedBuilds.set(buildPath, createHash('sha256').update(buildBytes).digest('hex'));
    }
    const compiled = build.output.contracts[`contracts/${source}`][name];
    assert.equal(
      artifact.bytecode,
      `0x${compiled.evm.bytecode.object}`,
      'Artifact creation code differs from its compiler output',
    );
    assert.equal(
      artifact.deployedBytecode,
      `0x${compiled.evm.deployedBytecode.object}`,
      'Artifact runtime differs from its compiler output',
    );
    evidence.push({
      name,
      compiler: build.solcLongVersion,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      buildInfoSha256: checkedBuilds.get(buildPath),
      checkedSourceInputs: Object.keys(build.input.sources).length,
    });
  }
  await writeFile(
    resolve(destination, 'artifact-provenance.json'),
    JSON.stringify(evidence, null, 2),
  );
}

async function stopChildren() {
  const running = [...children];
  for (const child of running) child.kill('SIGTERM');
  await Promise.all(
    running.map(async (child) => {
      for (
        let attempt = 0;
        child.exitCode === null && child.signalCode === null && attempt < 30;
        attempt++
      )
        await delay(100);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }),
  );
}

async function main() {
  const contractRoot = resolve(
    process.env.ART_AUCTION_CONTRACT_ROOT ?? resolve(root, '../Cosmic-Signature'),
  );
  await Promise.all([portAvailable(8548), portAvailable(4321)]);
  const directory = await mkdtemp(resolve(tmpdir(), 'cosmic-real-auction-'));
  process.stdout.write(`Local rehearsal evidence: ${directory}\n`);
  await freezeArtifacts(contractRoot, directory);
  const configPath = resolve(directory, 'hardhat.config.cjs');
  await writeFile(
    configPath,
    `const config = require(${JSON.stringify(resolve(contractRoot, 'hardhat.config.js'))});
config.paths.root = ${JSON.stringify(contractRoot)};
config.paths.artifacts = ${JSON.stringify(resolve(directory, 'artifacts/production'))};
config.paths.cache = ${JSON.stringify(resolve(directory, 'cache/production'))};
config.networks.hardhat.loggingEnabled = false;
config.networks.hardhat_on_localhost = { url: 'http://127.0.0.1:8548', chainId: 31337, gas: 30000000, initialDate: config.networks.hardhat.initialDate, timeout: 30000 };
module.exports = config;
`,
  );
  const env = {
    ...process.env,
    HARDHAT_CONFIG: configPath,
    HARDHAT_MODE_CODE: '1',
    LONG_TEST_MODE_CODE: '1',
    ENABLE_HARDHAT_PREPROCESSOR: 'false',
    ART_AUCTION_CONTRACT_ROOT: contractRoot,
    ART_AUCTION_REHEARSAL_FILE: resolve(directory, 'fixture.json'),
  };
  // Never inherit a fork or a named public network from the invoking shell.
  delete env.RUN_V4_FORK_REHEARSAL;
  delete env.ART_AUCTION_RPC_URL;
  const log = createWriteStream(resolve(directory, 'hardhat-node.log'));
  const node = start(
    [
      resolve(contractRoot, 'node_modules/hardhat/internal/cli/cli.js'),
      '--config',
      configPath,
      'node',
      '--hostname',
      '127.0.0.1',
      '--port',
      '8548',
    ],
    {
      cwd: contractRoot,
      env: { ...env, HARDHAT_NETWORK: 'hardhat' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  node.stdout.pipe(log);
  node.stderr.pipe(log);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (node.exitCode !== null)
        throw new Error('Owned Hardhat node exited; inspect its local log');
      try {
        const response = await fetch('http://127.0.0.1:8548', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
          signal: AbortSignal.timeout(500),
          redirect: 'error',
        });
        assert.equal((await response.json()).result, '0x7a69');
        ready = true;
        break;
      } catch {
        await delay(100);
      }
    }
    assert(ready, 'Owned loopback node did not start');
    await run(
      [
        resolve(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        'src/lib/auction/client.integration.test.ts',
      ],
      {
        env: {
          ...env,
          ART_AUCTION_REHEARSAL_RPC: 'http://127.0.0.1:8548',
          ART_AUCTION_CONTRACT_ROOT: directory,
        },
      },
    );
    await run([resolve(root, 'tests/real-auction/seed-contracts.mjs')], {
      env: { ...env, HARDHAT_NETWORK: 'hardhat_on_localhost' },
    });
    await run(
      [
        resolve(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        'tests/real-auction/playwright.config.ts',
        ...process.argv.slice(2),
      ],
      { env },
    );
  } finally {
    await stopChildren();
    log.end();
  }
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stopChildren().finally(() => process.exit(1));
  });
await main();
