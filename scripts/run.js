const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_DIR = path.join(__dirname, '..');
const FRONT_END_DIR = path.join(REPO_DIR, 'front-end');
const BACKEND_DIR = path.join(REPO_DIR, 'backend');
const REMOTE_IP = '209.182.232.165';

// 1. Detect if running on remote host or production environment
let isRemote = process.env.APP_ENV === 'prod';
if (!isRemote) {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.address === REMOTE_IP) {
          isRemote = true;
          break;
        }
      }
    }
  } catch (e) {
    // Ignore interface retrieval error
  }
}

// 2. Select and load the environment file
let envFile = isRemote
  ? path.join(REPO_DIR, '.env.prod')
  : (fs.existsSync(path.join(REPO_DIR, '.env.local'))
      ? path.join(REPO_DIR, '.env.local')
      : path.join(REPO_DIR, '.env'));

console.log(`\x1b[96m[runner] Host: ${isRemote ? 'Remote' : 'Local'} | Env File: ${path.basename(envFile)}\x1b[0m`);

if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      let val = line.substring(idx + 1).trim();
      // Strip outer quotes if they exist
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      // Only set if not already defined (or override if env file has higher priority)
      process.env[key] = val;
    }
  });
}

// 3. Helper to clean port
function killPort(port) {
  if (!port) return;
  console.log(`\x1b[93m[runner] Stopping any running instances on port ${port}...\x1b[0m`);
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', status: true }).trim();
      if (output) {
        const lines = output.split(/\r?\n/);
        const pids = new Set();
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          // Standard netstat output: Proto Local-Address Foreign-Address State PID
          if (parts.length >= 5) {
            const pid = parts[parts.length - 1];
            if (/^\d+$/.test(pid) && pid !== '0') {
              pids.add(pid);
            }
          }
        });
        pids.forEach(pid => {
          try {
            console.log(`[runner] Force killing process ${pid} on Windows...`);
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } catch (e) {}
        });
      }
    } else {
      // Unix: use lsof when available, then fall back to fuser or ss.
      try {
        execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
      } catch (e) {
        try {
          execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
        } catch (fallbackError) {
          try {
            const pids = execSync(`ss -tlnp 2>/dev/null | grep ':${port} ' | grep -oP 'pid=\\K[0-9]+'`, { encoding: 'utf8' })
              .trim()
              .split(/\s+/)
              .filter(Boolean);
            pids.forEach(pid => execSync(`kill -9 ${pid}`, { stdio: 'ignore' }));
          } catch (ssError) {}
        }
      }
    }
  } catch (e) {
    // Port not in use, or utility missing
  }
}

// 4. Run commands
const cmd = process.argv[2];

if (!cmd) {
  console.error('Usage: node scripts/run.js <dev|start|build|lint|api|api:prod>');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const venvBin = isWin ? 'Scripts' : 'bin';

if (cmd === 'dev') {
  const port = process.env.PORT || '3003';
  killPort(port);
  console.log('[runner] Starting Next.js in dev mode...');
  const child = spawn('npm', ['run', 'dev', '--', '--hostname', '0.0.0.0'], {
    cwd: FRONT_END_DIR,
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code || 0));
} 

else if (cmd === 'start') {
  process.env.APP_ENV = 'prod';
  const port = process.env.PORT || '3003';
  killPort(port);
  console.log('[runner] Starting Next.js in production mode...');
  const child = spawn('npm', ['run', 'start'], {
    cwd: FRONT_END_DIR,
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code || 0));
} 

else if (cmd === 'build') {
  console.log('[runner] Building Next.js app...');
  const child = spawn('npm', ['run', 'build'], {
    cwd: FRONT_END_DIR,
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code || 0));
} 

else if (cmd === 'lint') {
  console.log('[runner] Running linter in front-end...');
  const child = spawn('npm', ['run', 'lint'], {
    cwd: FRONT_END_DIR,
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code || 0));
} 

else if (cmd === 'api') {
  const apiPort = process.env.API_PORT || '8003';
  killPort(apiPort);
  console.log('[runner] Starting FastAPI development server...');
  
  const uvicornPath = path.join(BACKEND_DIR, '.venv', venvBin, isWin ? 'uvicorn.exe' : 'uvicorn');
  const args = ['main:app', '--reload', '--host', '0.0.0.0', '--port', apiPort];
  
  const child = spawn(uvicornPath, args, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', code => process.exit(code || 0));
} 

else if (cmd === 'api:prod') {
  process.env.APP_ENV = 'prod';
  const apiPort = process.env.API_PORT || '8003';
  killPort(apiPort);
  console.log('[runner] Starting FastAPI production server...');
  
  if (isWin) {
    console.log('[runner] Windows detected: falling back to production uvicorn (gunicorn is Unix-only)...');
    const uvicornPath = path.join(BACKEND_DIR, '.venv', venvBin, 'uvicorn.exe');
    const args = ['main:app', '--host', '0.0.0.0', '--port', apiPort];
    const child = spawn(uvicornPath, args, {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      shell: true
    });
    child.on('exit', code => process.exit(code || 0));
  } else {
    // Unix: run gunicorn
    const gunicornPath = path.join(BACKEND_DIR, '.venv', venvBin, 'gunicorn');
    
    // Get CPU count for workers count
    let workers = 4;
    try {
      workers = parseInt(execSync("python3 -c 'import os; print(os.cpu_count())'").toString().trim(), 10) || 4;
    } catch (e) {}

    const args = [
      'main:app',
      '-k', 'uvicorn.workers.UvicornWorker',
      '--workers', workers.toString(),
      '--bind', `0.0.0.0:${apiPort}`,
      '--timeout', '600',
      '--graceful-timeout', '30',
      '--keep-alive', '5',
      '--access-logfile', '-',
      '--error-logfile', '-'
    ];
    
    const child = spawn(gunicornPath, args, {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      shell: true
    });
    child.on('exit', code => process.exit(code || 0));
  }
} 

else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
