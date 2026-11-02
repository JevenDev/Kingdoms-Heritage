(() => {
'use strict';
globalThis.HeritageCanvas=function(ctx) {
const P=HeritagePreview,font=new Map(),tinted=new Map(),widthBuckets=new Map();
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const glyph=ch=>font.get(ch)||font.get('?');
const advance=g=>glyph(g.ch).advance+(g.effect.bold?1:0);
let loading;
function load() {return loading??=(async()=>{
for(const provider of HeritageAssets.providers) {
  const image=new Image();
  image.src=provider.image;
  await image.decode();
  const sheet=document.createElement('canvas');sheet.width=image.width;sheet.height=image.height;
  const sctx=sheet.getContext('2d',{willReadFrequently:true});
  sctx.drawImage(image,0,0);
  const pixels=sctx.getImageData(0,0,image.width,image.height).data;
  const rows=provider.chars.map(row=>Array.from(row)),sw=image.width/rows[0].length,sh=image.height/rows.length,scale=(provider.height||8)/sh;
  rows.forEach((row,y)=>row.forEach((ch,x)=>{
    if(ch==='\0'||font.has(ch)) return;
    let actual=0;
    for(let col=sw-1;col>=0&&!actual;col--) for(let r=0;r<sh;r++) if(pixels[((y*sh+r)*image.width+x*sw+col)*4+3]) {actual=col+1;break;}
    font.set(ch,{id:font.size,image,sx:x*sw,sy:y*sh,sw,sh,scale,ascent:provider.ascent,advance:Math.floor(.5+actual*scale)+1});
  }));
}
font.set(' ',{...font.get(' '),advance:4});
font.set('\u200c',{...font.get(' '),advance:0});
for(const [ch,g] of font) if(ch!==' '&&ch!=='\u200c') {
  if(!widthBuckets.has(g.advance)) widthBuckets.set(g.advance,[]);
  widthBuckets.get(g.advance).push(g);
}

})();}
function sprite(g,color) {
  const key=g.id+':'+color;
  if(tinted.has(key)) return tinted.get(key);
  if(tinted.size>3072) tinted.clear();
  const c=document.createElement('canvas'); c.width=g.sw;c.height=g.sh;
  const cctx=c.getContext('2d');
  cctx.drawImage(g.image,g.sx,g.sy,g.sw,g.sh,0,0,g.sw,g.sh);
  cctx.globalCompositeOperation='source-in';
  cctx.fillStyle=hex(color);cctx.fillRect(0,0,g.sw,g.sh);
  tinted.set(key,c);
  return c;
}
function drawGlyph(draw,dx,dy,color,decoration) {
  const {g,entry,x,y,alpha}=draw, e=g.effect;
  ctx.globalAlpha=alpha/255;
  ctx.fillStyle=hex(color);
  if(decoration) {
    const a=advance(g);
    if(e.underline) ctx.fillRect(x+dx-1,y+dy+8,a+1,1);
    if(e.strike) ctx.fillRect(x+dx-1,y+dy+3.5,a+1,1);
    return;
  }
  if(g.ch===' '||g.ch==='\u200c') return;
  ctx.save();
  ctx.translate(x+dx,y+dy);
  if(e.italic) ctx.transform(1,0,-.25,1,1,0);
  const image=sprite(entry,color), up=7-entry.ascent;
  ctx.drawImage(image,0,up,entry.sw*entry.scale,entry.sh*entry.scale);
  if(e.bold) ctx.drawImage(image,1,up,entry.sw*entry.scale,entry.sh*entry.scale);
  ctx.restore();
}
function drawBlock(block,visible,alpha,tick,outline=true,shadow=false) {
  ctx.save();ctx.translate(block.x,block.y);ctx.scale(block.scale,block.scale);
  block.lines.forEach((line,row)=>{
    let x=Math.round(-line.width*block.column/2);
    const draws=[];
    for(const g of line.glyphs) {
      if(g.index<visible) {
        const frame=P.glyphFrame(g,tick,alpha);
        let entry=glyph(g.ch);
        if(g.effect.obfuscated&&g.ch!==' ') {
          const choices=widthBuckets.get(entry.advance);
          entry=choices[Math.abs(Math.imul(tick+1,37)+g.index*71)%choices.length];
        }
        if(frame.alpha>3) draws.push({g,entry,x:x+frame.x,y:row*block.lineHeight+frame.y,alpha:frame.alpha,color:frame.tint});
      }
      x+=advance(g);
    }
    if(shadow) {
      for(const decoration of [false,true]) for(const item of draws) drawGlyph(item,1,1,(item.color&0xfcfcfc)>>2,decoration);
    } else if(outline) {
      for(const decoration of [false,true]) for(const item of draws) for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) drawGlyph(item,dx,dy,0,decoration);
    }
    for(const decoration of [false,true]) for(const item of draws) drawGlyph(item,0,0,item.color,decoration);
  });
  ctx.restore();
}
function bars(w,h,ticks,config,slant) {
  if(!config.cinematic_bars)return;
  const f=Math.fround,progress=P.barProgress(config,ticks+config.black_hold_ticks),bar=P.barHeight(h,config.bar_height);
  if(progress<=0||bar<=0)return;
  const angle=config.bar_style==='random'?slant:0,travel=f(bar+Math.abs(angle)+4),sx=ctx.canvas.width/w,sy=ctx.canvas.height/h;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.globalAlpha=1;
  for(let x=0;x<ctx.canvas.width;x++) {
    const diagonal=f(angle*f(f((x+.5)/sx)/w));
    const top=Math.floor(f(f(-travel*f(1-progress))+bar)+diagonal+.5);
    const bottom=Math.floor(f(f(h-bar)+f(travel*f(1-progress)))+diagonal+.5);
    const topPixels=Math.max(0,Math.min(ctx.canvas.height,Math.floor(top*sy+.5))),bottomPixel=Math.max(0,Math.min(ctx.canvas.height,Math.ceil(bottom*sy-.5)));
    if(topPixels>0)ctx.fillRect(x,0,1,topPixels);
    if(bottomPixel<ctx.canvas.height)ctx.fillRect(x,bottomPixel,1,ctx.canvas.height-bottomPixel);
  }
  ctx.restore();
}

function intro(config,names,time,w,h,slant=0) {
  const main=P.parse(config.text,names),sub=P.parse(config.subtitle,names,main.length+1);
  const all=[...main,{ch:'\n',index:main.length,effect:{}},...sub],elapsed=time-config.black_hold_ticks;
  if(time>=P.duration(config))return all.length;
  const progress=P.clamp(elapsed/config.fade_from_black_ticks),reveal=progress*progress*(3-2*progress);
  ctx.globalAlpha=Math.round(255*(1-reveal))/255;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
  bars(w,h,elapsed,config,slant);
  const textElapsed=time-P.textStart(config);if(textElapsed<0)return 0;
  let alpha=P.clamp((P.textDuration(config)-textElapsed)/config.fade_out_ticks);
  if(config.animation==='fade_in')alpha*=P.clamp(textElapsed/config.reveal_ticks);
  const visible=P.visible(config,all,textElapsed,P.wordEnds(all));
  for(const block of P.layout(config,main,sub,w,h,advance))drawBlock(block,visible,Math.round(alpha*255),Math.floor(textElapsed),config.outline,!config.outline);
  ctx.globalAlpha=1;return visible;
}
return {font,advance,load,sprite,block:drawBlock,bars,intro};
};
})();
