'use strict';

const api = require('./index.bundle.cjs');
const kill = api.legacyTreeKill;

Object.assign(kill, api);
module.exports = kill;
