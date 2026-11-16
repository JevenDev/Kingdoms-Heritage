'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Drafts=require('./drafts.js');
const state=()=>({source:'{"title":"Saved kit","items":[]}',document:{title:'Saved kit',items:[]}});

test('draft libraries reject unsupported and damaged saved formats instead of replacing them',()=>{
  for(const saved of [{version:3,kits:[]},{version:2,kits:{}},{version:2,active:'one',kits:[{id:'one',state:{...state(),document:[]}}]},{version:2,active:'missing',kits:[{id:'one',state:state()}]},[],42]){
    const before=JSON.stringify(saved);assert.throws(()=>new Drafts(saved,state()),/library|draft/);assert.equal(JSON.stringify(saved),before);
  }
});

test('legacy, empty and current drafts retain their saved text and independent history',()=>{
  const initial=state(),legacy=new Drafts(initial,{},()=> 'legacy');assert.equal(legacy.active,'legacy');assert.deepEqual(legacy.get().state,initial);
  for(const saved of [null,{version:2,active:'',kits:[]}])assert.deepEqual(new Drafts(saved,initial,()=> 'fresh').get().state,initial);
  const saved={version:2,active:'one',kits:[{id:'one',state:initial}]},drafts=new Drafts(saved,{},()=> 'two');
  drafts.update({...initial,source:'unfinished'});assert.equal(drafts.get().history[0].source,initial.source);assert.equal(saved.kits[0].state.source,initial.source);
  assert.equal(drafts.serialize().kits[0].state.source,'unfinished');
});

test('intro drafts use the same validation without requiring valid unfinished JSON',()=>{
  const entry={name:'Arrival',source:'{',document:{text:'A new journey'}};
  const drafts=new Drafts({version:2,active:'intro',intros:[{id:'intro',state:entry}]},{},undefined,'intros');
  assert.deepEqual(drafts.get().state,entry);assert.equal(drafts.serialize().active,'intro');
});
