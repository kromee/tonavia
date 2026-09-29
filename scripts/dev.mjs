import { spawn } from 'node:child_process';

const api = spawn(process.execPath, ['scripts/dev-api.mjs'], { stdio: 'inherit' });
const ng = spawn('npx', ['ng', 'serve', '--proxy-config', 'proxy.conf.json'], {
  stdio: 'inherit',
  shell: true
});

const stop = () => {
  api.kill();
  ng.kill();
  process.exit();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
