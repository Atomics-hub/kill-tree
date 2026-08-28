import type { ProcessRecord } from './types.js';

export function descendantsLeafFirst(
  processes: Map<number, ProcessRecord>,
  rootPid: number,
  includeRoot = true,
): number[] {
  if (!processes.has(rootPid)) return [];

  const children = new Map<number, number[]>();
  for (const process of processes.values()) {
    const siblings = children.get(process.ppid);
    if (siblings) siblings.push(process.pid);
    else children.set(process.ppid, [process.pid]);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a - b);

  const result: number[] = [];
  const visited = new Set<number>();
  const visiting = new Set<number>();

  const visit = (pid: number): void => {
    if (visited.has(pid) || visiting.has(pid)) return;
    visiting.add(pid);
    for (const child of children.get(pid) ?? []) {
      if (child !== pid) visit(child);
    }
    visiting.delete(pid);
    visited.add(pid);
    if (includeRoot || pid !== rootPid) result.push(pid);
  };

  visit(rootPid);
  return result;
}

export function assertTargetPid(pid: number, allowPid1 = false): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new TypeError('pid must be a positive safe integer');
  }
  if (pid === 1 && !allowPid1) {
    throw new RangeError('refusing to target PID 1 without allowPid1: true');
  }
}
