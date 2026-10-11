'use strict';

const fill = require('fill-range');
const utils = require('./utils');

const compile = (ast, options = {}) => {
  // __CVE-2026-93687_DEPTH_GUARD__
  const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 100;
  const walk = (node, parent = {}, depth = 0) => {
    if (depth > maxDepth) throw new RangeError(`Braces nesting depth (${depth}) exceeds max depth (${maxDepth}). Use options.maxDepth to increase the limit.`);
    const invalidBlock = utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    const invalid = invalidBlock === true || invalidNode === true;
    const prefix = options.escapeInvalid === true ? '\\' : '';
    let output = '';

    if (node.isOpen === true) {
      return prefix + node.value;
    }

    if (node.isClose === true) {
      console.log('node.isClose', prefix, node.value);
      return prefix + node.value;
    }

    if (node.type === 'open') {
      return invalid ? prefix + node.value : '(';
    }

    if (node.type === 'close') {
      return invalid ? prefix + node.value : ')';
    }

    if (node.type === 'comma') {
      return node.prev.type === 'comma' ? '' : invalid ? node.value : '|';
    }

    if (node.value) {
      return node.value;
    }

    if (node.nodes && node.ranges > 0) {
      const args = utils.reduce(node.nodes);
      const range = fill(...args, { ...options, wrap: false, toRegex: true, strictZeros: true });

      if (range.length !== 0) {
        return args.length > 1 && range.length > 1 ? `(${range})` : range;
      }
    }

    if (node.nodes) {
      for (const child of node.nodes) {
        output += walk(child, node, depth + 1);
      }
    }

    return output;
  };

  return walk(ast);
};

module.exports = compile;
