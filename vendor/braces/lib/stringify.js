'use strict';

const utils = require('./utils');

module.exports = (ast, options = {}) => {
  // __CVE-2026-93687_DEPTH_GUARD__
  const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 100;
  const stringify = (node, parent = {}, depth = 0) => {
    if (depth > maxDepth) throw new RangeError(`Braces nesting depth (${depth}) exceeds max depth (${maxDepth}). Use options.maxDepth to increase the limit.`);
    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';

    if (node.value) {
      if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
        return '\\' + node.value;
      }
      return node.value;
    }

    if (node.value) {
      return node.value;
    }

    if (node.nodes) {
      for (const child of node.nodes) {
        output += stringify(child, parent, depth + 1);
      }
    }
    return output;
  };

  return stringify(ast);
};

