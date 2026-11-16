'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('./catalog.js');globalThis.HeritageKit=require('./engine.js');globalThis.HeritageKitStats=require('./stats.js');HeritageKitStats.configure(require('./assets/attributes.json'),require('./assets/durability.json'));
const T=require('./text.js');T.configure(require('./assets/text.json'));
const lines=stack=>T.tooltip(stack).map(T.plain).join('\n');
test('item previews show enchantments, attributes, unbreakable state and durability',()=>{
  const value=lines({id:'minecraft:diamond_sword',components:{'minecraft:enchantments':{'minecraft:sharpness':5},'minecraft:unbreakable':{},'minecraft:damage':5,'minecraft:max_damage':100}});
  assert.match(value,/Sharpness V/);assert.match(value,/7 Attack Damage/);assert.match(value,/1.6 Attack Speed/);assert.match(value,/Unbreakable/);assert.doesNotMatch(value,/Durability/);assert.match(lines({id:'minecraft:diamond_sword',components:{'minecraft:damage':5}}),/1556 \/ 1561/);
});
test('item preview tooltip visibility flags and explicit empty modifiers override defaults',()=>{
  const value=lines({id:'minecraft:diamond_sword',components:{'minecraft:enchantments':{levels:{'minecraft:sharpness':5},show_in_tooltip:false},'minecraft:unbreakable':{show_in_tooltip:false},'minecraft:attribute_modifiers':[]}});
  assert.doesNotMatch(value,/Sharpness|Attack Damage|Unbreakable/);
  assert.equal(lines({id:'minecraft:diamond_sword',components:{'minecraft:hide_tooltip':{}}}),'');
});
test('item preview attributes retain custom names, signs, operation and slot group',()=>{
  const value=lines({id:'minecraft:stick',components:{'minecraft:attribute_modifiers':{modifiers:[{id:'test:speed',type:'minecraft:generic.movement_speed',amount:-.2,operation:'add_multiplied_total',slot:'offhand'}]}}});
  assert.match(value,/Off Hand/);assert.match(value,/-20% Speed/);
});
