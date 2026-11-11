'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Pack=require('../pack/engine.js');
require('./catalog.js');
const Kit=require('./engine.js');
const trail=require('../templates/trail-kit.json');

test('the Trail Kit example keeps its budget and second page of offers',()=>{
  const source={...trail};
  delete source.items;
  const {document,warnings}=Kit.read(JSON.stringify(source));
  assert.equal(Kit.canPreview(document),true);
  assert.deepEqual(document.items,[]);
  assert.deepEqual(document.shop,trail.shop);
  assert.equal(document.shop.offers.length,25);
  assert.equal(document.shop.offers[24].limit,3);
  assert.equal(document.shop.offers[2].limit,undefined);
  assert.deepEqual(warnings,[]);
});

test('shop validation reports invalid prices, stacks, and offer lists at their JSON paths',()=>{
  const shop=()=>structuredClone(trail);
  const check=(draft,path)=>assert.throws(()=>Kit.read(JSON.stringify(draft)),error=>assert.deepEqual(error.path,path)===undefined);
  let draft=shop();
  draft.shop.offers[0].cost=1.5;
  check(draft,['shop','offers',0,'cost']);
  draft=shop();
  draft.shop.offers[1].item.count=65;
  check(draft,['shop','offers',1,'item','count']);
  draft=shop();
  draft.shop.offers=[];
  check(draft,['shop','offers']);
  for(const limit of [0,42,1.5,null]){
    draft=shop();
    draft.shop.offers[24].limit=limit;
    check(draft,['shop','offers',24,'limit']);
  }
});

const Shop=require('./shop-editor.js');

test('shop editor starts a shop and removing its last offer returns to fixed gear',()=>{
  const fixed={title:'Scout',items:[{index:0,item:{id:'minecraft:map'}}]};
  const withShop=Shop.edit(fixed,{type:'add',id:' bread '});
  assert.deepEqual(Kit.read(JSON.stringify(withShop)).document.shop,{
    budget:12,offers:[{cost:1,item:{id:'minecraft:bread'}}]
  });
  assert.equal(fixed.shop,undefined);
  assert.deepEqual(Shop.edit(withShop,{type:'remove',index:0}),fixed);
});

test('shop edits preserve item data and follow game paging when offers cross page boundaries',()=>{
  let draft=structuredClone(trail);
  draft.shop.offers[24].item.components={'minecraft:custom_name':'"Camping Torches"'};
  for(const change of [{type:'budget',value:16},{type:'count',index:24,value:32},
    {type:'cost',index:24,value:3},{type:'limit',index:24,value:4},{type:'move',index:24,to:23}]){
    draft=Shop.edit(draft,change);
  }
  const {document}=Kit.read(JSON.stringify(draft));
  assert.equal(document.shop.budget,16);
  const pages=[Shop.paginate(document.shop.offers,0),Shop.paginate(document.shop.offers,2)];
  assert.equal(pages[0].offers.length,24);
  assert.equal(pages[1].index,1);
  assert.equal(pages[1].start,24);
  assert.equal(pages[1].offers[0].item.id,'minecraft:compass');
  assert.deepEqual(pages[0].offers[23],{cost:3,limit:4,item:{id:'minecraft:torch',count:32,components:{'minecraft:custom_name':'"Camping Torches"'}}});
});

test('budget hints flag unaffordable offers and partially affordable purchase limits',()=>{
  assert.deepEqual(Shop.budgetHint(6,8),{field:'cost',text:'Price exceeds the 6-point budget.'});
  assert.deepEqual(Shop.budgetHint(6,3,3),{field:'limit',text:'Budget covers 2 of 3 stacks.'});
  assert.deepEqual(Shop.budgetHint(0,1,3),{field:'cost',text:'Price exceeds the 0-point budget.'});
  assert.equal(Shop.budgetHint(0,0,41),null);
  assert.equal(Shop.budgetHint(6,6),null);
  assert.equal(Shop.budgetHint(6,2,3),null);
});
test('pack export keeps edited shop offers and their limits',()=>{
  const edited=Shop.edit(trail,{type:'budget',value:18});
  const draft=Kit.read(JSON.stringify(edited));
  const pack={name:'Shop pack',namespace:'test_shop',description:'A starting kit shop',keepKits:false,keepLocations:false,
    kits:[{id:'trail',included:true,path:'trail'}],locations:[Pack.location('start')]};
  const output=Pack.build(pack,{kits:[{id:'trail',...draft}],intros:[]});
  assert.deepEqual(output.errors,[]);
  const kit=output.files.find(file=>file.path==='data/test_shop/heritage/kits/trail.json');
  assert.deepEqual(JSON.parse(kit.content).shop,edited.shop);
});

test('the editor page preview uses the same panel texture as the mod',()=>{
  const native=path.resolve(__dirname,'../../../src/main/resources/assets/kingdomsheritage/textures/gui/selection/kit_shop.png');
  assert.deepEqual(fs.readFileSync(path.join(__dirname,'assets/shop.png')),fs.readFileSync(native));
});
