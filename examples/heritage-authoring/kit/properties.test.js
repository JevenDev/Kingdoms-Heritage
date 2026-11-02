'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./properties.js');
test('property edits preserve unrelated mod components and tooltip flags',()=>{
  const original={'custom:data':{nested:[1,2]},'minecraft:unbreakable':{show_in_tooltip:false}},next=P.update(original,'damage','12');assert.equal(next['minecraft:damage'],12);assert.deepEqual(next['custom:data'],original['custom:data']);assert.deepEqual(P.update(next,'unbreakable',true)['minecraft:unbreakable'],{show_in_tooltip:false});assert.equal(original['minecraft:damage'],undefined);
});
test('returning a property to its default removes only that override',()=>{
  const result=P.update({'minecraft:damage':12,'minecraft:rarity':'epic'},'damage','');assert.deepEqual(result,{'minecraft:rarity':'epic'});assert.deepEqual(P.update({'!minecraft:damage':{}},'damage','3'),{'minecraft:damage':3});
});
test('enchantments preserve full-codec tooltip flags and accept shorthand codec maps',()=>{
  const full=P.enchant({'minecraft:enchantments':{levels:{'minecraft:sharpness':1},show_in_tooltip:false}},'minecraft:enchantments',[{id:'sharpness',level:5}]);assert.deepEqual(full['minecraft:enchantments'],{levels:{'minecraft:sharpness':5},show_in_tooltip:false});
  const short=P.enchant({'minecraft:enchantments':{'minecraft:sharpness':1}},'minecraft:enchantments',[{id:'custom:keen',level:255}]);assert.deepEqual(short['minecraft:enchantments'],{'custom:keen':255});assert.deepEqual(P.levels(short,'minecraft:enchantments'),{'custom:keen':255});
});
test('book enchantments are separate from applied item enchantments',()=>{
  const result=P.enchant({'minecraft:enchantments':{levels:{'minecraft:sharpness':2}}},'minecraft:stored_enchantments',[{id:'minecraft:mending',level:1}]);assert.equal(result['minecraft:enchantments'].levels['minecraft:sharpness'],2);assert.equal(result['minecraft:stored_enchantments'].levels['minecraft:mending'],1);
});
test('property validation matches the native integer, stack and enchantment ranges',()=>{
  assert.throws(()=>P.validate({'minecraft:damage':-1}),/whole number/);assert.throws(()=>P.validate({'minecraft:max_damage':100},64),/stack size of 1/);assert.throws(()=>P.validate({'minecraft:max_stack_size':100}),/whole number/);assert.throws(()=>P.enchant({},'minecraft:enchantments',[{id:'minecraft:sharpness',level:256}]),/0 to 255/);assert.throws(()=>P.enchant({},'minecraft:enchantments',[{id:'sharpness',level:1},{id:'minecraft:sharpness',level:2}]),/only once/);assert.doesNotThrow(()=>P.validate({'minecraft:max_damage':2147483647,'minecraft:max_stack_size':1,'minecraft:damage':0}));
});
