'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pages=fs.readdirSync(__dirname).filter(file=>file.endsWith('.html')).map(file=>({file,html:fs.readFileSync(path.join(__dirname,file),'utf8')}));

test('site entry pages reference existing local resources and have unique element IDs',()=>{
  for(const {file,html} of pages){
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length,file);
    for(const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){
      const url=new URL(match[1],'https://heritage.test/');if(url.origin!=='https://heritage.test')continue;
      const resource=decodeURIComponent(url.pathname).slice(1);if(resource)assert.ok(fs.existsSync(path.join(__dirname,resource)),file+': '+resource);
    }
  }
});

test('shared scripts use the same cache version across site entry pages',()=>{
  const versions=new Map();
  for(const {file,html} of pages)for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)){
    const url=new URL(match[1],'https://heritage.test/'),previous=versions.get(url.pathname);
    if(previous)assert.equal(url.search,previous.search,file+' and '+previous.file+': '+url.pathname);
    else versions.set(url.pathname,{file,search:url.search});
  }
});
