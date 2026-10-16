import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const {version} = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let release;
try { release = JSON.parse(readFileSync(new URL('./release.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
export const edition = release?.edition || 'source';
export const releaseVersion = `${version}-${edition}`;

export function loadEnvironment() {
  try { process.loadEnvFile(join(root, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function appPort(value = process.env.PORT) {
  const port = Number(value || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535. / PORT 必须是 1–65535 的整数。');
  return port;
}
export function dockerEnabled(env = process.env, platform = process.platform) {
  return (env.SQL_USE_DOCKER ?? (platform === 'darwin' ? '1' : '0')) === '1';
}
export function browserCommand(url, platform = process.platform) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)) throw new Error('Invalid local URL');
  if (platform === 'darwin') return ['/usr/bin/open', [url]];
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}
export function openBrowser(url) {
  const [command, args] = browserCommand(url);
  const child = spawn(command, args, {stdio:'ignore', detached:true, windowsHide:true});
  let warned = false;
  const warn = () => { if (!warned) { warned = true; console.log(`Open in your browser / 请在浏览器打开：${url}`); } };
  child.on('error', warn);
  child.on('exit', code => { if (code) warn(); });
  child.unref();
}
