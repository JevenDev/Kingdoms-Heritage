'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Preview=require('../editor/engine.js');
async function monitor(){
  let inventory,draws=0;const painted=[];
  const node=()=>({style:{},dataset:{},parentElement:{},setAttribute(){},addEventListener(){},removeEventListener(){},after(){},remove(){},matches:()=>false});
  const canvas=()=>{const result={...node(),width:0,height:0,pixels:''};result.getContext=()=>({drawImage(image){result.pixels=image.pixels;}});return result;};
  const target={...node(),width:1920,height:1080,offsetLeft:0,offsetTop:0,clientWidth:960,clientHeight:540,getContext:()=>({setTransform(){},save(){},restore(){},drawImage(image){painted.push(image.pixels);}})};
  const document={createElement:tag=>tag==='canvas'?canvas():node(),addEventListener(){},removeEventListener(){}};
  class Inventory{
    constructor(){inventory=this;this.canvas=canvas();this.ready=true;this.layout={width:176,height:166};}
    set(kit){this.kit=kit;this.draw();}
    setRenderScale(scale){this.canvas.width=176*scale;this.canvas.height=166*scale;}
    draw(){draws++;this.canvas.pixels=(this.previewKit??this.kit)?.title;}
    preview(kit){if(!kit&&!this.previewKit)return;this.previewKit=kit;this.draw();}
  }
  const context=vm.createContext({document,P:Preview,load:async()=>{},HeritageCanvas:class {async load(){}},HeritageInventory:{Inventory,StatPanel:class {constructor(){this.element={};}set(){}place(){}}},
    HeritagePresentation:{KitCarousel:class {select(){}poses(bounds,width,count){return Array.from({length:count},(_,index)=>({index,scale:1,opacity:1,x:index*200,y:0,distance:0}));}}},
    ctx:null,renderer:null,viewport:null,scroll:0,bundled:{},clock:()=>1000,backgroundStarted:0,shader:null,rect(){},text(){},width:()=>0,literal:()=>[],label:kit=>kit.title,kitBudgetLabel:()=>'',reduceMotion:{matches:false}});
  const source=fs.readFileSync(require.resolve('./flow-preview.js'),'utf8');vm.runInContext(source.slice(source.indexOf('async function monitorPreview('),source.indexOf('const partyText=')),context);
  const view=await context.monitorPreview(target,{});
  return {draw(value){painted.length=0;view.draw({spawns:[],phase:'kits',kitPreview:'model',...value});return [...painted];},get draws(){return draws;},get inventory(){return inventory;}};
}

test('model preview frames are reused until their contents or render scale change',async()=>{
  const view=await monitor(),kits=[{id:'one',title:'One'},{id:'two',title:'Two'}],value={kit:kits[0],kits};
  assert.deepEqual(view.draw(value),['One','Two']);const draws=view.draws;
  assert.deepEqual(view.draw(value),['One','Two']);assert.equal(view.draws,draws);
  kits[1].title='Renamed';assert.deepEqual(view.draw(value),['One','Renamed']);assert.ok(view.draws>draws);
  const beforeResize=view.draws;view.draw({...value,guiScale:2});assert.ok(view.draws>beforeResize);
  value.kit=kits[1];assert.deepEqual(view.draw(value),['One','Renamed']);
});

test('inventory previews remain live and incomplete model assets are not cached',async()=>{
  const view=await monitor(),kits=[{id:'one',title:'One'},{id:'two',title:'Two'}],value={kit:kits[0],kits};view.draw(value);
  view.inventory.ready=false;view.draw({...value,guiScale:2});const incomplete=view.draws;view.draw({...value,guiScale:2});assert.ok(view.draws>incomplete);
  view.inventory.ready=true;view.inventory.draw();view.draw({...value,guiScale:2});const ready=view.draws;view.draw({...value,guiScale:2});assert.equal(view.draws,ready);
  view.draw({...value,kitPreview:'inventory'});const live=view.draws;view.draw({...value,kitPreview:'inventory'});assert.ok(view.draws>live);
});
