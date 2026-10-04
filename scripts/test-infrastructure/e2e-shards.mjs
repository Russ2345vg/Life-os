import { join } from 'node:path';

export function planE2eRun(arguments_) {
  const shardArguments = arguments_.filter((argument) => argument.startsWith('--shard'));
  if (shardArguments.length === 0) return { port: 4173, shardIndex: null };
  if (shardArguments.length !== 1 || !/^--shard=[12]\/2$/.test(shardArguments[0]))
    throw new Error('Managed E2E supports exactly two shards: --shard=1/2 or --shard=2/2.');
  const shardIndex = Number(shardArguments[0][8]);
  return { port: 4172 + shardIndex, shardIndex };
}

export function buildShardPlans(runDirectory, arguments_) {
  if (arguments_.includes('--list'))
    throw new Error('Use npm run test:e2e:list; Playwright does not shard its --list output.');
  if (arguments_.some((argument) => argument.startsWith('--shard')))
    throw new Error('The sharded runner selects both shards; remove the shard option.');
  return [1, 2].map((index) => ({
    index,
    port: 4172 + index,
    args: [`--shard=${index}/2`, ...arguments_],
    blobOutputFile: join(runDirectory, `shard-${index}.zip`),
  }));
}
