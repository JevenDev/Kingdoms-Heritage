'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'session.js'),'utf8');
function visible({width=1500,height=1600,viewport,frame}={}) {
  const module={exports:{}},window={visualViewport:viewport,frameElement:frame};
  vm.runInNewContext(source,{module,window,innerWidth:width,innerHeight:height});
  return JSON.parse(JSON.stringify(module.exports.viewportBounds()));
}
function embedded({rect,left=0,top=0,width=1500,height=1600,ancestors=[]}) {
  const parent={innerWidth:1920,innerHeight:1080,getComputedStyle:node=>node.style};
  let parentElement=null;
  for(const ancestor of ancestors.toReversed())parentElement={parentElement,style:ancestor.style,getBoundingClientRect:()=>ancestor.rect};
  return {ownerDocument:{defaultView:parent},offsetWidth:width,offsetHeight:height,clientLeft:left,clientTop:top,parentElement,getBoundingClientRect:()=>rect};
}
test('standalone overlay bounds include the visual viewport offset',()=>{
  assert.deepEqual(visible({viewport:{offsetLeft:20,offsetTop:30,width:1000,height:800}}),{left:20,top:30,right:1020,bottom:830});
  assert.deepEqual(visible({width:1920,height:1080}),{left:0,top:0,right:1920,bottom:1080});
});
test('embedded overlays stay inside the visible builder content after scrolling',()=>{
  const frame=embedded({rect:{left:300,top:-400,width:1500,height:1600},ancestors:[{style:{overflowX:'hidden',overflowY:'auto'},rect:{left:0,top:216,right:1920,bottom:1040}}]});
  assert.deepEqual(visible({frame}),{left:0,top:616,right:1500,bottom:1440});
});
test('embedded overlay bounds account for scaled frames and frame borders',()=>{
  const frame=embedded({width:1020,height:820,left:10,top:10,rect:{left:300,top:100,width:510,height:410},ancestors:[{style:{overflowX:'hidden',overflowY:'hidden'},rect:{left:350,top:200,right:750,bottom:450}}]});
  assert.deepEqual(visible({width:1000,height:800,frame}),{left:90,top:190,right:890,bottom:690});
});
test('each scrolling ancestor clips only its own overflow axes',()=>{
  const frame=embedded({width:1200,height:1000,rect:{left:100,top:100,width:1200,height:1000},ancestors:[{style:{overflowX:'hidden',overflowY:'visible'},rect:{left:200,top:0,right:900,bottom:500}},{style:{overflowX:'visible',overflowY:'auto'},rect:{left:0,top:300,right:1920,bottom:1000}}]});
  assert.deepEqual(visible({width:1200,height:1000,frame}),{left:100,top:200,right:800,bottom:900});
});
