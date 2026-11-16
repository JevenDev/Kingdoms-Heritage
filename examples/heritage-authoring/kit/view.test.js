'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Stats=require('./stats.js');Stats.configure(require('./assets/attributes.json'),require('./assets/durability.json'));
function surface(){
  const nodes=[];
  function element(){return {style:{},children:[],classList:{add(){},toggle(){}},setAttribute(){},append(...children){this.children.push(...children);},remove(){this.removed=true;}};}
  const body=element(),document={body,currentScript:{src:'https://example.test/kit/view.js'},addEventListener(){},createElement(){const node=element();nodes.push(node);return node;}};
  const context=vm.createContext({document,window:{addEventListener(){}},URL,matchMedia:()=>({matches:false}),HeritageKit:{items:new Map([['minecraft:diamond_sword',{page:0,x:0,y:0}]]),normalize:id=>id},HeritageItemText:{},HeritageKitStats:Stats});
  vm.runInContext(fs.readFileSync(require.resolve('./view.js'),'utf8'),context);
  return {view:context.HeritageInventory,body};
}
const sword={id:'minecraft:diamond_sword',components:{'minecraft:damage':780}};
test('inventory items draw native durability bars beneath damaged equipment',()=>{
  const {view}=surface(),fills=[],ctx={drawImage(){},fillRect(...rect){fills.push([this.fillStyle,...rect]);}};
  view.item(ctx,sword,10,20);
  assert.deepEqual(fills[0],['#000',12,33,13,2]);assert.deepEqual(fills[1].slice(1),[12,33,7,1]);
  fills.length=0;view.item(ctx,{...sword,components:{}},10,20);assert.equal(fills.length,0);
});
test('damaged equipment can be carried and released without affecting its components',()=>{
  const {view,body}=surface(),before=JSON.stringify(sword);
  view.setCursor(sword);const ghost=body.children[0];assert.equal(ghost.children.length,1);
  view.setCursor(null);assert.equal(ghost.removed,true);assert.equal(JSON.stringify(sword),before);
});
