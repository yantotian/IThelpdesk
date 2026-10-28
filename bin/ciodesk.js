#!/usr/bin/env node
/**
 * ciodesk CLI — IT Helpdesk admin dashboard
 *
 * Install:
 *   npm install -g ciodesk-react-admin
 *   ciodesk start
 *
 * Or run without installing:
 *   npx ciodesk-react-admin start
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const binDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(binDir, '..');
const pkg = require(path.join(rootDir, 'package.json'));

const VERSION = pkg.version || '0.0.1';
const PKG_NAME = pkg.name || 'ciodesk-react-admin';

const serverDir = path.join(rootDir, 'server');
const frontendDist = path.join(rootDir, 'dist');
const serverDist = path.join(serverDir, 'dist');

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(msg);
}

function fatal(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function runSync(cmd, args, opts = {}) {
  const options = { stdio: 'inherit', cwd: rootDir, ...opts };
  const command = [cmd, ...args].join(' ');
  try {
    execSync(command, options);
  } catch (err) {
    fatal(`Command failed: ${command}`, err.status || 1);
  }
}

function spawnCmd(cmd, args, opts = {}) {
  const options = { stdio: 'inherit', cwd: rootDir, ...opts };
  if (process.platform === 'win32') {
    return spawn('powershell.exe', ['-Command', `${cmd} ${args.join(' ')}`], options);
  }
  return spawn(cmd, args, options);
}

function showHelp() {
  const help = `
Usage: ciodesk <command> [options]

IT Helpdesk admin dashboard CLI

Commands:
  start      Build (if needed) and start the production server (API + SPA)
  dev        Run Vite dev server + API with hot reload
  build      Build frontend (vite) and server (tsc)
  db:init    Initialize PostgreSQL schema and seed admin user
  update     Check for a newer version on npm and show the upgrade command
  --version  Show the installed version
  --help     Show this help message

Examples:
  ciodesk start        # Start production server
  ciodesk dev          # Start development servers
  ciodesk update       # Check for updates
`;
  console.log(help);
}

async function isDistBuilt() {
  return (
    fs.existsSync(path.join(frontendDist, 'index.html')) &&
    fs.existsSync(path.join(serverDist, 'index.js'))
  );
}

async function build() {
  log('Building frontend...');
  runSync('npm', ['run', 'build']);
  log('Building server...');
  runSync('npm', ['run', 'server:build']);
  log('Build complete.');
}

async function start() {
  const built = await isDistBuilt();
  if (!built) {
    warn('Frontend or server build not found. Building now...');
    await build();
  }

  log('Starting production server...');
  const serverProc = spawnCmd('node', [path.join(serverDist, 'index.js')], {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  });

  serverProc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.exit(code || 1);
    }
  });

  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, () => {
      serverProc.kill(sig);
    });
  });
}

async function dev() {
  log('Starting development servers...');

  const vite = spawnCmd('npx', ['vite']);
  const server = spawnCmd('npm', ['run', 'server:dev']);

  let exited = false;
  const onExit = (code) => {
    if (!exited && code !== null && code !== 0) {
      exited = true;
      vite.kill();
      server.kill();
      process.exit(code || 1);
    }
  };

  vite.on('exit', onExit);
  server.on('exit', onExit);

  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, () => {
      vite.kill(sig);
      server.kill(sig);
      process.exit(0);
    });
  });
}

async function dbInit() {
  log('Initializing database...');
  runSync('npm', ['run', 'db:init']);
  log('Database initialized.');
}

async function checkUpdate() {
  log(`Checking for updates to ${PKG_NAME} (current: v${VERSION})...`);
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`);
    if (!res.ok) {
      throw new Error(`registry responded ${res.status}`);
    }
    const data = await res.json();
    const latestVersion = data.version || '';

    if (!latestVersion || latestVersion === VERSION) {
      log(`${PKG_NAME} is up to date (v${VERSION}).`);
      return;
    }

    const parse = (v) => v.split('.').map(Number);
    const [curMajor, curMinor, curPatch] = parse(VERSION);
    const [latMajor, latMinor, latPatch] = parse(latestVersion);

    const isNewer =
      latMajor > curMajor ||
      (latMajor === curMajor && latMinor > curMinor) ||
      (latMajor === curMajor && latMinor === curMinor && latPatch > curPatch);

    if (isNewer) {
      log(`Update available: v${VERSION} → v${latestVersion}`);
      log('');
      log('To upgrade, run:');
      log(`  npm install -g ${PKG_NAME}@latest`);
      log(`  # or`);
      log(`  npx ${PKG_NAME}@latest`);
    } else {
      log(`${PKG_NAME} is up to date (v${VERSION}).`);
    }
  } catch (err) {
    warn('Could not check for updates (network or registry unavailable).');
    warn(err.message);
  }
}

const cmd = process.argv[2];

switch (cmd) {
  case 'start':
    start();
    break;
  case 'dev':
    dev();
    break;
  case 'build':
    build();
    break;
  case 'db:init':
    dbInit();
    break;
  case 'update':
    checkUpdate();
    break;
  case '--version':
  case '-v':
    log(VERSION);
    break;
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    fatal(`Unknown command: ${cmd}\nRun 'ciodesk --help' for usage.`);
}
