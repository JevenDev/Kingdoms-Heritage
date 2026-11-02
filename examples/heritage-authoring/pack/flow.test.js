'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Pack=require('./engine.js');
const Flow=require('./flow.js');
const bundled=require('./assets/defaults.json');
const native=path.join(__dirname,'../../../src/main/resources');
const build=(changes={},catalog={kits:[],intros:[]})=>Pack.build({name:'Preview',namespace:'preview',description:'Flow test',keepKits:true,keepLocations:false,kits:[],locations:[Pack.location('home')],...changes},catalog);
const choices=()=>({spawns:[{id:'pack:home',title:'Home',type:'default',kits:['pack:axe','pack:bread'],intro:{text:'Welcome'}},{id:'pack:empty',title:'Empty',type:'default',kits:['pack:empty']}],kits:[{id:'pack:axe',title:'Axe',items:[{index:0,item:{id:'minecraft:wooden_axe'}}]},{id:'pack:bread',title:'Bread',items:[{index:0,item:{id:'minecraft:bread'}}]},{id:'pack:empty',title:'Empty',items:[]}]});
test('preview catalog uses the exact exported definitions and disabled bundled choices',()=>{
  const output=build(),catalog=Flow.catalog(output,bundled);
  assert.deepEqual(catalog.spawns.map(entry=>entry.id),['preview:location_1']);
  assert.deepEqual(catalog.kits.map(entry=>entry.id),['kingdomsheritage:default']);
  const file=output.files.find(file=>file.path==='data/preview/heritage/spawns/location_1.json');
  assert.deepEqual(catalog.spawns[0],{...JSON.parse(file.content),id:'preview:location_1'});
});
test('kept bundled choices and custom kits use game menu order followed by resource ID',()=>{
  const spawns=[Pack.location('z'),Pack.location('a')];spawns[0].path='z';spawns[1].path='a';spawns[0].fields.order='0';spawns[1].fields.order='0';
  const catalog=Flow.catalog(build({keepLocations:true,locations:spawns}),bundled);
  assert.equal(catalog.spawns.length,6);
  assert.deepEqual(catalog.spawns.slice(0,3).map(entry=>entry.id),['preview:a','kingdomsheritage:default','preview:z']);
});
test('invalid output cannot open a partial or stale preview',()=>{
  assert.throws(()=>Flow.catalog(build({locations:[]}),bundled),/Fix the pack errors/);
});
test('full flow filters kits and keeps choices while navigating back from review',()=>{
  const source=choices(),session=new Flow.Session(source);session.choose('pack:home');session.next();
  assert.equal(session.phase,'kit');assert.equal(session.allowed().length,2);
  session.select(1);session.next();assert.equal(session.phase,'kit-confirm');
  session.back();assert.equal(session.phase,'kit');assert.equal(session.kit.id,'pack:bread');
  session.next();session.next();assert.equal(session.phase,'loading');session.next();assert.equal(session.phase,'review');
  session.back();assert.equal(session.phase,'kit');assert.equal(session.kit.id,'pack:bread');
  session.back();assert.equal(session.phase,'location-confirm');session.back();assert.equal(session.phase,'location');
  assert.deepEqual(source,choices());
});
test('one allowed kit skips kit screens and no intro completes directly after review',()=>{
  const session=new Flow.Session(choices());session.choose('pack:empty');session.next();assert.equal(session.phase,'loading');
  session.next();session.back();assert.equal(session.phase,'location-confirm');
  session.next();session.next();session.next();assert.equal(session.phase,'complete');
  session.restart();assert.equal(session.phase,'location');assert.equal(session.spawn,null);assert.equal(session.arrival,null);
});
test('arrival intros start only after the final story confirmation',()=>{
  const session=new Flow.Session(choices());session.choose('pack:home');session.next();session.next();session.next();session.next();
  assert.equal(session.phase,'review');session.next();assert.equal(session.phase,'intro');session.next();assert.equal(session.phase,'complete');
});
test('pool previews preserve inherited, overridden and explicitly disabled intros',()=>{
  const spawn={type:'pool',dimension:'minecraft:overworld',intro:{text:'Default'},pool:[{type:'biome',target:'minecraft:forest'},{type:'fixed',x:1,y:64,z:1,intro:null},{type:'structure',target:'minecraft:village_plains',intro:{text:'Village'}}]};
  assert.deepEqual(Flow.destination(spawn,0).intro,{text:'Default'});
  assert.equal(Flow.destination(spawn,1).intro,null);
  assert.deepEqual(Flow.destination(spawn,2).intro,{text:'Village'});
  assert.equal(Flow.destination(spawn,0).dimension,'minecraft:overworld');
  assert.throws(()=>Flow.destination(spawn,3),/available pool destination/);
  assert.equal(spawn.pool.length,3);
});
test('review narration follows the game wording and reveal pauses',()=>{
  const segments=Flow.narration('Alex',{biome:'Plains',structure:'Wilderness'},choices().kits[0]);
  assert.equal(segments.map(segment=>segment.text).join(''),'Alex... you woke up in the plains... with equipment from the "Axe" kit... is that correct?');
  assert.equal(Flow.revealed(segments,0),0);assert.equal(Flow.revealed(segments,7*40+499),7);
  assert.equal(Flow.revealed(segments,7*40+500+40),8);
  assert.equal(Flow.revealed(segments,100000),Array.from(segments.map(segment=>segment.text).join('')).length);
  assert.match(Flow.narration('Alex',{biome:'Forest',structure:'Village Plains'},choices().kits[2])[2].text,/nothing but your own two hands/);
});
test('sample locations resolve concrete targets and retain sample names for tags and unknown terrain',()=>{
  assert.deepEqual(Flow.locations({type:'biome',target:'minecraft:cherry_grove',dimension:'minecraft:the_nether'}),{biome:'Cherry Grove',structure:'Wilderness',dimension:'The Nether'});
  assert.equal(Flow.locations({type:'biome',target:'#minecraft:is_forest'},{biome:'Birch Forest'}).biome,'Birch Forest');
  assert.equal(Flow.label({title:'Fallback',title_key:'custom.key'},'title',{}),'Fallback');
  assert.equal(Flow.label({title:'Fallback',title_key:'toString'},'title',{}),'Fallback');
});
test('bundled definitions, translations and presentation assets match the current game',()=>{
  assert.deepEqual(bundled.selection,JSON.parse(fs.readFileSync(path.join(native,'data/kingdomsheritage/heritage/selection.json'),'utf8')));
  assert.deepEqual(bundled.translations,JSON.parse(fs.readFileSync(path.join(native,'assets/kingdomsheritage/lang/en_us.json'),'utf8')));
  for(const kind of ['spawns','kits'])for(const {id,...entry} of bundled[kind])assert.deepEqual(entry,JSON.parse(fs.readFileSync(path.join(native,'data/kingdomsheritage/heritage',kind,id.split(':')[1]+'.json'),'utf8')));
  const assets=[...['card','card_expanded','card_fallback'].map(name=>[name+'.png','textures/gui/campaign_select_screen/campaign_select_screen_'+name+'.png']),...['default','random','plains','village'].map(name=>[name+'.png','textures/gui/locations/'+name+'.png']),...['click','hover','confirmation','dissolve'].map(name=>[name+'.ogg','sounds/ui/'+name+'.ogg']),...['disconnect','disconnect_highlighted'].map(name=>[name+'.png','textures/gui/sprites/selection/'+name+'.png']),['selection.ogg','sounds/music/selection.ogg'],['selection_background.fsh','shaders/core/selection_background.fsh']];
  for(const [copy,original] of assets){
    const actual=fs.readFileSync(path.join(__dirname,'assets',copy)),expected=fs.readFileSync(path.join(native,'assets/kingdomsheritage',original));
    if(copy.endsWith('.fsh'))assert.equal(actual.toString().replaceAll('\r\n','\n'),expected.toString().replaceAll('\r\n','\n'));
    else assert.deepEqual(actual,expected);
  }
});

test('a chosen pool destination stays fixed through story review and uses its own intro',()=>{
  const source=choices();source.spawns[0]={...source.spawns[0],type:'pool',pool:[{type:'biome',target:'minecraft:forest',intro:null},{type:'biome',target:'minecraft:plains',intro:{text:'Chosen destination'}}]};
  const session=new Flow.Session(source);session.choose('pack:home');session.next();session.next();session.next(1);
  assert.equal(session.poolIndex,1);assert.equal(session.arrival.target,'minecraft:plains');session.next();session.next();
  assert.equal(session.phase,'intro');assert.deepEqual(session.arrival.intro,{text:'Chosen destination'});
});

test('flow previews read their global GUI scale from the exported settings',()=>{
  assert.equal(Flow.catalog(build(),bundled).guiScale,0);
  for(const guiScale of [0,1,3,16])assert.equal(Flow.catalog(build({guiScale}),bundled).guiScale,guiScale);
  const source=Flow.catalog(build({guiScale:3}),bundled),session=new Flow.Session(source);
  session.choose('preview:location_1');session.next();session.next();session.next();
  assert.equal(session.phase,'complete');assert.equal(session.choices.guiScale,3);session.restart();
  assert.equal(session.choices.guiScale,3);assert.equal(source.guiScale,3);
});

test('the bundled scale is inherited unless an exported pack explicitly overrides it',()=>{
  assert.equal(Flow.catalog({errors:[],files:[]},bundled).guiScale,3);
  assert.equal(Flow.catalog(build(),bundled).guiScale,0);
});
