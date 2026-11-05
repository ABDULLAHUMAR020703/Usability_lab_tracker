// Development mode: backend with auto-restart (port 4000) + Vite dev server with hot reload (port 5173).
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const run = (cmd, args, cwd) => spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
const api = run(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch', 'backend/server.js'], root);
const ui = run('npm', ['run', 'dev'], path.join(root, 'frontend'));
const stop = () => { api.kill(); ui.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('\nDev mode: open http://localhost:5173 (API on http://127.0.0.1:4000)\n');
