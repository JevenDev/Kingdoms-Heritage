'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
require('./catalog.js');
const Kit=require('./engine.js'),Stats=require('./stats.js');
require('./equipment-data.js');
const Equipment=require('./equipment.js'),Mouse=require('./mouse.js');

const listedPurse=purse=>'{"title":"Starter","items":[],"starting_resources":{"numismaticoverhaul:purse":'+purse+'}}';
const readPurse=purse=>Kit.read(listedPurse(purse)).document;
const purse=kit=>kit.starting_resources?.[Stats.purseId];
const exactBalance=kit=>{
  const {gold,silver,bronze}=Stats.purseCounts(kit);
  return BigInt(gold)*10_000n+BigInt(silver)*100n+BigInt(bronze);
};

test('visual coin edits accept a legacy numeric grant and export separate counts',()=>{
  const kit=readPurse('20325');
  assert.equal(purse(kit),20325);
  assert.deepEqual(Stats.purseCounts(kit),{gold:2,silver:3,bronze:25});
  Stats.setCoin(kit,'silver','4');
  assert.deepEqual(purse(kit),{gold:2,silver:4,bronze:25});
  Stats.setCoin(kit,'gold','0');
  Stats.setCoin(kit,'silver','');
  Stats.setCoin(kit,'bronze','0');
  assert.equal(kit.starting_resources,undefined);
});

test('the inventory purse uses normalized coins and only appears in a funded player inventory',()=>{
  const kit=readPurse('{"silver":100,"bronze":125}');
  const purse=Stats.pursePreview(kit);
  assert.deepEqual(purse,[['gold',1],['silver',1],['bronze',25]]);
  const [control]=Equipment.layout(kit,{purse}).controls;
  assert.deepEqual(control,{key:'purse',kind:'purse',label:'Purse',x:160,y:5,width:11,height:13});
  for(const mode of ['curios','accessories']){
    assert.equal(Equipment.layout(kit,{mode,purse}).controls.some(control=>control.kind==='purse'),false);
  }
  assert.deepEqual(Stats.pursePreview(readPurse('{"gold":0,"bronze":0}')),[]);
  assert.deepEqual(Stats.pursePreview(readPurse('{"gold":2147483648}')),[['gold',2147483647]]);
  assert.deepEqual(Equipment.layout(readPurse('0'),{purse:[]}).controls,[]);
  assert.deepEqual(Equipment.layout({...kit,enabled:false},{purse}).controls,[]);
});

test('withdrawing from a kit purse merges coin stacks and preserves currency',()=>{
  const kit=readPurse('125');
  kit.items.push({index:0,item:{id:Stats.coinId('bronze'),count:97}});
  const next=Mouse.withdrawPurse(kit,105n);
  assert.equal(Stats.purseBalance(next),20n);
  assert.deepEqual(Kit.itemAt(next,0),{id:Stats.coinId('bronze'),count:99});
  assert.deepEqual(Kit.itemAt(next,1),{id:Stats.coinId('silver'),count:1});
  assert.deepEqual(Kit.itemAt(next,2),{id:Stats.coinId('bronze'),count:3});
  assert.equal(Stats.purseBalance(kit),125n);
  assert.equal(Kit.itemAt(kit,0).count,97);
  assert.throws(()=>Mouse.withdrawPurse(kit,126n),/purse balance/);
  assert.throws(()=>Mouse.withdrawPurse(kit,105n,slot=>slot===0),/Make room/);
  assert.equal(Kit.itemAt(kit,0).count,97);
});

test('large purse amounts survive JSON reformatting and visual edits exactly',()=>{
  for(const raw of ['9223372036854775807','{"bronze":9223372036854775807}','{"bronze":92233720368547758.07e2}']){
    const kit=readPurse(raw);
    assert.deepEqual(purse(kit),{gold:922337203685477,silver:58,bronze:7});
    assert.equal(exactBalance(Kit.read(JSON.stringify(kit)).document),9_223_372_036_854_775_807n);
    assert.throws(()=>Stats.setCoin(kit,'bronze','8'),/64-bit/);
  }
  const kit=readPurse('{}');
  Stats.setCoin(kit,'bronze','9007199254740993');
  assert.equal(exactBalance(kit),9_007_199_254_740_993n);
  assert.deepEqual(purse(readPurse('{"silver":100}')),{silver:100});
});

test('purse validation identifies the invalid denomination and rejects overflow',()=>{
  for(const [raw,field] of [
    ['{"silver":0.5}','silver'],['{"bronze":1.00000000000000001}','bronze'],['{"gold":-1}','gold'],
    ['{"gold":"42"}','gold'],['{"platinum":1}','platinum'],['{"gold":922337203685478}',Stats.purseId],
    ['9223372036854775808',Stats.purseId]
  ]){
    assert.throws(()=>readPurse(raw),error=>error.path.at(-1)===field);
  }
});

test('stat edits use Minecraft attribute IDs and operations and clear only the requested bonus',()=>{
  const armor={attribute:'generic.armor',amount:4,operation:'add_multiplied_base'};
  const starter={title:'Starter',items:[],starting_health:1,starting_hunger:0,attributes:[armor]};
  Stats.setModifier(starter,Stats.armor,'5');
  Stats.setModifier(starter,Stats.maxHealth,'4','add_value');
  Stats.setModifier(starter,'neoforge:swim_speed','0.2','add_multiplied_total');
  assert.deepEqual(Kit.read(JSON.stringify(starter)).document,{
    title:'Starter',items:[],starting_health:1,starting_hunger:0,attributes:[
      {...armor,amount:5},
      {attribute:'minecraft:generic.max_health',amount:4,operation:'add_value'},
      {attribute:'neoforge:swim_speed',amount:0.2,operation:'add_multiplied_total'}
    ]
  });
  Stats.setModifier(starter,Stats.maxHealth,'');
  assert.equal(starter.attributes.length,2);
  assert.equal(Stats.modifier(starter,Stats.armor).amount,5);
});

test('invalid stats report the path for the JSON editor',()=>{
  for(const [fields,expected] of [
    [{starting_health:0},['starting_health']],
    [{starting_hunger:21},['starting_hunger']],
    [{attributes:[{attribute:'generic.armor',amount:4},{attribute:'minecraft:generic.armor',amount:2}]},['attributes',1,'attribute']],
    [{attributes:[{attribute:'example:mana',amount:20,operation:'multiply'}]},['attributes',0,'operation']]
  ]){
    assert.throws(()=>Kit.read(JSON.stringify({title:'Starter',items:[],...fields})),error=>{
      assert.deepEqual(error.path,expected);return true;
    });
  }
});

Stats.configure(require('./assets/attributes.json'),require('./assets/durability.json'));
const worn=(index,id,components)=>({index,item:{id,components}});
const bonus=(attribute,amount,operation='add_value')=>({attribute,amount,operation});
const custom=(type,amount,operation='add_value',slot='any',id='test:bonus')=>({type,id,amount,operation,slot});

test('stat previews include equipped armor and fresh player health and hunger',()=>{
  const kit={items:[worn(38,'minecraft:leather_chestplate'),worn(0,'minecraft:diamond_helmet')]},before=JSON.stringify(kit);
  assert.deepEqual(Stats.preview(kit),{armor:3,health:20,maxHealth:20,hunger:20,bonuses:[],unknown:[]});
  assert.equal(JSON.stringify(kit),before);
  kit.items[1].index=39;assert.equal(Stats.preview(kit).armor,6);
});

test('stat previews apply additions then adjusted base and total multipliers before native clamping',()=>{
  const kit={starting_health:70,starting_hunger:7,items:[worn(38,'minecraft:iron_chestplate',{'minecraft:attribute_modifiers':{modifiers:[custom(Stats.maxHealth,10),custom(Stats.maxHealth,.5,'add_multiplied_base','chest','test:base')]}})],attributes:[bonus(Stats.maxHealth,.5,'add_multiplied_total'),bonus(Stats.armor,40)]};
  const value=Stats.preview(kit);assert.equal(value.maxHealth,67.5);assert.equal(value.health,67.5);assert.equal(value.armor,30);assert.equal(value.hunger,7);
  kit.attributes=[bonus(Stats.maxHealth,-100),bonus(Stats.armor,-10)];assert.equal(Stats.preview(kit).maxHealth,1);assert.equal(Stats.preview(kit).armor,0);
});

test('explicit components replace defaults, respect slot groups and replace duplicate modifier IDs',()=>{
  const modifiers=[custom(Stats.armor,4,'add_value','hand')];
  const kit={selected_slot:2,items:[worn(38,'minecraft:diamond_chestplate',{'minecraft:attribute_modifiers':[]}),worn(2,'minecraft:stick',{'minecraft:attribute_modifiers':modifiers}),worn(40,'minecraft:stick',{'minecraft:attribute_modifiers':modifiers})]};
  assert.equal(Stats.preview(kit).armor,4);kit.items[2].index=5;assert.equal(Stats.preview(kit).armor,4);kit.selected_slot=0;assert.equal(Stats.preview(kit).armor,0);
  kit.items=[worn(38,'minecraft:diamond_chestplate',{'!minecraft:attribute_modifiers':{}})];assert.equal(Stats.preview(kit).armor,0);
});

test('extra attributes retain their operations and disabled kits have no grants',()=>{
  const kit={starting_health:10,starting_hunger:5,attributes:[bonus('generic.armor',2),bonus('generic.max_health',4),bonus('minecraft:generic.movement_speed',.2,'add_multiplied_total'),bonus('custom:mana',10)]};
  assert.deepEqual(Stats.preview(kit).bonuses,kit.attributes.slice(2));
  assert.deepEqual(Stats.preview({...kit,enabled:false}),Stats.preview({}));
});

test('unknown mod equipment is identified without inventing its native attributes',()=>{
  assert.deepEqual(Stats.preview({items:[worn(38,'custom:coat')]}).unknown,['custom:coat']);
  assert.deepEqual(Stats.preview({items:[worn(38,'custom:coat',{'minecraft:attribute_modifiers':[]})]}).unknown,[]);
});

test('stat icons stay synchronized with the game sprites',()=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const name of ['armor','health','hunger','info'])assert.deepEqual(fs.readFileSync(path.join(__dirname,'assets/stats',name+'.png')),fs.readFileSync(path.join(__dirname,'../../../src/main/resources/assets/kingdomsheritage/textures/gui/sprites/kit/stat_icon_'+name+'.png')));
});

test('damaged item previews use native durability defaults, overrides and unbreakable rules',()=>{
  const sword={id:'minecraft:diamond_sword',components:{'minecraft:damage':780}};
  assert.equal(Stats.durability(sword).maximum,1561);assert.equal(Stats.durability(sword).width,7);
  sword.components['minecraft:max_damage']=1000;assert.equal(Stats.durability(sword).remaining,220);
  sword.components['minecraft:unbreakable']={};assert.equal(Stats.durability(sword),null);
  assert.equal(Stats.durability({id:'minecraft:stick',components:{'minecraft:damage':1}}),null);
});
