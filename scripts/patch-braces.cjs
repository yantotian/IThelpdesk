'use strict';
/**
 * Mitigation for CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm:
 * `braces@3.0.3` (transitive via tailwindcss -> chokidar/micromatch) bounds
 * input *length* (MAX_LENGTH=10000) but not brace *nesting depth*. Its
 * recursive AST walkers (lib/compile.js, lib/expand.js, lib/stringify.js)
 * use one stack frame per nesting level, so a short deeply-nested pattern
 * can throw an uncaught RangeError and kill the Node process.
 *
 * Upstream has no fixed release (3.0.3 is latest), so this postinstall script
 * idempotently injects depth guards into the installed copy of braces:
 *
 *   1. lib/parse.js  — reject patterns nesting deeper than `maxDepth`
 *      (default 100) at parse time, before any recursive walk runs.
 *   2. lib/compile.js, lib/expand.js, lib/stringify.js — defense-in-depth
 *      recursion counters that throw a catchable RangeError instead of
 *      overflowing the call stack, even for programmatically-built ASTs.
 *
 * Legitimate globs (tailwind content patterns, chokidar watch paths) nest
 * only a few levels deep, so a default of 100 is generous. Callers that need
 * more can pass `{ maxDepth: N }`.
 *
 * NOTE: `npm audit` is version-based and will keep flagging braces@3.0.3
 * even after this patch. That residual finding is expected; exploitability
 * in this repo is nil (see below) and this script is the compensating
 * control:
 *   - braces is build-time only (tailwindcss/chokidar/micromatch globbing);
 *     no server route or frontend code passes untrusted input to it
 *     (server search uses SQL, file paths are validated + signed).
 *
 * Run: `node scripts/patch-braces.cjs` (also wired to `postinstall`).
 */

const fs = require('fs');
const path = require('path');

const MAX_DEPTH_DEFAULT = 100;
const MARKER = '// __CVE-2026-93687_DEPTH_GUARD__';

function bracesRoot() {
  // Resolve from this script location so `npm install` / `npm ci` both work.
  const direct = path.join(__dirname, '..', 'node_modules', 'braces');
  if (fs.existsSync(direct)) return direct;
  try {
    return path.dirname(require.resolve('braces/package.json'));
  } catch {
    return direct;
  }
}

function patchFile(file, patchFn) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-braces] skip (missing): ${file}`);
    return false;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) {
    console.log(`[patch-braces] already patched: ${path.basename(file)}`);
    return false;
  }
  const next = patchFn(src);
  if (!next || next === src || !next.includes(MARKER)) {
    throw new Error(`[patch-braces] patch failed for ${file}: anchor not found`);
  }
  fs.writeFileSync(file, next);
  console.log(`[patch-braces] patched: ${path.basename(file)}`);
  return true;
}

function patchParse(src) {
  const anchor =
    "  const opts = options || {};\n  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;";
  const replacement =
    "  const opts = options || {};\n" +
    `  ${MARKER}\n` +
    "  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : " + MAX_DEPTH_DEFAULT + ';\n' +
    "  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;";
  if (!src.includes(anchor)) return src;

  let next = src.replace(anchor, replacement);

  const depthAnchor = '    if (value === CHAR_LEFT_CURLY_BRACE) {\n      depth++;';
  const depthReplacement =
    '    if (value === CHAR_LEFT_CURLY_BRACE) {\n' +
    '      depth++;\n' +
    `      if (depth > maxDepth) throw new SyntaxError(\`Input nesting depth (\${depth}) exceeds max depth (\${maxDepth})\`);`;
  if (!next.includes(depthAnchor)) return src;
  next = next.replace(depthAnchor, depthReplacement);
  return next;
}

function patchCompile(src) {
  const anchor = 'const compile = (ast, options = {}) => {\n  const walk = (node, parent = {}) => {';
  const replacement =
    'const compile = (ast, options = {}) => {\n' +
    `  ${MARKER}\n` +
    '  const maxDepth = typeof options.maxDepth === \'number\' ? options.maxDepth : ' + MAX_DEPTH_DEFAULT + ';\n' +
    '  const walk = (node, parent = {}, depth = 0) => {\n' +
    "    if (depth > maxDepth) throw new RangeError(`Braces nesting depth (${depth}) exceeds max depth (${maxDepth}). Use options.maxDepth to increase the limit.`);";
  if (!src.includes(anchor)) return src;
  let next = src.replace(anchor, replacement);
  const callAnchor = '        output += walk(child, node);';
  if (!next.includes(callAnchor)) return src;
  next = next.replace(callAnchor, '        output += walk(child, node, depth + 1);');
  return next;
}

function patchExpand(src) {
  const anchor = '  const rangeLimit = options.rangeLimit === undefined ? 1000 : options.rangeLimit;';
  const replacement =
    `  ${MARKER}\n` +
    '  const maxDepth = typeof options.maxDepth === \'number\' ? options.maxDepth : ' + MAX_DEPTH_DEFAULT + ';\n' +
    '  const rangeLimit = options.rangeLimit === undefined ? 1000 : options.rangeLimit;';
  if (!src.includes(anchor)) return src;
  let next = src.replace(anchor, replacement);

  const walkAnchor = '  const walk = (node, parent = {}) => {';
  const walkReplacement =
    '  const walk = (node, parent = {}, depth = 0) => {\n' +
    "    if (depth > maxDepth) throw new RangeError(`Braces nesting depth (${depth}) exceeds max depth (${maxDepth}). Use options.maxDepth to increase the limit.`);";
  if (!next.includes(walkAnchor)) return src;
  next = next.replace(walkAnchor, walkReplacement);

  const recAnchor = '        walk(child, node);';
  if (!next.includes(recAnchor)) return src;
  next = next.replace(recAnchor, '        walk(child, node, depth + 1);');
  return next;
}

function patchStringify(src) {
  const anchor = '  const stringify = (node, parent = {}) => {';
  const replacement =
    `  ${MARKER}\n` +
    '  const maxDepth = typeof options.maxDepth === \'number\' ? options.maxDepth : ' + MAX_DEPTH_DEFAULT + ';\n' +
    '  const stringify = (node, parent = {}, depth = 0) => {\n' +
    "    if (depth > maxDepth) throw new RangeError(`Braces nesting depth (${depth}) exceeds max depth (${maxDepth}). Use options.maxDepth to increase the limit.`);";
  if (!src.includes(anchor)) return src;
  let next = src.replace(anchor, replacement);
  const callAnchor = '        output += stringify(child);';
  if (!next.includes(callAnchor)) return src;
  next = next.replace(callAnchor, '        output += stringify(child, parent, depth + 1);');
  return next;
}

function main() {
  const root = bracesRoot();
  const lib = path.join(root, 'lib');
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    console.log('[patch-braces] braces not installed, nothing to do.');
    return;
  }
  patchFile(path.join(lib, 'parse.js'), patchParse);
  patchFile(path.join(lib, 'compile.js'), patchCompile);
  patchFile(path.join(lib, 'expand.js'), patchExpand);
  patchFile(path.join(lib, 'stringify.js'), patchStringify);

  // Self-test: normal patterns keep working, deep nesting is rejected fast
  // with a catchable error instead of a stack overflow.
  const braces = require(path.join(root));
  const assert = require('assert');
  assert.deepStrictEqual(braces.expand('{a,b,c}'), ['a', 'b', 'c']);
  assert.ok(String(braces.compile('a/{b,c}/d')).includes('a/'));
  let blocked = false;
  try {
    braces('{'.repeat(500) + 'a' + '}'.repeat(500));
  } catch (err) {
    blocked = err instanceof SyntaxError || err instanceof RangeError;
  }
  if (!blocked) throw new Error('[patch-braces] self-test FAILED: deep pattern was not rejected');
  console.log('[patch-braces] self-test OK: normal patterns work, depth>100 rejected.');
}

main();
