'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function home({reduced=false,webgl=true,status=200}={}) {
  const frames=new Map(),events=new Map(),draws=[],warnings=[];
  let next=0,now=0,resize,shaderTime=0;
  const gl={createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
    createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
    createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},
    getUniformLocation:(_,name)=>name,viewport(){},uniform2f(){},uniform1f:(_,value)=>{shaderTime=value;},
    drawArrays(){draws.push({time:shaderTime,width:canvas.width,height:canvas.height});}};
  const canvas={clientWidth:1920,clientHeight:1080,style:{},getContext:()=>webgl?gl:null,addEventListener:(name,fn)=>events.set(name,fn)};
  const button={hidden:true,addEventListener:(name,fn)=>events.set('button:'+name,fn)};
  const motion={matches:reduced,addEventListener:(name,fn)=>events.set('motion:'+name,fn)};
  const document={hidden:false,getElementById:id=>id==='home-background'?canvas:button,addEventListener:(name,fn)=>events.set(name,fn)};
  const context=vm.createContext({document,matchMedia:()=>motion,performance:{now:()=>now},
    fetch:async()=>({ok:status===200,status,text:async()=>fs.readFileSync(require.resolve('./pack/assets/selection_background.fsh'),'utf8')}),
    console:{warn:(...args)=>warnings.push(args)},
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
    ResizeObserver:class {constructor(fn){resize=fn;}observe(){}}
  });
  vm.runInContext(fs.readFileSync(require.resolve('./home.js'),'utf8'),context);
  await new Promise(setImmediate);
  return {canvas,button,motion,document,draws,frames,warnings,events,
    step(value){now=value;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));},
    resize(){resize();}};
}

test('home background caps rendering resolution and frame rate and can pause',async()=>{
  const page=await home();
  assert.deepEqual(page.draws,[{time:0,width:640,height:360}]);
  assert.equal(page.button.hidden,false);
  page.step(16);assert.equal(page.draws.length,1);
  page.step(34);assert.equal(page.draws.length,2);assert.equal(page.draws[1].time,.034);
  page.events.get('button:click')();assert.equal(page.button.textContent,'Animate background');assert.equal(page.frames.size,0);
  const count=page.draws.length;page.step(1000);assert.equal(page.draws.length,count);
  page.events.get('button:click')();assert.equal(page.button.textContent,'Pause background');assert.equal(page.frames.size,1);
});

test('reduced motion renders a still background and resizing preserves the aspect ratio',async()=>{
  const page=await home({reduced:true});
  assert.equal(page.frames.size,0);assert.equal(page.draws.length,1);assert.equal(page.button.textContent,'Animate background');
  page.canvas.clientWidth=2560;page.canvas.clientHeight=1080;page.resize();
  assert.deepEqual(page.draws.at(-1),{time:0,width:640,height:270});assert.equal(page.frames.size,0);
  page.motion.matches=false;page.events.get('motion:change')();assert.equal(page.frames.size,1);
});

test('hidden pages and lost WebGL contexts stop rendering and can resume',async()=>{
  const page=await home();
  page.document.hidden=true;page.events.get('visibilitychange')();assert.equal(page.frames.size,0);
  const count=page.draws.length;page.step(5000);assert.equal(page.draws.length,count);
  page.document.hidden=false;page.events.get('visibilitychange')();assert.equal(page.frames.size,1);assert.equal(page.draws.at(-1).time,0);
  let prevented=false;page.events.get('webglcontextlost')({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(page.frames.size,0);
  page.events.get('webglcontextrestored')();assert.equal(page.frames.size,1);
});

test('unavailable WebGL and failed shader requests leave the static fallback usable',async()=>{
  for(const options of [{webgl:false},{status:503}]){
    const page=await home(options);
    assert.equal(page.draws.length,0);assert.equal(page.frames.size,0);assert.equal(page.button.hidden,true);
    if(options.status){assert.equal(page.canvas.style.visibility,'hidden');assert.equal(page.warnings.length,1);}
  }
});
