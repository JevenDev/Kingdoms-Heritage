'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {zip}=require('../pack/zip.js'),ModItems=require('./mod-items.js');
const json=value=>JSON.stringify(value);
function jar(name,entries){
  const data=zip(Object.entries(entries).map(([path,content])=>({path,content})));
  return {name,size:data.length,arrayBuffer:async()=>data.buffer};
}

test('indexes item model IDs with corroborating names or recipe results',async()=>{
  const named=jar('example.jar',{
    'assets/example/lang/en_us.json':json({
      'item.example.tools.hammer':'Hammer',
      'block.example.lantern':'Hanging Lantern',
      'block.example.wall_lantern':'Wall Lantern',
      'item.example.tools.hammer.tooltip':'A heavy hammer'
    }),
    'assets/example/models/item/tools/hammer.json':'{}',
    'assets/example/models/item/tools/hammer_pulling.json':'{}',
    'assets/example/models/item/lantern.json':'{}',
    'assets/example/models/item/lead_gear.json':'{}',
    'assets/example/models/item/not_the_result.json':'{}',
    'data/example/recipe/lead_gear.json':json({result:{id:'example:lead_gear'}}),
    'data/example/recipe/not_the_result.json':json({result:{id:'example:lead_gear'}})
  });
  const unnamed=jar('second.jar',{
    'assets/second/models/item/copper_tool.json':'{}',
    'assets/minecraft/models/item/stone.json':'{}'
  });
  const invalid={name:'bad.jar',size:1,arrayBuffer:async()=>new ArrayBuffer(1)};
  const {items,failures}=await ModItems.read([invalid,named,unnamed]);
  assert.deepEqual(items.map(({id,name,block})=>[id,name,block]),[
    ['example:tools/hammer','Hammer',false],
    ['example:lantern','Hanging Lantern',true],
    ['example:lead_gear','Lead Gear',false],
    ['second:copper_tool','Copper Tool',false]
  ]);
  assert.equal(failures.length,1);
  assert.match(failures[0],/^bad\.jar/);
});

test('indexes large JAR directories without extracting unrelated entries',async()=>{
  const entries=Object.fromEntries(Array.from({length:5000},(_,index)=>['example/Class'+index+'.class','ignored']));
  entries['assets/example/models/item/wrench.json']='{}';
  const {items,failures}=await ModItems.read([jar('large.jar',entries)]);
  assert.deepEqual(failures,[]);
  assert.deepEqual(items.map(item=>item.id),['example:wrench']);
});

test('resolves inherited flat layers and uses child texture overrides',async()=>{
  const encoder=new TextEncoder();
  const files={
    'assets/example/models/item/wrench.json':{parent:'library:item/base',textures:{material:'example:item/wrench'}},
    'assets/library/models/item/base.json':{parent:'item/handheld',textures:{layer0:'#material',material:'library:item/base',layer1:'library:item/highlight'}}
  };
  const read=async path=>files[path]&&encoder.encode(json(files[path]));
  assert.deepEqual(await ModItems.iconLayers(read,'assets/example/models/item/wrench.json'),[
    'assets/example/textures/item/wrench.png',
    'assets/library/textures/item/highlight.png'
  ]);
  files['assets/example/models/item/wrench.json'].textures.material='#layer0';
  assert.equal(await ModItems.iconLayers(read,'assets/example/models/item/wrench.json'),undefined);
  files['assets/example/models/item/wrench.json'].parent='example:item/wrench';
  assert.equal(await ModItems.iconLayers(read,'assets/example/models/item/wrench.json'),undefined);
  files['assets/example/models/item/wrench.json']={loader:'example:custom',parent:'item/generated',textures:{layer0:'example:item/wrench'}};
  assert.equal(await ModItems.iconLayers(read,'assets/example/models/item/wrench.json'),undefined);
});
