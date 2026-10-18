import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {browserCommand} from '../runtime.mjs';

export async function writeCloudShortcut(directory,url){
  browserCommand(url); // Only a validated, public Workers URL may enter the HTML.
  await writeFile(join(directory,'open-ledger.html'),`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${url}">
<title>Montra · 登录账本 / Sign in</title></head>
<body><h1>Montra</h1><p><a href="${url}" rel="noreferrer">打开账本并登录 / Open ledger and sign in</a></p>
<p>电脑和手机使用同一个账本密码。无需登录 Cloudflare。<br>Use your ledger password on every device. A Cloudflare sign-in is not needed.</p></body></html>
`,{mode:0o644});
}
