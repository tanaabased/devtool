const signal = process.argv[2];
if (signal === 'terminate') {
  process.kill(process.pid, 'SIGTERM');
} else if (signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGHUP') {
  process.on(signal, () => {
    process.stdout.write(`received-${signal}\n`, () => process.exit(42));
  });
  setTimeout(() => process.exit(90), 5000);
  process.stdout.write('ready\n');
} else {
  throw new Error('Expected a signal probe mode');
}

export {};
