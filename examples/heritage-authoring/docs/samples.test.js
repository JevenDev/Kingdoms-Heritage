'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../editor/engine.js');
require('./content.js');

function samples() {
  let observer,frame;const events=new Map();
  const observed=[],draws=[];
  const ctx={setTransform(){},save(){},restore(){},scale(){},transform(){},
    translate(...values){assert.ok(values.every(Number.isFinite));},
    fillRect(...values){assert.ok(values.every(Number.isFinite));},
    drawImage(...values){assert.ok(values.slice(1).every(Number.isFinite));draws.push(values);},
    getImageData(){return {data:new Uint8ClampedArray(8*8*4).fill(255)};}};
  const canvas=()=>({isConnected:true,closest(){return null;},getContext(){ctx.canvas=this;return ctx;}});
  const context=vm.createContext({HeritagePreview:P,
    HeritageAssets:{providers:[{image:'font',chars:['?'],height:8,ascent:7}]},
    document:{hidden:false,createElement:canvas,addEventListener(){},dispatchEvent(){}},Event:class {},
    Image:class {width=8;height=8;async decode(){}},
    matchMedia:()=>({matches:false,addEventListener(type,listener){events.set(type,listener);}}),performance:{now:()=>0},
    requestAnimationFrame(callback){frame=callback;return 1;},cancelAnimationFrame(){frame=null;},
    IntersectionObserver:class {constructor(callback){observer=callback;}disconnect(){observed.length=0;}observe(target){observed.push(target);}}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../editor/renderer.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('./samples.js'),'utf8'),context);
  return {api:context.HeritageSamples,canvas,draws,
    reveal(){observer(observed.map(target=>({target,isIntersecting:true})));},
    step(){if(frame)frame(100);},observed};
}

test('documentation samples mount and draw using the shared text layout engine',async()=>{
  const runtime=samples();
  const examples=[...HeritageDocs.styles,
    ...['straight','random'].map(bar_style=>({text:'Chapter II',tall:true,config:{cinematic_bars:true,bar_style}})),
    {text:'Title',tall:true,config:{subtitle:'Subtitle',title_coordinates:{x:20,y:40,width:30},subtitle_coordinates:{x:70,y:60,width:30}}},
    ...['fade_in','word_by_word','letter_by_letter'].map(animation=>({text:'A new journey',reveal:true,config:{animation,reveal_ticks:60}}))];
  for(const example of examples){
    await runtime.api.mount([{...example,canvas:runtime.canvas()}]);
    const before=runtime.draws.length;
    runtime.reveal();runtime.step();
    if(!example.reveal)assert.ok(runtime.draws.length>before,example.id||example.text);
    assert.equal(runtime.observed.length,1);
  }
  await runtime.api.mount([]);
  assert.equal(runtime.observed.length,0);
});
