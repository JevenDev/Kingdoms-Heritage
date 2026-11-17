'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Sidebar=require('./sidebar.js');
function setup(saved=null){
  const events=new Map(),attributes=new Map(),styles=new Map(),storage=new Map(),classes=new Set(),reports=[];let captured=null,resize,mutate;
  if(saved!==null)storage.set('heritage.packSidebar.v1',saved);
  const handle={setAttribute:(key,value)=>attributes.set(key,value),addEventListener:(name,run)=>events.set(name,run),focus(){},setPointerCapture:id=>captured=id,hasPointerCapture:id=>captured===id,releasePointerCapture:()=>captured=null};
  const workspace={clientWidth:1400,style:{setProperty:(key,value)=>styles.set(key,value)}},sidebar={parentElement:workspace,after:node=>assert.equal(node,handle)};
  const body={dataset:{workspaceStep:'locations'},classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)}};
  const context=vm.createContext({module:{exports:{}},document:{getElementById:()=>sidebar,createElement:()=>handle,body},matchMedia:()=>({matches:true,addEventListener(){}}),localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},MutationObserver:class{constructor(fn){mutate=fn;}observe(){}},window:{addEventListener:(name,run)=>events.set(name,run)}});
  vm.runInContext(fs.readFileSync(require.resolve('./sidebar.js'),'utf8'),context);context.module.exports.create(message=>reports.push(message));
  return {workspace,storage,classes,reports,body,resize:()=>resize(),mutate:()=>mutate(),captured:()=>captured,width:()=>attributes.get('aria-valuenow'),fire:(name,values={})=>events.get(name)({button:0,pointerId:1,clientX:300,preventDefault(){},stopPropagation(){},...values})};
}
test('sidebar limits preserve editor space and clamp extreme widths',()=>{
  for(const total of [0,500,900,1200,1920]){
    const {min,max}=Sidebar.bounds(total);assert.ok(min>=0&&min<=max&&max<=600);
    assert.equal(Sidebar.fit(-Infinity,total),min);assert.equal(Sidebar.fit(Infinity,total),max);
    if(total>=860)assert.ok(total-max-20>=640);
  }
});
test('dragging saves the width, arrow keys adjust it and double-click resets it',()=>{
  const app=setup();assert.equal(app.width(),248);app.fire('pointerdown');app.fire('pointermove',{clientX:400});assert.equal(app.width(),348);assert.equal(app.classes.has('pack-sidebar-resizing'),true);app.fire('pointerup');assert.equal(app.storage.get('heritage.packSidebar.v1'),'348');assert.equal(app.captured(),null);
  app.fire('keydown',{key:'ArrowRight'});assert.equal(app.width(),358);app.fire('keydown',{key:'ArrowLeft',shiftKey:true});assert.equal(app.width(),318);
  app.fire('keydown',{key:'End'});assert.equal(app.width(),600);app.fire('keydown',{key:'Home'});assert.equal(app.width(),200);
  app.fire('dblclick');assert.equal(app.width(),248);assert.equal(app.storage.has('heritage.packSidebar.v1'),false);
});
test('cancelling a drag restores the width without saving it',()=>{
  for(const event of ['pointercancel','lostpointercapture','blur','keydown']){
    const app=setup('320');app.fire('pointerdown');app.fire('pointermove',{clientX:440,pointerId:2});assert.equal(app.width(),320);app.fire('pointermove',{clientX:440});assert.equal(app.width(),460);app.fire(event,{key:'Escape'});
    assert.equal(app.width(),320);assert.equal(app.storage.get('heritage.packSidebar.v1'),'320');assert.equal(app.classes.has('pack-sidebar-resizing'),false);assert.equal(app.captured(),null);
  }
});
test('window resizing and sidebar collapse retain the saved preferred width',()=>{
  const app=setup('550');app.workspace.clientWidth=1000;app.resize();assert.equal(app.width(),340);assert.equal(app.storage.get('heritage.packSidebar.v1'),'550');app.workspace.clientWidth=1600;app.resize();assert.equal(app.width(),550);
  app.fire('pointerdown');app.fire('pointermove',{clientX:320});app.classes.add('content-browser-collapsed');app.mutate();assert.equal(app.classes.has('pack-sidebar-resizing'),false);app.classes.delete('content-browser-collapsed');app.mutate();assert.equal(app.width(),550);
  app.body.dataset.workspaceStep='export';app.mutate();app.fire('keydown',{key:'Home'});assert.equal(app.width(),550);
});
test('invalid stored widths report an error and use the default',()=>{
  for(const saved of ['null','false','-1','{}','not json']){
    const app=setup(saved);assert.equal(app.width(),248);assert.equal(app.reports.length,saved==='null'?0:1);
  }
});
