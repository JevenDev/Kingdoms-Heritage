'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Editing=require('./editing.js'),Pack=require('./engine.js');

test('capturing an edit reads the workspace once and refreshes undo controls',()=>{
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id))nodes.set(id,{dataset:{},append(){},before(){},addEventListener(){},setAttribute(){}});
    return nodes.get(id);
  };
  const document={getElementById:node,createElement:()=>node(Symbol()),querySelectorAll:()=>[],addEventListener(){}};
  const context=vm.createContext({document,HeritageEditing:Editing,Option:class {}});
  vm.runInContext(fs.readFileSync(require.resolve('./authoring.js'),'utf8'),context);
  const pack={name:'Test',locations:[Pack.location('home')],kits:[]},libraries={kits:null,intros:null};let reads=0;
  const tools=context.HeritagePackAuthoring.create({read(){reads++;return {id:'test',pack,libraries};}});
  assert.equal(reads,1);assert.equal(node('pack-undo').disabled,true);
  pack.name='Renamed';reads=0;tools.capture({label:'Rename pack'});
  assert.equal(reads,1);assert.equal(node('pack-undo').disabled,false);assert.equal(node('pack-redo').disabled,true);assert.match(node('pack-undo').dataset.tooltip,/rename pack/);
  reads=0;tools.refresh();assert.equal(reads,1);assert.equal(node('pack-undo').disabled,false);
});

test('typing batches refreshes and flushes the latest edit before leaving a field',()=>{
  const timers=new Map();let next=0,now=0,value='',applied=[];
  const context=vm.createContext({setTimeout(callback,delay){timers.set(++next,{callback,at:now+delay});return next;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(require.resolve('./authoring.js'),'utf8'),context);
  const updates=context.HeritagePackAuthoring.updates(()=>applied.push(value));
  const advance=amount=>{now+=amount;for(const [id,timer] of timers)if(timer.at<=now){timers.delete(id);timer.callback();}};
  for(const letter of 'typing'){value+=letter;updates.schedule();advance(50);}
  assert.deepEqual(applied,[]);assert.equal(timers.size,1);advance(99);assert.deepEqual(applied,[]);advance(1);assert.deepEqual(applied,['typing']);
  value='next field';updates.schedule();assert.equal(updates.flush(),true);assert.deepEqual(applied,['typing','next field']);assert.equal(timers.size,0);advance(200);assert.equal(updates.flush(),false);assert.equal(applied.length,2);
});
