'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),B=require('./content-browser.js');
const entries=[{kind:'location',id:'camp',name:'Forest camp',detail:'World spawn',path:'places/forest'},{kind:'kit',id:'kit',name:'Forest explorer',detail:'Used by 2 locations',path:'kits/explorer'},{kind:'intro',id:'intro',name:'Arrivée au camp',detail:'Library · Not assigned',path:''}];
test('content search combines name, usage and path without changing input order or contents',()=>{
  const original=JSON.stringify(entries);assert.deepEqual(B.filter(entries,'FOREST').map(e=>e.id),['camp','kit']);assert.deepEqual(B.filter(entries,'forest places/').map(e=>e.id),['camp']);assert.deepEqual(B.filter(entries,'used 2','kit').map(e=>e.id),['kit']);assert.equal(JSON.stringify(entries),original);
});
test('content type and accent-insensitive queries find unassigned assets and empty results',()=>{
  assert.deepEqual(B.filter(entries,'arrivee','intro').map(e=>e.id),['intro']);assert.deepEqual(B.filter(entries,'  ','location').map(e=>e.id),['camp']);assert.deepEqual(B.filter(entries,'forest','intro'),[]);assert.deepEqual(B.filter(entries,'not assigned').map(e=>e.id),['intro']);
});
