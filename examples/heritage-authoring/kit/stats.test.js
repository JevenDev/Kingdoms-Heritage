'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
require('./catalog.js');
const Kit=require('./engine.js'),Stats=require('./stats.js');
require('./equipment-data.js');
const Equipment=require('./equipment.js');

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
  assert.deepEqual(control,{key:'purse',kind:'purse',label:'Edit Numismatic purse',x:160,y:5,width:11,height:13});
  for(const mode of ['curios','accessories']){
    assert.equal(Equipment.layout(kit,{mode,purse}).controls.some(control=>control.kind==='purse'),false);
  }
  assert.deepEqual(Stats.pursePreview(readPurse('{"gold":0,"bronze":0}')),[]);
  assert.deepEqual(Equipment.layout(readPurse('0'),{purse:[]}).controls,[]);
  assert.deepEqual(Equipment.layout({...kit,enabled:false},{purse}).controls,[]);
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
