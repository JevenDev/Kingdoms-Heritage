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

test('independent timeline tracks keep world, text and bar durations separate',()=>{
  const config=P.readJson(JSON.stringify({...P.defaults,black_hold_ticks:10,fade_from_black_ticks:20,reveal_ticks:20,hold_ticks:30,fade_out_ticks:10,timeline:{text_start_ticks:5,bar_start_ticks:15,bar_enter_ticks:10,bar_hold_ticks:70,bar_exit_ticks:25}})).config;
  assert.equal(P.textStart(config),5);assert.equal(P.textDuration(config),60);assert.equal(P.duration(config),120);const changed={...config,timeline:{...config.timeline,bar_exit_ticks:40}};assert.equal(P.duration(changed),135);assert.equal(P.textDuration(changed),60);assert.equal(changed.timeline.bar_enter_ticks,10);assert.equal(P.barProgress(changed,20),P.barProgress(config,20));assert.equal(P.barProgress(config,14),0);assert.equal(P.barProgress(config,25),1);assert.equal(P.barProgress(config,120),0);
  assert.equal(P.duration({...config,cinematic_bars:false}),65);assert.equal(P.duration({...config,fade_from_black_ticks:200}),210);assert.equal(P.textDuration({...config,fade_from_black_ticks:200}),60);
});
test('legacy intro timing remains linked until an independent timeline is supplied',()=>{
  const config=P.readJson(JSON.stringify({text:'Legacy',fade_from_black_ticks:500,cinematic_bars:true})).config;assert.equal(config.timeline,null);assert.equal(P.textDuration(config),500);assert.equal(P.duration(config),560);for(const tick of [0,20,40,250,480,500])assert.equal(P.barProgress(config,tick+config.black_hold_ticks),P.barVisibility(tick,500,40));
});
test('independent timing validates every duration and preserves unknown intro properties',()=>{
  const timeline={text_start_ticks:0,bar_start_ticks:0,bar_enter_ticks:1,bar_hold_ticks:0,bar_exit_ticks:1},source={text:'Arrival',timeline,extra:{keep:true}};assert.deepEqual(P.readJson(JSON.stringify(source)).document,source);
  for(const key of Object.keys(timeline))for(const value of [-1,1.5,'20',null,7201])assert.throws(()=>P.readJson(JSON.stringify({...source,timeline:{...timeline,[key]:value}})),error=>error.field==='timeline.'+key);for(const key of ['bar_enter_ticks','bar_exit_ticks'])assert.throws(()=>P.readJson(JSON.stringify({...source,timeline:{...timeline,[key]:0}})));assert.throws(()=>P.readJson(JSON.stringify({...source,timeline:[]})));
});
