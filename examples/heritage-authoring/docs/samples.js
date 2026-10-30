(() => {
'use strict';
const P=HeritagePreview,font=new Map(),tinted=new Map(),buckets=new Map();
let entries=[],paused=matchMedia('(prefers-reduced-motion: reduce)').matches,tick=0,last=null,frameRequest=0,mountId=0;
const entriesByCanvas=new Map();
const hex=n=>'#'+n.toString(16).padStart(6,'0');
let ready;
const loadFont=()=>ready??=(async()=>{
  for(const provider of HeritageAssets.providers) {
    const image=new Image();image.src=provider.image;await image.decode();
    const sheet=document.createElement('canvas');sheet.width=image.width;sheet.height=image.height;
    const ctx=sheet.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height).data,rows=provider.chars.map(row=>Array.from(row));
    const sw=image.width/rows[0].length,sh=image.height/rows.length,scale=(provider.height||8)/sh;
    rows.forEach((row,y)=>row.forEach((ch,x)=>{
      if(ch==='\0'||font.has(ch))return;
      let actual=0;
      for(let col=sw-1;col>=0&&!actual;col--)for(let r=0;r<sh;r++)if(pixels[((y*sh+r)*image.width+x*sw+col)*4+3]){actual=col+1;break;}
      font.set(ch,{id:font.size,image,sx:x*sw,sy:y*sh,sw,sh,scale,ascent:provider.ascent,advance:Math.floor(.5+actual*scale)+1});
    }));
  }
  font.set(' ',{...font.get(' '),advance:4});font.set('\u200c',{...font.get(' '),advance:0});
  for(const [ch,g] of font)if(ch!==' '&&ch!=='\u200c') {
    if(!buckets.has(g.advance))buckets.set(g.advance,[]);
    buckets.get(g.advance).push(g);
  }
})();
const glyph=ch=>font.get(ch)||font.get('?');
const advance=g=>glyph(g.ch).advance+(g.effect.bold?1:0);
function sprite(g,color) {
  const key=g.id+':'+color;
  if(tinted.has(key))return tinted.get(key);
  if(tinted.size>3072)tinted.clear();
  const c=document.createElement('canvas');c.width=g.sw;c.height=g.sh;
  const ctx=c.getContext('2d');ctx.drawImage(g.image,g.sx,g.sy,g.sw,g.sh,0,0,g.sw,g.sh);
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=hex(color);ctx.fillRect(0,0,g.sw,g.sh);
  tinted.set(key,c);return c;
}
function drawGlyph(ctx,item,dx,dy,color,decoration) {
  const {g,entry,x,y,alpha}=item,e=g.effect;ctx.globalAlpha=alpha/255;ctx.fillStyle=hex(color);
  if(decoration) {
    if(e.underline)ctx.fillRect(x+dx-1,y+dy+8,advance(g)+1,1);
    if(e.strike)ctx.fillRect(x+dx-1,y+dy+3.5,advance(g)+1,1);
    return;
  }
  if(g.ch===' '||g.ch==='\u200c')return;
  ctx.save();ctx.translate(x+dx,y+dy);if(e.italic)ctx.transform(1,0,-.25,1,1,0);
  const image=sprite(entry,color),up=7-entry.ascent;
  ctx.drawImage(image,0,up,entry.sw*entry.scale,entry.sh*entry.scale);
  if(e.bold)ctx.drawImage(image,1,up,entry.sw*entry.scale,entry.sh*entry.scale);
  ctx.restore();
}
function draw(sample) {
  const {canvas,config,blocks,all}=sample,ctx=canvas.getContext('2d'),w=canvas.width/2,h=canvas.height/2;
  ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;ctx.fillStyle='#1b1b1b';ctx.fillRect(0,0,w,h);
  const time=sample.reveal?tick%150:tick,visible=sample.reveal?P.visible(config,all,time,sample.ends):Infinity;
  let alpha=sample.reveal&&config.animation==='fade_in'?Math.round(P.clamp(time/config.reveal_ticks)*255):255;
  if(config.cinematic_bars) {
    ctx.fillStyle='#000';
    for(let x=0;x<w;x++) {
      const angle=config.bar_style==='random'?-7*x/w:0;
      ctx.fillRect(x,0,1,Math.round(18+angle));ctx.fillRect(x,Math.round(h-18+angle),1,h);
    }
  }
  if(!sample.tall){ctx.translate(w/2,h/2);ctx.scale(1.25,1.25);ctx.translate(-w/2,-h/2);}
  for(const block of blocks) {
    ctx.save();ctx.translate(block.x,block.y);ctx.scale(block.scale,block.scale);
    block.lines.forEach((line,row)=>{
      let x=Math.round(-line.width*block.column/2);const draws=[];
      for(const g of line.glyphs) {
        if(g.index<visible) {
          const frame=P.glyphFrame(g,Math.floor(time),alpha);
          let entry=glyph(g.ch);
          if(g.effect.obfuscated&&g.ch!==' ') {
            const choices=buckets.get(entry.advance);
            entry=choices[Math.abs(Math.imul(Math.floor(time)+1,37)+g.index*71)%choices.length];
          }
          if(frame.alpha>3)draws.push({g,entry,x:x+frame.x,y:row*block.lineHeight+frame.y,alpha:frame.alpha,color:frame.tint});
        }
        x+=advance(g);
      }
      if(config.outline)for(const decoration of [false,true])for(const item of draws)for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])drawGlyph(ctx,item,dx,dy,0,decoration);
      for(const decoration of [false,true])for(const item of draws)drawGlyph(ctx,item,0,0,item.color,decoration);
    });
    ctx.restore();
  }
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
  await loadFont();
  if(id!==mountId)return;
  entries=samples.filter(sample=>sample.canvas.isConnected).map(sample=>{
    const config={...P.packDefaults,text:sample.text,subtitle:'',animation:'immediate',title_position:'mid_center',...sample.config};
    const main=P.parse(config.text,{biome:'Plains',structure:'Savanna Village',dimension:'Overworld'});
    const sub=P.parse(config.subtitle,{},main.length+1);
    sample.canvas.width=sample.tall?640:400;sample.canvas.height=sample.tall?360:160;
    const blocks=P.layout(config,main,sub,sample.canvas.width/2,sample.canvas.height/2,config.cinematic_bars&&config.bar_style==='random'?-7:0,advance);
    const all=[...main,{ch:'\n',index:main.length,effect:{}},...sub];
    return {...sample,config,blocks,all,ends:config.animation==='word_by_word'?P.wordEnds(all):[],animated:sample.reveal||all.some(g=>P.active(g.effect)||g.effect.obfuscated),visible:false};
  });
  for(const entry of entries){entriesByCanvas.set(entry.canvas,entry);observer.observe(entry.canvas);}
}
document.addEventListener('visibilitychange',schedule);

globalThis.HeritageSamples={mount,get paused(){return paused;},toggle(){paused=!paused;schedule();return paused;}};
})();
