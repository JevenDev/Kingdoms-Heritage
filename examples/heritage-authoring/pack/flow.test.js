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
function shopChoices({budget=6,items=[]}={}){
  const source=choices();
  source.spawns[0].kits=['pack:shop'];
  source.kits.push({id:'pack:shop',title:'Trail Kit',items,shop:{budget,offers:[
    {cost:2,limit:3,item:{id:'minecraft:torch',count:16}},
    {cost:3,item:{id:'minecraft:shield'}},
    {cost:0,limit:2,item:{id:'iron_boots'}}
  ]}});
  return source;
}
function enterShop(source=shopChoices()){
  const session=new Flow.Session(source);
  session.choose('pack:home');session.next();
  assert.equal(session.phase,'kit');session.next();
  assert.equal(session.phase,'kit-shop');
  return session;
}
test('the kit shop enforces stack limits and per-kit points, with separate shortfall messages',()=>{
  const session=enterShop();
  assert.equal(session.buy(0),true);
  assert.equal(session.shopStatus(1).remaining,1);
  assert.equal(session.buy(1),true);
  assert.equal(session.shopStatus(0).issue,'short_one');
  assert.equal(session.buy(0),false);
  assert.equal(session.shopStatus(1).issue,'limit_reached');
  assert.equal(session.buy(2),true);
  assert.deepEqual(session.purchases.at(-1),{offer:2,slot:36});
  assert.equal(session.refund(40),true);
  assert.equal(session.buy(0),true);
  assert.equal(session.shopStatus(1).issue,'short_one');
  assert.equal(session.buy(0),true);
  assert.equal(session.shopStatus(1).issue,'short');
  assert.equal(session.shopStatus(0).issue,'limit_reached');
  assert.equal(session.spent,6);
  assert.equal(session.buy(2),true);
  assert.equal(session.shopStatus(2).issue,'limit_reached');
  assert.equal(session.buy(2),false);
});
test('refunds keep other stacks in place and fixed stacks survive a reset',()=>{
  const fixed={index:0,item:{id:'minecraft:apple'}},helmet={index:39,item:{id:'minecraft:iron_helmet'}};
  const source=shopChoices({items:[fixed,helmet]}),session=enterShop(source);
  assert.equal(session.refund(0),false);
  assert.equal(session.buy(0),true);assert.equal(session.buy(0),true);assert.equal(session.buy(1),false);
  assert.equal(session.buy(2),true);
  assert.deepEqual(session.loadout().items,[fixed,helmet,{index:1,item:{id:'minecraft:torch',count:32}},{index:36,item:{id:'iron_boots'}}]);
  assert.equal(session.refund(1),true);
  assert.deepEqual(session.loadout().items,[fixed,helmet,{index:1,item:{id:'minecraft:torch',count:16}},{index:36,item:{id:'iron_boots'}}]);
  assert.equal(session.refund(1),true);assert.equal(session.refund(1),false);
  assert.equal(session.buy(1),true);
  assert.equal(session.loadout().items.at(-1).index,40);
  session.resetShop();
  assert.equal(session.spent,0);assert.deepEqual(session.loadout().items,[fixed,helmet]);
  assert.deepEqual(session.kit,source.kits.at(-1));
});
test('shop purchases fill fixed stacks, spill, and refund without losing other items',()=>{
  const source=shopChoices({budget:8,items:[
    {index:0,item:{id:'minecraft:torch',count:62}},{index:2,item:{id:'minecraft:bread',count:62}}
  ]});
  source.kits.at(-1).shop.offers[1]={cost:2,item:{id:'bread',count:4}};
  const session=enterShop(source);
  assert.equal(session.buy(0),true);assert.equal(session.buy(1),true);assert.equal(session.buy(0),true);
  const count=slot=>session.loadout().items.find(entry=>entry.index===slot)?.item.count;
  assert.deepEqual([count(0),count(1),count(2),count(3)],[64,30,64,2]);
  assert.deepEqual(session.purchases,[{offer:0,slot:0},{offer:1,slot:2},{offer:0,slot:1}]);
  assert.equal(session.refund(0),true);
  assert.deepEqual([count(0),count(1),count(2),count(3)],[64,2,64,14]);
  assert.deepEqual(session.purchases,[{offer:1,slot:2},{offer:0,slot:0}]);
  assert.deepEqual(source.kits.at(-1).items.map(entry=>entry.item.count),[62,62]);
  const restored=new Flow.Session(source);
  assert.equal(restored.resume(session.snapshot()),true);
  assert.deepEqual(restored.loadout(),session.loadout());
});
test('refunds from overflow slots remove the latest purchase that filled that slot',()=>{
  const source=shopChoices({items:[{index:0,item:{id:'minecraft:torch',count:63}}]});
  const session=enterShop(source);
  assert.equal(session.buy(0),true);
  assert.equal(session.buy(0),true);
  assert.equal(session.purchaseSlots().get(0),0);
  assert.equal(session.purchaseSlots().get(1),1);
  assert.equal(session.refund(1),true);
  assert.equal(session.purchaseSlots().get(1),0);
  assert.equal(session.refund(1),true);
  assert.equal(session.spent,0);
  assert.equal(session.loadout().items[0].item.count,63);
  assert.equal(session.loadout().items.length,1);
});
test('a full regular inventory still has room for compatible equipment',()=>{
  const items=Array.from({length:36},(_,index)=>({index,item:{id:'minecraft:apple'}}));
  const session=enterShop(shopChoices({items}));
  assert.equal(session.shopStatus(0).issue,'no_space');
  assert.equal(session.buy(0),false);
  assert.equal(session.buy(2),true);
  assert.equal(session.shopStatus(2).issue,'no_space');
  assert.deepEqual(session.purchases,[{offer:2,slot:36}]);
});
test('shop purchases appear in arrival and survive back navigation and a resumed preview',()=>{
  const source=shopChoices(),session=enterShop(source);
  delete source.kits.at(-1).items;
  assert.match(Flow.narration('Alex',Flow.locations(session.spawn),source.kits.at(-1))[2].text,/nothing but your own two hands/);
  session.buy(0);session.buy(0);session.refund(0);session.back();session.next();
  assert.deepEqual(session.purchases,[{offer:0,slot:0}]);
  session.next();session.next();assert.equal(session.phase,'review');
  const names=Flow.context(session.arrival,session.loadout(),'Alex',Flow.locations(session.arrival));
  assert.equal(names.facts.receives_kit,'true');
  assert.match(Flow.narration('Alex',names,session.loadout())[2].text,/equipment from the "Trail Kit"/);
  const restored=new Flow.Session(source);
  assert.equal(restored.resume(session.snapshot()),true);
  restored.back();assert.equal(restored.phase,'kit-shop');
  assert.deepEqual(restored.purchases,[{offer:0,slot:0}]);
  restored.back();restored.back();restored.back();restored.choose('pack:home');restored.next();restored.next();
  assert.deepEqual(restored.purchases,[]);
});
test('section browsing keeps global offer indices and shares purchases across tabs',()=>{
  const kit=shopChoices().kits.at(-1);
  kit.shop.sections=[{id:'tools',name:'Tools',icon:'minecraft:iron_boots'},{id:'light',name:'Light',icon:'minecraft:torch'}];
  kit.shop.offers[0].section='light';
  kit.shop.offers[2].section='tools';
  const session=new Flow.Session({spawns:[],kits:[kit]},{shopOnly:true});
  assert.deepEqual(Flow.shopOfferIndices(kit.shop),[0,1,2]);
  assert.deepEqual(Flow.shopOfferIndices(kit.shop,'empty'),[]);
  const [boots]=Flow.shopOfferIndices(kit.shop,'tools');
  assert.equal(boots,2);
  assert.equal(session.buy(boots),true);
  assert.equal(session.buy(Flow.shopOfferIndices(kit.shop,'light')[0]),true);
  assert.equal(session.shopStatus(boots).bought,1);
  assert.deepEqual(session.purchases,[{offer:2,slot:36},{offer:0,slot:0}]);
});
test('shop windows slide a column at a time and preserve positioned gaps',()=>{
  const offers=[
    {section:'tools',position:{row:3,column:5}},
    {section:'tools',position:{row:1,column:1}},
    {section:'tools',position:{row:1,column:3}},
    {section:'tools',position:{row:2,column:8}},
    {section:'tools'}
  ];
  const tools=Flow.shopLayout({offers},'tools');
  assert.equal(tools.columns,8);
  assert.equal(tools.pages,5);
  assert.deepEqual(tools.window(0).slice(0,12),[1,4,2,-1,-1,-1,-1,-1,-1,-1,-1,-1]);
  assert.deepEqual(tools.window(4).slice(0,12),[-1,-1,-1,-1,-1,-1,-1,3,0,-1,-1,-1]);
  assert.deepEqual(Flow.shopLayout({offers}).window(0).slice(0,4),[0,1,2,3]);
});
test('standalone shop tests restart with the same draft and a fresh inventory',()=>{
  const kit=shopChoices().kits.at(-1);
  const session=new Flow.Session({spawns:[],kits:[kit]},{shopOnly:true});
  kit.shop.budget=1;
  assert.equal(session.phase,'kit-shop');
  assert.equal(session.buy(0),true);
  assert.equal(session.loadout().items.length,1);
  assert.deepEqual(kit.items,[]);
  session.next();session.back();
  assert.equal(session.phase,'kit-shop');
  session.restart();
  assert.equal(session.phase,'kit-shop');
  assert.equal(session.spent,0);
  assert.deepEqual(session.loadout().items,[]);
  assert.equal(session.buy(0),true);
});
test('preview purchases from an exported shop never write back to the pack',()=>{
  const location=Pack.location('home');location.kits=['trail'];
  const document=JSON.parse(fs.readFileSync(path.join(__dirname,'../templates/trail-kit.json'),'utf8'));
  const output=build({keepKits:false,locations:[location],kits:[{id:'trail',path:'trail',included:true}]},{kits:[{id:'trail',document,warnings:[]}],intros:[]});
  assert.deepEqual(output.errors,[]);
  const source=Flow.catalog(output,bundled),before=structuredClone(output),session=new Flow.Session(source);
  session.choose(source.spawns[0].id);session.next();session.next();
  assert.equal(session.phase,'kit-shop');
  assert.equal(source.kits[0].shop.offers.length,25);
  assert.equal(session.buy(24),true);
  assert.equal(session.loadout().items[0].item.id,'minecraft:torch');
  assert.deepEqual(source.kits[0].items,[]);
  assert.deepEqual(output,before);
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
  assets.push(['selection_dissolve.fsh','shaders/core/selection_dissolve.fsh']);
  for(const name of ['tab_button','tab_button_selected','empty_slot','send_request'])assets.push([name+'.png','textures/gui/selection/'+name+'.png']);
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

test('location browsing crosses pages and clamps to the last card on a short page',()=>{
  assert.equal(Flow.browseLocation(23,9,1),10);
  assert.equal(Flow.browseLocation(23,10,-1),9);
  assert.equal(Flow.browseLocation(23,17,1,true),22);
  assert.equal(Flow.browseLocation(23,22,-1,true),12);
  assert.equal(Flow.browseLocation(23,22,1),22);
});
test('a rejected pool destination leaves kit confirmation available for retry',()=>{
  const source=choices();source.spawns[0]={...source.spawns[0],type:'pool',pool:[{type:'fixed',x:0,y:64,z:0}]};
  const session=new Flow.Session(source);session.choose('pack:home');session.next();session.next();
  assert.throws(()=>session.next(4),/available pool destination/);
  assert.equal(session.phase,'kit-confirm');assert.equal(session.arrival,null);
  session.next(0);assert.equal(session.phase,'loading');assert.equal(session.arrival.y,64);
});
test('simulated parties expose the companion and party size to the review and intro',()=>{
  const {spawns:[spawn],kits:[kit]}=choices();
  const names=Flow.context(spawn,kit,'Player',Flow.locations(spawn),{},['Alex']);
  assert.equal(names.party_size,'2');assert.equal(names.party_leader,'Player');
  assert.equal(Flow.companionNames(['Alex','Ari','Efe']),'Alex, Ari, and Efe');
  const segments=Flow.narration('Player',names,kit);
  assert.equal(segments.at(-2).text,' You will arrive with Alex...');
  assert.deepEqual(segments.at(-2).highlight,[22,4]);
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

test('review highlights match the player, normalized place and equipment components',()=>{
  for(const [player,names,kit,expected] of [
    ['the',{biome:'Plains',structure:'Village Plains'},{title:'the',items:[{index:0,item:{id:'minecraft:bread'}}]},['the','the village','the']],
    ['Alex',{biome:'The End',structure:'Wilderness'},{title:'Unused',items:[]},['Alex','the end','nothing but your own two hands']],
    ['Alex\u{1f600}',{biome:'Forest',structure:'Ruined Portal Desert'},{title:'Alex\u{1f600}',items:[{index:0,item:{id:'minecraft:bread'}}]},['Alex\u{1f600}','the ruined portal','Alex\u{1f600}']]
  ]){
    const segments=Flow.narration(player,names,kit);
    assert.deepEqual(segments.filter(segment=>segment.highlight).map(segment=>{const [start,length]=segment.highlight;return Array.from(segment.text).slice(start,start+length).join('');}),expected);
  }
});
