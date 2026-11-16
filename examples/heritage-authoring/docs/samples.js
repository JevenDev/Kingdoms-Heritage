(() => {
'use strict';
const P=HeritagePreview,motion=matchMedia('(prefers-reduced-motion: reduce)'),metrics=new HeritageCanvas(null);
let entries=[],paused=motion.matches,tick=0,last=null,frameRequest=0,mountId=0;
const entriesByCanvas=new Map();
function draw(sample) {
  const {canvas,renderer,config,blocks,all}=sample,ctx=canvas.getContext('2d'),w=canvas.width/2,h=canvas.height/2;
  ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;ctx.fillStyle='#1b1b1b';ctx.fillRect(0,0,w,h);
  const time=sample.reveal?tick%150:tick,visible=sample.reveal?P.visible(config,all,time,sample.ends):Infinity;
  const alpha=sample.reveal&&config.animation==='fade_in'?Math.round(P.clamp(time/config.reveal_ticks)*255):255;
  const timing=P.trackTiming(config);
  renderer.bars(w,h,timing.bar_start_ticks+timing.bar_enter_ticks-config.black_hold_ticks,config,-7);
  if(!sample.tall){ctx.translate(w/2,h/2);ctx.scale(1.25,1.25);ctx.translate(-w/2,-h/2);}
  for(const block of blocks)renderer.block(block,visible,alpha,Math.floor(time),config.outline,!config.outline);
}
const visible=entry=>entry.visible&&!entry.canvas.closest('[hidden]');
const animating=()=>!paused&&!document.hidden&&entries.some(entry=>entry.animated&&visible(entry));
function schedule() {
  if(animating()){
    if(!frameRequest){last??=performance.now();frameRequest=requestAnimationFrame(frame);}
  }else{
    if(frameRequest)cancelAnimationFrame(frameRequest);
    frameRequest=0;last=null;
  }
}
function frame(now) {
  frameRequest=0;
  if(!animating()){last=null;return;}
  tick+=Math.min(100,now-last)/50;last=now;
  for(const entry of entries)if(entry.animated&&visible(entry))draw(entry);
  schedule();
}
const observer=new IntersectionObserver(changes=>{
  for(const change of changes){
    const entry=entriesByCanvas.get(change.target);
    if(entry){entry.visible=change.isIntersecting;if(entry.visible)draw(entry);}
  }
  schedule();
});
async function mount(samples) {
  const id=++mountId;observer.disconnect();entries=[];entriesByCanvas.clear();schedule();
  if(!samples.length)return;
  await metrics.load();
  if(id!==mountId)return;
  entries=samples.filter(sample=>sample.canvas.isConnected).map(sample=>{
    const config={...P.packDefaults,text:sample.text,subtitle:'',animation:'immediate',title_position:'mid_center',...sample.config};
    const main=P.parse(config.text,{biome:'Plains',structure:'Savanna Village',dimension:'Overworld'});
    const sub=P.parse(config.subtitle,{},main.length+1);
    sample.canvas.width=sample.tall?640:400;sample.canvas.height=sample.tall?360:160;
    const blocks=P.layout(config,main,sub,sample.canvas.width/2,sample.canvas.height/2,metrics.advance);
    const all=[...main,{ch:'\n',index:main.length,effect:{}},...sub];
    return {...sample,renderer:new HeritageCanvas(sample.canvas.getContext('2d')),config,blocks,all,ends:config.animation==='word_by_word'?P.wordEnds(all):[],animated:sample.reveal||all.some(g=>P.active(g.effect)||g.effect.obfuscated),visible:false};
  });
  for(const entry of entries){entriesByCanvas.set(entry.canvas,entry);observer.observe(entry.canvas);}
}
document.addEventListener('visibilitychange',schedule);
motion.addEventListener('change',()=>{paused=motion.matches;schedule();document.dispatchEvent(new Event('heritage:samples-motion'));});

globalThis.HeritageSamples={mount,get paused(){return paused;},toggle(){paused=!paused;schedule();return paused;}};
})();
