import {mkdirSync,lstatSync,chmodSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {root} from './runtime.mjs';
export const privateDirectory=join(root,'.montra');
function windowsPermissions(path,directory){
  const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-[\d-]+/);
  if(!sid)throw new Error('Cannot determine Windows account permissions.');
  execFileSync('icacls',[path,'/inheritance:r','/grant:r',`*${sid[0]}:${directory?'(OI)(CI)':''}F`],{stdio:'ignore',windowsHide:true});
}
export function protectDirectory(directory=privateDirectory){
  mkdirSync(directory,{recursive:true,mode:0o700});
  if(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink())throw new Error('Private directory must not be a symbolic link.');
  if(process.platform==='win32'){
    windowsPermissions(directory,true);
  }else chmodSync(directory,0o700);
  return directory;
}
export function protectEnvironment(){
  const path=join(root,'.env');
  try{
    const info=lstatSync(path);
    if(!info.isFile()||info.isSymbolicLink())throw new Error('Environment settings must be a regular file.');
    if(process.platform==='win32')windowsPermissions(path,false);else chmodSync(path,0o600);
  }catch(error){if(error.code!=='ENOENT')throw error;}
}
export function readPrivate(name,directory=privateDirectory){
  const path=join(directory,name);
  try{
    const info=lstatSync(path);
    if(!info.isFile()||info.isSymbolicLink())throw new Error('Private settings must be regular files.');
    if(process.platform!=='win32')chmodSync(path,0o600);
    return JSON.parse(readFileSync(path,'utf8'));
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export function writePrivate(name,value,directory=privateDirectory){
  protectDirectory(directory);
  const path=join(directory,name),temp=join(dirname(path),`.write-${randomBytes(8).toString('hex')}`);
  try{
    writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    renameSync(temp,path);
  }finally{try{unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return path;
}
export function createPrivate(name,value,directory=privateDirectory){
  protectDirectory(directory);
  try{writeFileSync(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return true;}
  catch(error){if(error.code==='EEXIST')return false;throw error;}
}
