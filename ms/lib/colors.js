const { green, red, yellow, dim, cyan } = require('colorette');

function stripAnsi(str) {
  return (str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = {
  green,
  red,
  yellow,
  dim,
  cyan,
  stripAnsi
};
