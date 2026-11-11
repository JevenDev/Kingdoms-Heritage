'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('./coverage.js'),F=require('./flow.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const choices=()=>({guiScale:3,spawns:[{id:'test:forest',title:'Forest',type:'pool',kits:['test:ranger','test:mage'],intro:{text:'Default'},pool:[{type:'biome',target:'minecraft:forest'},{type:'structure',target:'minecraft:village_plains',intro:{text:'Village'}},{type:'default',intro:null}]},{id:'test:home',title:'Home',type:'default'}],kits:[{id:'test:ranger',title:'Ranger',items:[{index:0,item:{id:'minecraft:compass'}}]},{id:'test:mage',title:'Mage',items:[]}]});
const all=['location','kit','arrival','intro'];
test('coverage enumerates every allowed location, kit and pool combination with paging',()=>{
  const value=choices();assert.equal(C.count(value),8);assert.equal(C.count(value,'test:forest'),6);const first=C.page(value,{}, {limit:3}),second=C.page(value,{}, {offset:3,limit:3});assert.equal(first.length,3);assert.equal(second.length,3);assert.equal(new Set([...first,...second].map(route=>route.key)).size,6);assert.equal(first[0].arrival.target,'minecraft:forest');assert.equal(first[2].arrival.intro,null);
});
test('completed paths persist separately and reload without marking other paths tested',()=>{
  const value=choices(),route=C.scene(value,{},'test:forest','test:ranger',0),ledger=new C.Ledger();assert.equal(ledger.record('pack',route,all,{resolution:'1920x1080'},100),true);const restored=new C.Ledger(JSON.stringify(ledger.serialize()));assert.deepEqual(restored.summary('pack',value,{}),{total:8,tested:1,changed:0,partial:0});assert.equal(restored.status('other-pack',route).state,'untested');
});
test('item changes invalidate only paths using that kit',()=>{
  const value=choices(),ledger=new C.Ledger();for(const route of C.page(value,{}))ledger.record('pack',route,all,{});value.kits[0].items[0].item.count=2;assert.deepEqual(ledger.summary('pack',value,{}),{total:8,tested:4,changed:4,partial:0});
});
test('shop paths require testing the playable shop and track changes to its rules',()=>{
  const value=choices(),kit=value.kits[1];
  kit.shop={budget:2,offers:[{cost:1,item:{id:'minecraft:bread'}}]};
  const before=C.scene(value,{},'test:home',kit.id),ledger=new C.Ledger();
  const previous={...before,parts:{...before.parts,kit:C.hash([kit,value.kits.map(entry=>entry.id),value.guiScale])}};
  ledger.record('pack',previous,all,{});
  assert.equal(ledger.status('pack',before).state,'changed');
  assert.equal(ledger.record('pack',before,['kit'],{}),true);
  delete kit.items;
  assert.equal(C.scene(value,{},'test:home',kit.id).parts.arrival,before.parts.arrival);
  kit.shop.budget=3;
  const after=C.scene(value,{},'test:home',kit.id);
  assert.notEqual(after.parts.kit,before.parts.kit);
  assert.equal(after.parts.location,before.parts.location);
  assert.equal(ledger.status('pack',after).state,'changed');
});
test('default intro changes leave overridden and explicitly disabled pool intros tested',()=>{
  const value=choices(),ledger=new C.Ledger();for(const route of C.page(value,{}))ledger.record('pack',route,all,{});value.spawns[0].intro.text='New default';assert.deepEqual(ledger.summary('pack',value,{}),{total:8,tested:6,changed:2,partial:0});
});
test('resuming after an intro-only edit reuses unchanged tested stages',()=>{
  const value=choices(),ledger=new C.Ledger(),before=C.scene(value,{},'test:forest','test:ranger',0);ledger.record('pack',before,all,{},100);value.spawns[0].intro.text='Changed';const after=C.scene(value,{},'test:forest','test:ranger',0);assert.equal(ledger.status('pack',after).state,'changed');assert.equal(ledger.record('pack',after,['intro'],{},200),true);assert.equal(ledger.status('pack',after).state,'tested');
});
test('a resumed intro cannot mark an unvisited changed kit or a new path tested',()=>{
  const value=choices(),ledger=new C.Ledger(),before=C.scene(value,{},'test:forest','test:ranger',0);ledger.record('pack',before,all,{},100);value.kits[0].items[0].item.count=2;const after=C.scene(value,{},'test:forest','test:ranger',0);assert.equal(ledger.record('pack',after,['intro'],{},200),false);assert.equal(ledger.status('pack',after).state,'changed');const other=C.scene(value,{},'test:forest','test:mage',0);ledger.record('pack',other,['intro'],{},200);assert.equal(ledger.status('pack',other).state,'partial');
});
test('image bytes, GUI overrides and native location order participate in coverage',()=>{
  const value=choices();value.spawns[0].image='test:textures/forest.png';const before=C.scene(value,{'assets/test/textures/forest.png':'old'},'test:forest','test:ranger',0),after=C.scene(value,{'assets/test/textures/forest.png':'new'},'test:forest','test:ranger',0);assert.notEqual(before.parts.location,after.parts.location);assert.equal(before.parts.kit,after.parts.kit);value.guiScale=4;assert.notEqual(C.scene(value,{},'test:forest','test:ranger',0).parts.intro,before.parts.intro);value.spawns.reverse();assert.notEqual(C.scene(value,{},'test:forest','test:ranger',0).parts.location,before.parts.location);
});
test('coverage ignores object key order and removed paths while preserving prior records',()=>{
  assert.equal(C.hash({a:1,b:{x:2,y:3}}),C.hash({b:{y:3,x:2},a:1}));const value=choices(),ledger=new C.Ledger(),route=C.scene(value,{},'test:forest','test:ranger',0);ledger.record('pack',route,all,{});value.spawns.shift();assert.equal(ledger.summary('pack',value,{}).tested,0);assert.ok(ledger.serialize().packs.pack[route.key]);assert.equal(C.scene(value,{},'missing','test:ranger'),null);
});
test('malformed coverage is rejected without mutating its input',()=>{
  assert.throws(()=>new C.Ledger('{bad'));assert.throws(()=>new C.Ledger({version:2,packs:{}}),/invalid/);const input={version:1,packs:{pack:{bad:{parts:{}}}}};assert.throws(()=>new C.Ledger(input));assert.deepEqual(input,{version:1,packs:{pack:{bad:{parts:{}}}}});
});
test('resuming preserves valid selected kits and destinations in the same native stage',()=>{
  const value=choices(),session=new F.Session(value);assert.equal(session.resume({phase:'intro',spawnId:'test:forest',kitId:'test:mage',poolIndex:1}),true);assert.equal(session.phase,'intro');assert.equal(session.kit.id,'test:mage');assert.equal(session.arrival.intro.text,'Village');assert.deepEqual(session.snapshot(),{phase:'intro',spawnId:'test:forest',kitId:'test:mage',poolIndex:1});
});
test('resume handles removed kits, pool entries and intros without selecting another location',()=>{
  const value=choices(),session=new F.Session(value);session.resume({phase:'intro',spawnId:'test:forest',kitId:'missing',poolIndex:99});assert.equal(session.spawn.id,'test:forest');assert.equal(session.kit.id,'test:ranger');assert.equal(session.poolIndex,0);session.resume({phase:'intro',spawnId:'test:forest',kitId:'test:ranger',poolIndex:2});assert.equal(session.phase,'review');assert.equal(session.resume({phase:'intro',spawnId:'missing'}),false);assert.equal(session.phase,'location');
});
