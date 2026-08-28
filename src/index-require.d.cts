import type legacyTreeKill from './index.js';
import type {
  signalTree,
  spawnGuarded,
  terminateTree,
} from './index.js';

declare const kill: typeof legacyTreeKill & {
  default: typeof legacyTreeKill;
  legacyTreeKill: typeof legacyTreeKill;
  signalTree: typeof signalTree;
  spawnGuarded: typeof spawnGuarded;
  terminateTree: typeof terminateTree;
};

export = kill;
