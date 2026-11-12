'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('./editing.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const pack=()=>({version:1,name:'Pack',namespace:'test',description:'',keepKits:true,kits:[{id:'k',path:'starter',included:true},{id:'other',path:'other',included:true}],locations:[{id:'a',fields:{title:'Forest',order:'0'},kitMode:'all',kits:[],intro:'i',destinations:[{type:'biome',target:'minecraft:forest',intro:'i'}]},{id:'b',fields:{title:'Village',order:'1'},kitMode:'selected',kits:['k'],intro:'i',destinations:[]}],active:'a'});
const libs=()=>({kits:{version:2,active:'k',kits:[{id:'k',state:{source:'old',document:{title:'Starter',items:[]}}},{id:'other',state:{source:'other',document:{title:'Other',items:[]}}}]},intros:{version:2,active:'i',intros:[{id:'i',state:{name:'Arrival',source:'intro',document:{text:'Arrived'}}},{id:'unrelated',state:{source:'keep',document:{text:'Keep'}}}]}});
test('pack undo restores deletions and redo preserves independent nested state',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),after=clone(before);after.locations.shift();after.active='b';history.record(after,libraries,{label:'Delete location'});
  const undo=history.plan(-1,after,libraries);assert.deepEqual(undo.pack,before);history.accept(-1,undo);undo.pack.locations[0].fields.title='local mutation';
  const redo=history.plan(1,before,libraries);assert.deepEqual(redo.pack,after);assert.equal(history.canRedo,true);
});
test('text input groups merge while new edits discard the redo branch',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),first=clone(before);first.name='One';history.record(first,libraries,{group:'name',now:100});const second=clone(first);second.name='Two';history.record(second,libraries,{group:'name',now:500});assert.equal(history.actions.length,1);
  const undo=history.plan(-1,second,libraries);assert.equal(undo.pack.name,'Pack');history.accept(-1,undo);history.record({...before,name:'Branch'},libraries);assert.equal(history.canRedo,false);
});
test('draft history changes only explicitly authored drafts and keeps unrelated library work',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),after=clone(libraries);after.kits.kits[0].state.source='edited';after.intros.intros[1].state.source='outside';history.record(before,after,{drafts:[{kind:'kits',id:'k'}]});
  const undo=history.plan(-1,before,after);assert.equal(undo.libraries.kits.kits[0].state.source,'old');assert.equal(undo.libraries.intros.intros[1].state.source,'outside');
});
test('draft undo rejects an intervening edit to the same shared entry',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),after=clone(libraries);after.kits.kits[0].state.source='edited';history.record(before,after,{drafts:[{kind:'kits',id:'k'}]});after.kits.kits[0].state.source='outside';assert.throws(()=>history.plan(-1,before,after),/outside this history/);
});
test('new draft creation and deletion are reversible without changing other drafts',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),after=clone(libraries);after.intros.intros.push({id:'new',state:{source:'new',document:{text:'New'}}});after.intros.active='new';history.record(before,after,{drafts:[{kind:'intros',id:'new'}]});
  const undo=history.plan(-1,before,after);assert.equal(undo.libraries.intros.intros.some(entry=>entry.id==='new'),false);assert.equal(undo.libraries.intros.active,'i');history.accept(-1,undo);assert.equal(history.plan(1,before,undo.libraries).libraries.intros.intros.at(-1).id,'new');
});
test('bulk kit and intro assignments preserve pool overrides and unselected locations',()=>{
  const before=pack(),after=E.assign(before,['a'],{kitIds:['other'],intro:''});assert.deepEqual(after.locations[0].kits,['other']);assert.equal(after.locations[0].kitMode,'selected');assert.equal(after.locations[0].destinations[0].intro,'i');assert.deepEqual(after.locations[1],before.locations[1]);assert.throws(()=>E.assign(before,['a'],{kitIds:[]}),/at least one/);assert.throws(()=>E.assign(before,['missing'],{intro:''}),/available/);
});
test('reordering writes native menu positions and rejects missing or duplicate locations',()=>{
  const before=pack(),after=E.reorder(before,['b','a']);assert.equal(after.locations[0].fields.order,'1');assert.equal(after.locations[1].fields.order,'0');assert.equal(before.locations[0].fields.order,'0');assert.throws(()=>E.reorder(before,['a','a']),/each location once/);
});
test('local kit copies isolate all-kit locations without changing choices elsewhere',()=>{
  const before=pack(),libraries=libs(),after=E.privateCopy(before,libraries,'kit','k','a','copy');assert.equal(after.pack.locations[0].kitMode,'selected');assert.deepEqual(after.pack.locations[0].kits,['copy','other','bundled-empty','kingdomsheritage:miner','kingdomsheritage:adventurer','kingdomsheritage:byo']);assert.deepEqual(after.pack.locations[1],before.locations[1]);assert.equal(after.pack.kits.at(-1).path,'starter_copy');assert.deepEqual(after.libraries.kits.kits.at(-1).state,libraries.kits.kits[0].state);assert.equal(libraries.kits.kits.length,2);
});
test('local intro copies replace this location and its matching pool overrides only',()=>{
  const before=pack(),after=E.privateCopy(before,libs(),'intro','i','a','copy');assert.equal(after.pack.locations[0].intro,'copy');assert.equal(after.pack.locations[0].destinations[0].intro,'copy');assert.equal(after.pack.locations[1].intro,'i');assert.equal(after.libraries.intros.intros.at(-1).state.name,'Arrival copy');
});
test('named checkpoints retain connected content and restore without deleting unrelated drafts',()=>{
  const before=pack(),libraries=libs(),saved=E.checkpoint(before,libraries,'  Opening  ','checkpoint',123);assert.equal(saved.name,'Opening');assert.equal(saved.created,123);assert.equal(saved.libraries.intros.intros.length,1);
  const current=clone(libraries);current.intros.intros[0].state.source='changed';const restored=E.restoreCheckpoint(saved,{...before,name:'Changed'},current);assert.equal(restored.pack.name,'Pack');assert.equal(restored.libraries.intros.intros[0].state.source,'intro');assert.equal(restored.libraries.intros.intros[1].state.source,'keep');assert.throws(()=>E.checkpoint(before,libraries,' ','x'),/Name the checkpoint/);
});


test('pack kit reordering is reversible and leaves location assignments intact',()=>{
  const before=pack(),libraries=libs(),order=['other','kingdomsheritage:byo','bundled-empty','k','kingdomsheritage:miner','kingdomsheritage:adventurer'];
  const after=E.reorderKits(before,order);assert.deepEqual(after.kitOrder,order);assert.deepEqual(after.locations,before.locations);assert.equal(before.kitOrder,undefined);assert.throws(()=>E.reorderKits(before,['k','k','other']),/each kit once/);assert.throws(()=>E.reorderKits(before,['k']),/each kit once/);const history=new E.History(before,libraries);history.record(after,libraries);const undo=history.plan(-1,after,libraries);assert.equal(undo.pack.kitOrder,undefined);history.accept(-1,undo);assert.deepEqual(history.plan(1,before,libraries).pack.kitOrder,after.kitOrder);
});
test('duplicating a kit creates a unique file and keeps the original shared assignment',()=>{
  const before=pack(),libraries=libs();libraries.kits.kits[0].state.source=JSON.stringify(libraries.kits.kits[0].state.document);before.kitOrder=['k','other','bundled-empty'];const original=JSON.stringify({before,libraries}),result=E.duplicateDraft(before,libraries,'kit','k','b','copy');assert.deepEqual(result.pack.locations[1].kits,['k','copy']);assert.equal(result.pack.locations[0].kitMode,'all');assert.equal(result.libraries.kits.kits.at(-1).state.document.title,'Starter copy');assert.equal(result.pack.kits.at(-1).included,true);assert.deepEqual(result.pack.kitOrder,['k','copy','other','bundled-empty']);assert.equal(JSON.stringify({before,libraries}),original);
});
test('duplicating a place intro changes only that place and can be undone with its draft',()=>{
  const before=pack(),libraries=libs(),history=new E.History(before,libraries),result=E.duplicateDraft(before,libraries,'intro','i','a','copy',0);assert.equal(result.pack.locations[0].intro,'i');assert.equal(result.pack.locations[0].destinations[0].intro,'copy');assert.equal(result.pack.locations[1].intro,'i');assert.equal(result.libraries.intros.intros.at(-1).state.name,'Arrival copy');history.record(result.pack,result.libraries,{drafts:[{kind:'intros',id:'copy'}]});const undo=history.plan(-1,result.pack,result.libraries);assert.deepEqual(undo.pack,before);assert.equal(undo.libraries.intros.intros.some(entry=>entry.id==='copy'),false);
});
test('project imports remap kit order alongside colliding draft IDs',()=>{
  const P=require('./project.js'),before=pack(),libraries=libs();before.kitOrder=['k','bundled-empty','other'];const backup=P.backup(before,libraries.kits,libraries.intros),current=clone(libraries);current.kits.kits[0].state.source='different';const result=P.merge(backup,current,()=> 'remapped');assert.deepEqual(result.pack.kitOrder,['remapped','bundled-empty','other']);assert.deepEqual(result.pack.locations[1].kits,['remapped']);assert.equal(P.validatePack(pack()).kitOrder,undefined);
});


test('the built-in empty kit can be duplicated without adding a fake shared draft',()=>{
  const before=pack(),libraries=libs(),result=E.duplicateDraft(before,libraries,'kit','builtin-empty','b','empty-copy');assert.deepEqual(result.libraries.kits.kits.at(-1).state.document,{title:'Empty-handed copy',items:[]});assert.equal(result.libraries.kits.kits.some(entry=>entry.id==='builtin-empty'),false);assert.deepEqual(result.pack.locations[1].kits,['k','empty-copy']);assert.equal(libraries.kits.kits.length,2);
});

test('mixed card ordering preserves default definitions and custom assignments through undo and redo',()=>{
 const Flow=require('./flow.js'),defaults=require('./assets/defaults.json'),input=pack();input.keepLocations=true;input.locations.forEach((entry,index)=>{entry.path=entry.id;entry.fields.type='default';});const source=clone(input),spawns=[...defaults.spawns,...input.locations.map(entry=>({id:'test:'+entry.path,order:Number(entry.fields.order)}))],ids=['kingdomsheritage:random','test:b','kingdomsheritage:default','test:a','kingdomsheritage:village','kingdomsheritage:plains'],result=E.reorderCards(input,ids,spawns);
 const baseline=spawns.slice().sort(Flow.compare).map(spawn=>spawn.id),projected=E.reorder(input,['b','a'],spawns),customQueue=['test:b','test:a'];const expected=baseline.map(id=>id.startsWith('test:')?customQueue.shift():id);for(const id of expected){const rank=id.startsWith('test:')?Number(projected.locations.find(entry=>'test:'+entry.path===id).fields.order):projected.bundledLocations[id].order;assert.equal(rank,expected.indexOf(id));}
 assert.deepEqual(input,source);assert.equal(result.active,'a');assert.equal(result.locations[0].fields.order,'3');assert.equal(result.locations[1].fields.order,'1');assert.deepEqual(result.locations.map(entry=>entry.kits),input.locations.map(entry=>entry.kits));
 for(const spawn of defaults.spawns){const {id,order,...rest}=spawn,{order:next,...saved}=result.bundledLocations[id];assert.deepEqual(saved,rest);assert.equal(next,ids.indexOf(id));}
 const libraries=libs(),history=new E.History(input,libraries);history.record(result,libraries);const undo=history.plan(-1,result,libraries);assert.deepEqual(undo.pack,input);history.accept(-1,undo);assert.deepEqual(history.plan(1,input,libraries).pack,result);
 const subset=E.reorder(result,['a','b']);assert.equal(subset.locations[0].fields.order,'1');assert.equal(subset.locations[1].fields.order,'3');assert.deepEqual(subset.bundledLocations,result.bundledLocations);
 for(const invalid of [ids.slice(1),[...ids.slice(0,-1),ids[0]],[...ids.slice(0,-1),'external:missing']])assert.throws(()=>E.reorderCards(input,invalid,spawns),/each starting location/);
 assert.throws(()=>E.reorderCards(input,ids,[]),/still loading/);
});
test('reordering an override of a bundled location does not create a duplicate default',()=>{
 const input=pack();input.namespace='kingdomsheritage';input.keepLocations=true;input.locations[0].path='default';input.locations[1].path='custom';const defaults=require('./assets/defaults.json').spawns,ids=['kingdomsheritage:custom','kingdomsheritage:random','kingdomsheritage:default','kingdomsheritage:village','kingdomsheritage:plains'],result=E.reorderCards(input,ids,defaults);assert.equal(result.bundledLocations['kingdomsheritage:default'],undefined);assert.equal(result.locations[0].fields.order,'2');
});

test('grouped history growth recalculates the memory budget and preserves image undo',()=>{
  const initial=pack(),libraries=libs();initial.locations[0].picture={name:'Card',data:'a'.repeat(1024*1024)};const history=new E.History(initial,libraries);let current=initial;
  for(let index=0;index<4;index++){current=clone(current);current.name='Edit '+index;history.record(current,libraries,{group:'edit-'+index,now:index*1000});}
  current=clone(current);current.locations[0].picture.data='b'.repeat(6*1024*1024);history.record(current,libraries,{group:'image',now:5000});const count=history.actions.length;
  current=clone(current);current.locations[0].picture.data='c'.repeat(10*1024*1024);history.record(current,libraries,{group:'image',now:5100});assert.ok(history.actions.length<count);assert.ok(history.actions.reduce((bytes,action)=>bytes+JSON.stringify(action).length,0)<=16*1024*1024);
  const undo=history.plan(-1,current,libraries);assert.equal(undo.pack.locations[0].picture.data,initial.locations[0].picture.data);history.accept(-1,undo);assert.equal(history.plan(1,undo.pack,libraries).pack.locations[0].picture.data,current.locations[0].picture.data);
});
test('selecting another location does not create an edit or mutate history snapshots',()=>{
  const initial=pack(),libraries=libs(),history=new E.History(initial,libraries),next={...initial,active:'b'};assert.equal(history.record(next,libraries),false);assert.equal(history.actions.length,0);assert.equal(initial.active,'a');next.locations[0].fields.title='Changed';assert.equal(history.present.pack.locations[0].fields.title,'Forest');
});
