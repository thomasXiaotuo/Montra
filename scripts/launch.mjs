import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {root, loadEnvironment, appPort, version, releaseVersion, openBrowser, dockerEnabled,publishedCloudUrl} from '../runtime.mjs';

const exec = promisify(execFile);
export function npmCommand(platform = process.platform) {
  // This fixed command contains no interpolated configuration values.
  return platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --no-audit --no-fund']]
    : ['npm', ['ci', '--omit=dev', '--no-audit', '--no-fund']];
}
export async function probeService(url) {
  try {
    const response = await fetch(`${url}/api/health`, {signal:AbortSignal.timeout(2000), redirect:'error'});
    const health = await response.json();
    return response.ok && health.app === 'montra' ? health : false;
  } catch { return false; }
}
async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd:root, stdio:'inherit', windowsHide:true, ...options});
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 || signal === 'SIGINT' ? resolve() : reject(new Error(`${command} exited (${code ?? signal})`)));
  });
}
async function startExistingDatabase() {
  if (!dockerEnabled()) return;
  // Native and remote SQL Server installations do not require Docker.
  if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.SQL_SERVER || '127.0.0.1')) return;
  const localDocker = join(homedir(), '.docker', 'bin', process.platform === 'win32' ? 'docker.exe' : 'docker');
  const docker = existsSync(localDocker) ? localDocker : 'docker';
  try {
    await exec(docker, ['info', '--format', '{{.OSType}}'], {timeout:10000, windowsHide:true});
    const name = process.env.SQL_CONTAINER || 'sqlserver';
    const {stdout} = await exec(docker, ['inspect', '--format', '{{.State.Running}}', name], {timeout:5000, windowsHide:true});
    if (stdout.trim() === 'false') {
      console.log(`Starting existing database / 正在启动已有数据库容器：${name}`);
      await exec(docker, ['start', name], {timeout:30000, windowsHide:true});
    }
  } catch {
    console.log('If using Docker, start Docker and your existing container. For a new ledger, follow the installation guide. / 使用 Docker 时请先启动 Docker 和已有容器；新账本请按安装说明初始化。');
  }
}
export async function launch() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22+ is required. / 请安装 Node.js 22 或更新版本。');
  loadEnvironment();
  const cloud=process.env.MONTRA_LOCAL==='1'?null:publishedCloudUrl();
  if(cloud){console.log(`Montra · Cloud ledger / 云端账本\n${cloud}`);openBrowser(cloud);return;}
  const url = `http://127.0.0.1:${appPort()}`;
  console.log(`Montra ${releaseVersion}\n${url}`);
  const running = await probeService(url);
  if (running) {
    if(running.version!==version||running.securityVersion!==1)throw new Error('An older service is still running. Stop its terminal with Ctrl+C, then launch again. / 旧版服务仍在运行，请先在旧终端按 Ctrl+C，再启动加固版。');
    console.log(`Already running / 已在运行：${running.releaseVersion || running.version}`);
    openBrowser(url);
    return;
  }
  if (!existsSync(join(root, 'node_modules', 'mssql', 'package.json'))) {
    console.log('Installing dependencies / 首次安装运行依赖…');
    await run(...npmCommand());
  }
  await startExistingDatabase();
  console.log('Keep this window open. Stop with Ctrl+C. / 使用期间保持窗口打开，按 Ctrl+C 停止。');
  await run(process.execPath, [join(root, 'server.mjs')], {env:{...process.env, LEDGER_OPEN_BROWSER:process.env.LEDGER_OPEN_BROWSER ?? '1'}});
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  launch().catch(error => { console.error(`Launch failed / 启动失败：${error.message}`); process.exitCode = 1; });
}
