import { spawn } from 'node:child_process';
import net from 'node:net';

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (await isListening(3000)) {
  console.log('[NCM] API already running on http://localhost:3000');
  setInterval(() => {}, 3600_000);
} else {
  const child = spawn('pnpm', ['--filter', '@claudio/server', 'exec', 'NeteaseCloudMusicApi'], {
    shell: true,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
