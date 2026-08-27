import process from 'node:process';

const exitCode = Number(process.argv[2] ?? '0');

process.stdout.write(`fixture-exit:${exitCode}\n`);
process.exitCode = exitCode;
