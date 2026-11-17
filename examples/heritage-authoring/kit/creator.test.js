'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('./catalog.js');
const K=require('./engine.js');
require('./equipment-data.js');
const E=require('./equipment.js'),M=require('./mouse.js');
const source=fs.readFileSync(require.resolve('./creator.js'),'utf8');
function editor(items){
  const documentState={title:'Sorcerer',items},fields=new Map(),parsed=K.inspect(JSON.stringify(documentState));
  const field=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,selectionStart:0,selectionEnd:0,scrollTop:0,setSelectionRange(){},addEventListener(type,listener){this[type]=listener;}});return fields.get(id);};
  field('kit-json').value=JSON.stringify(documentState);
  const context=vm.createContext({K,E,M,$:field,documentState,validDocument:{title:'Previous kit',items:[]},selected:0,carried:null,rawInvalid:false,errorState:parsed.error?{message:parsed.error.message,path:parsed.error.path,target:'kit-json',validation:true}:null,drafts:new Map(),selectedSlots:new Set(),selectionMode:false,historyGroup:null,
    view:{entry:slot=>E.entryAt(context.documentState,slot),select(){}},
    notice:message=>{context.message=message;},renderInventory(){},slotFields:()=>{context.details=E.entryAt(context.documentState,context.selected);},display:()=>context.slotFields(),feedback(){},record(){},scheduleSave(){},source:()=>field('kit-json').value,
    sourceError:error=>({message:error.message,path:error.path,target:'kit-json',validation:true})});
  for(const name of ['canEdit','selectSlot','attempt','fail','checkDraft','applyMouse','clickSlot','commit','parse']){
    const match=source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));assert.ok(match,name);vm.runInContext(match[0],context);
  }
  const start=source.indexOf("$('ignore-stack-limits').addEventListener('change',"),end=source.indexOf("\n$('undo').addEventListener",start);
  assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
  return {context,field};
}
const stew=(index=7)=>({index,item:{id:'minecraft:mushroom_stew',count:3}});

test('clicking an oversized hotbar stack opens its details without losing the invalid item',()=>{
  for(const event of [{},{button:1}]){
    const item=stew(),{context}=editor([item]),before=JSON.stringify(context.documentState);
    context.clickSlot(7,event);
    assert.equal(context.selected,7);assert.equal(context.details.item.id,item.item.id);
    assert.equal(context.details.item.count,3);assert.equal(context.carried,null);
    assert.equal(JSON.stringify(context.documentState),before);assert.ok(context.errorState.validation);
  }
});

test('ignore stack limit repairs the clicked item while retaining other validation errors',()=>{
  const {context,field}=editor([stew(),stew(8)]);
  for(const slot of [7,8]){
    context.clickSlot(slot);assert.equal(context.selected,slot);assert.equal(context.carried,null);
    field('ignore-stack-limits').checked=true;field('ignore-stack-limits').change();
    assert.equal(E.entryAt(context.documentState,slot).ignore_stack_limit,true);
    assert.equal(E.entryAt(context.documentState,slot).item.count,3);
    if(slot===7)assert.ok(context.errorState.validation);
  }
  assert.equal(context.errorState,null);assert.doesNotThrow(()=>K.read(field('kit-json').value));
  context.clickSlot(7);assert.equal(context.carried.entry.item.count,3);
  assert.equal(context.carried.entry.ignore_stack_limit,true);
});

test('valid stacks still support pickup and placement',()=>{
  const {context}=editor([{index:7,item:{id:'minecraft:stone',count:3}}]);
  context.clickSlot(7);assert.equal(context.selected,7);assert.equal(context.carried.entry.item.count,3);
  assert.equal(E.entryAt(context.documentState,7),undefined);
  context.clickSlot(8);assert.equal(context.selected,8);assert.equal(context.carried,null);
  assert.equal(E.entryAt(context.documentState,8).item.count,3);
});

test('unfinished count and malformed JSON errors keep their editing guards',()=>{
  for(const rawInvalid of [false,true]){
    const {context}=editor([stew()]);context.rawInvalid=rawInvalid;
    context.errorState={target:'count',slot:0,message:'Invalid count'};
    context.clickSlot(7);assert.equal(context.selected,0);assert.equal(context.carried,null);
    assert.equal(context.documentState.items[0].item.count,3);
  }
});

test('inventory modes share a width budget including custom and cosmetic slots',()=>{
  const documentState={items:[]},state={profiles:E.defaults(),cosmetics:{curios:false,accessories:false}},view={set(){}};
  let mode='player';
  const context=vm.createContext({E,documentState,selected:0,rawInvalid:true,invalidStats:()=>false,view,preview:{state,reveal(){},sync:()=>({mode,profiles:state.profiles,cosmetics:state.cosmetics[mode]??false})}});
  vm.runInContext(source.match(/^function renderInventory\([^]*?^\}/m)[0],context);
  for(const custom of [false,true])for(const cosmetics of [false,true]){
    if(custom)state.profiles.curios=[{name:'ring',count:48,order:0}];
    state.cosmetics.accessories=cosmetics;
    const widths=[];
    for(mode of ['player','curios','accessories']){
      context.renderInventory();widths.push(view.scaleWidth);
      assert.ok(view.scaleWidth>=E.layout(documentState,{mode,profiles:state.profiles,cosmetics:state.cosmetics[mode]??false}).width);
    }
    assert.equal(new Set(widths).size,1);
  }
});
