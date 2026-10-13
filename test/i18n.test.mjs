import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages,translate,detectLanguage} from '../public/i18n.js';
test('两种语言字典完整，模板参数一致',()=>{
  assert.deepEqual(Object.keys(messages.zh).sort(),Object.keys(messages.en).sort());
  for(const key of Object.keys(messages.zh)){
    const placeholders=value=>[...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
    assert.deepEqual(placeholders(messages.zh[key]),placeholders(messages.en[key]),key);
    assert.ok(messages.en[key].trim(),key);
  }
  assert.equal(translate('{count} 笔',{count:33},'en'),'33 entries');
});
test('记住手动选择，识别浏览器语言，其他语言回退英文',()=>{
  assert.equal(detectLanguage('en',['zh-CN']),'en');
  assert.equal(detectLanguage(null,['zh-TW']),'zh');
  assert.equal(detectLanguage('invalid',['en-GB']),'en');
  assert.equal(detectLanguage(null,['fr-FR']),'en');
});
test('界面静态文字与动态模板都已登记在翻译字典',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g))assert.ok(Object.hasOwn(messages.en,match[1]),match[1]);
  const code=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  for(const match of code.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)){
    const key=match[1].replace(/\\n/g,'\n').replace(/\\'/g,"'");assert.ok(Object.hasOwn(messages.en,key),key);
  }
});
