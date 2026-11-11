'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
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
