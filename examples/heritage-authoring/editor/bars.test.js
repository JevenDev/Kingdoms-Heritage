'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./engine.js');
test('bar thickness defaults without rewriting existing intro documents',()=>{
  const source={text:'Arrival',cinematic_bars:true,extra:{keep:true}},parsed=P.readJson(JSON.stringify(source));
  assert.equal(parsed.config.bar_height,26);assert.deepEqual(parsed.document,source);
  const changed=P.updateJson(parsed,{bar_height:48});assert.equal(changed.config.bar_height,48);assert.equal(changed.document.bar_height,48);assert.deepEqual(changed.document.extra,{keep:true});
  assert.equal(P.readJson(JSON.stringify({intro:changed.document})).config.bar_height,48);
});
test('bar thickness accepts only the native whole GUI-pixel range',()=>{
  for(const bar_height of [1,8,26,64,1200])assert.equal(P.readJson(JSON.stringify({text:'Arrival',bar_height})).config.bar_height,bar_height);
  for(const bar_height of [0,-1,1.5,1201,'26',true,null,{},[]])assert.throws(()=>P.readJson(JSON.stringify({text:'Arrival',bar_height})),error=>error.field==='bar_height'&&error.path[0]==='bar_height');
});
test('bar thickness retains the screen cap at every GUI size',()=>{
  for(const height of [80,240,270,360,540,1080])for(const requested of [1,8,26,64,1200])assert.equal(P.barHeight(height,requested),Math.min(requested,Math.trunc(height/4)));
  assert.equal(P.barHeight(360),26);
});
