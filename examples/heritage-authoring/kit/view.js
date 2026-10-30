(() => {
'use strict';
const K=HeritageKit,T=HeritageItemText,images=new Map(),glyphs=new Map(),tints=new Map(),glyphChoices=new Map();
let assetPromise,playerGeometry,tooltip,tooltipKey='',tooltipState=null,tooltipFrame=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const assetBase=new URL('assets/',document.currentScript.src),atlasUrls=[0,1].map(page=>new URL('items-'+page+'.png',assetBase).href);
function image(name) {return images.get(name);}
async function assets() {
  if(assetPromise)return assetPromise;
  assetPromise=(async()=>{
    const files=[...HeritagePlayerData.textures.map(texture=>texture.file),...Object.keys(HeritageEquipmentData.assets),'inventory.png','steve.png','items-0.png','items-1.png',...['helmet','chestplate','leggings','boots','shield'].map(slot=>'empty_armor_slot_'+slot+'.png'),'armor/leather_layer_1_overlay.png','armor/leather_layer_2_overlay.png',...['leather','chainmail','iron','gold','diamond','netherite','turtle'].flatMap(material=>[1,2].map(layer=>'armor/'+material+'_layer_'+layer+'.png')).filter(file=>!file.includes('turtle_layer_2'))];
    const base=assetBase;
    await Promise.all([fetch(new URL('player/models.bin',base)).then(response=>{if(!response.ok)throw new Error('Player models could not load.');return response.arrayBuffer();}).then(buffer=>{playerGeometry=buffer;}),...files.map(async file=>{const img=new Image();img.src=new URL(file,base);await img.decode();images.set(file,img);})]);
    for(const provider of HeritageAssets.providers) {
      const img=new Image();img.src=provider.image;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,c.width,c.height).data,rows=provider.chars.map(row=>Array.from(row)),sw=c.width/rows[0].length,sh=c.height/rows.length,scale=(provider.height||8)/sh;
      rows.forEach((row,y)=>row.forEach((ch,x)=>{
        if(ch==='\0'||glyphs.has(ch))return;
        let width=0;
        for(let col=sw-1;col>=0&&!width;col--)for(let r=0;r<sh;r++)if(pixels[((y*sh+r)*c.width+x*sw+col)*4+3]){width=col+1;break;}
        glyphs.set(ch,{img,x:x*sw,y:y*sh,sw,sh,scale,ascent:provider.ascent,advance:Math.floor(.5+width*scale)+1});
      }));
    }
    glyphs.get(' ').advance=4;
    for(const [ch,glyph] of glyphs){if(!glyphChoices.has(glyph.advance))glyphChoices.set(glyph.advance,[]);glyphChoices.get(glyph.advance).push(ch);}
    const response=await fetch(new URL('text.json',base));if(!response.ok)throw new Error('Item text data could not load.');T.configure(await response.json());
  })();
  return assetPromise;
}
function textWidth(text) {return Array.from(text).reduce((sum,ch)=>sum+(glyphs.get(ch)||glyphs.get('?')).advance,0);}
function text(ctx,value,x,y,color='#fff',shadow=false) {
  if(shadow)text(ctx,value,x+1,y+1,'#3f3f3f');
  for(const ch of String(value)) {
    const g=glyphs.get(ch)||glyphs.get('?'),key=ch+color;
    if(!tints.has(key)) {
      const c=document.createElement('canvas');c.width=g.sw;c.height=g.sh;const cc=c.getContext('2d');cc.drawImage(g.img,g.x,g.y,g.sw,g.sh,0,0,g.sw,g.sh);cc.globalCompositeOperation='source-in';cc.fillStyle=color;cc.fillRect(0,0,c.width,c.height);tints.set(key,c);
    }
    ctx.drawImage(tints.get(key),x,y+7-g.ascent,g.sw*g.scale,g.sh*g.scale);x+=g.advance;
  }
}
function icon(id) {
  const node=document.createElement('span'),item=K.items.get(K.normalize(id));
  node.className='mc-item';node.setAttribute('aria-hidden','true');
  if(item) {node.style.backgroundImage='url("'+atlasUrls[item.page]+'")';node.style.backgroundPosition=-item.x+'px '+(-item.y)+'px';}
  else node.classList.add('mc-missing');
  return node;
}
function item(ctx,stack,x,y) {
  const data=K.items.get(K.normalize(stack.id));
  if(data)ctx.drawImage(image('items-'+data.page+'.png'),data.x,data.y,32,32,x,y,16,16);
  else {
    ctx.fillStyle='#000';ctx.fillRect(x,y,16,16);ctx.fillStyle='#f0f';ctx.fillRect(x,y,8,8);ctx.fillRect(x+8,y+8,8,8);
  }
  if((stack.count??1)>1) {const count=String(stack.count);text(ctx,count,x+17-textWidth(count),y+9,'#fff',true);}
}
function glyphAdvance(glyph){return (glyphs.get(glyph.ch)||glyphs.get('?')).advance+(glyph.bold?1:0);}
function drawTooltipText(ctx,line,x,y,tick){
  const draws=line.map((glyph,index)=>{
    const original=glyphs.get(glyph.ch)||glyphs.get('?'),choices=glyphChoices.get(original.advance);
    return {...glyph,ch:glyph.obfuscated&&glyph.ch!==' '?choices[(tick*37+index*71)%choices.length]:glyph.ch};
  });
  for(const shadow of [true,false]){
    let cursor=x;
    for(const glyph of draws){
      const advance=glyphAdvance(glyph),raw=Number.parseInt(glyph.color.slice(1),16);
      const tint=shadow?'#'+((raw&0xfcfcfc)>>2).toString(16).padStart(6,'0'):glyph.color,offset=shadow?1:0;
      ctx.save();ctx.translate(cursor+offset,y+offset);
      if(glyph.italic)ctx.transform(1,0,-.25,1,1,0);
      text(ctx,glyph.ch,0,0,tint);
      if(glyph.bold)text(ctx,glyph.ch,1,0,tint);
      ctx.restore();
      ctx.fillStyle=tint;
      if(glyph.underlined)ctx.fillRect(cursor+offset-1,y+offset+8,advance+1,1);
      if(glyph.strikethrough)ctx.fillRect(cursor+offset-1,y+offset+3.5,advance+1,1);
      cursor+=advance;
    }
  }
}
function showTooltip(lines,x,y){
  if(!glyphs.size)return;
  if(!lines.length){hideTooltip();return;}
  if(!tooltip){tooltip=document.createElement('canvas');tooltip.className='mc-tooltip';document.body.append(tooltip);}
  tooltipState={lines,x,y};
  const styled=lines.map((line,index)=>Array.isArray(line)?line:T.parse(line,{color:index?'#aaaaaa':'#ffffff'}));
  const limit=Math.max(20,Math.min(280,Math.floor((innerWidth-20)/2)-8)),wrapped=T.wrap(styled,limit,glyphAdvance);
  const animated=wrapped.some(line=>line.some(glyph=>glyph.obfuscated))&&!reducedMotion.matches,tick=animated?Math.floor(performance.now()/50):0;
  const width=Math.max(...wrapped.map(line=>line.reduce((sum,glyph)=>sum+glyphAdvance(glyph),0)))+8,height=(wrapped.length===1?8:wrapped.length*10)+8,key=JSON.stringify([wrapped,width,tick]);
  if(key!==tooltipKey){
    tooltipKey=key;tooltip.width=width*2;tooltip.height=height*2;
    const ctx=tooltip.getContext('2d');ctx.scale(2,2);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#100010f0';ctx.fillRect(1,0,width-2,height);ctx.fillRect(0,1,width,height-2);
    const border=ctx.createLinearGradient(0,0,0,height);border.addColorStop(0,'#5000ff50');border.addColorStop(1,'#28007f50');ctx.fillStyle=border;ctx.fillRect(1,1,width-2,1);ctx.fillRect(1,height-2,width-2,1);ctx.fillRect(1,1,1,height-2);ctx.fillRect(width-2,1,1,height-2);
    wrapped.forEach((line,index)=>drawTooltipText(ctx,line,4,4+index*10+(index?2:0),tick));
    tooltip.setAttribute('role','tooltip');tooltip.setAttribute('aria-label',wrapped.map(line=>line.map(glyph=>glyph.ch).join('')).join('\n'));
  }
  tooltip.hidden=false;tooltip.style.left=Math.max(4,Math.min(x+12,innerWidth-width*2-4))+'px';tooltip.style.top=Math.max(4,Math.min(y-12,innerHeight-height*2-4))+'px';
  if(animated&&!tooltipFrame)tooltipFrame=requestAnimationFrame(()=>{tooltipFrame=null;if(tooltipState)showTooltip(tooltipState.lines,tooltipState.x,tooltipState.y);});
}
function hideTooltip(){if(tooltip)tooltip.hidden=true;tooltipState=null;if(tooltipFrame){cancelAnimationFrame(tooltipFrame);tooltipFrame=null;}}
function bindTooltip(node,lines) {
  node.addEventListener('pointermove',event=>showTooltip(typeof lines==='function'?lines():lines,event.clientX,event.clientY));
  node.addEventListener('pointerleave',hideTooltip);
  node.addEventListener('focus',()=>{const r=node.getBoundingClientRect();showTooltip(typeof lines==='function'?lines():lines,r.right,r.top);});
  node.addEventListener('blur',hideTooltip);
}
function setupTooltips() {
  const sprites=new WeakMap();
  HeritageTooltips.setup({screen:'kit',font:glyphs,sprite:(glyph,color)=>{
    let colors=sprites.get(glyph);if(!colors){colors=new Map();sprites.set(glyph,colors);}
    if(!colors.has(color)){
      const canvas=document.createElement('canvas');canvas.width=glyph.sw;canvas.height=glyph.sh;
      const ctx=canvas.getContext('2d');ctx.drawImage(glyph.img,glyph.x,glyph.y,glyph.sw,glyph.sh,0,0,glyph.sw,glyph.sh);
      ctx.globalCompositeOperation='source-in';ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillRect(0,0,canvas.width,canvas.height);colors.set(color,canvas);
    }
    return colors.get(color);
  }});
}
const rotate=(p,yaw,pitch=0)=>{const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);const x=p[0]*cy+p[2]*sy,z=p[2]*cy-p[0]*sy;return [x,p[1]*cp-z*sp,p[1]*sp+z*cp];};
const shaded=new WeakMap(),leather=new Map();
function leatherTexture(layer,stack) {
  const raw=stack.components?.['minecraft:dyed_color'],color=typeof raw==='number'?raw:raw?.rgb??0xa06540,key=layer+':'+color;
  if(leather.has(key))return leather.get(key);
  const base=image('armor/leather_layer_'+layer+'.png'),c=document.createElement('canvas');c.width=base.width;c.height=base.height;
  const ctx=c.getContext('2d');ctx.drawImage(base,0,0);ctx.globalCompositeOperation='multiply';ctx.fillStyle='#'+(color&0xffffff).toString(16).padStart(6,'0');ctx.fillRect(0,0,c.width,c.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(base,0,0);ctx.globalCompositeOperation='source-over';ctx.drawImage(image('armor/leather_layer_'+layer+'_overlay.png'),0,0);leather.set(key,c);if(leather.size>32)leather.delete(leather.keys().next().value);return c;
}
function shadeTexture(texture,shade) {
  if(shade===1)return texture;
  if(!shaded.has(texture))shaded.set(texture,new Map());
  const cache=shaded.get(texture);
  if(cache.has(shade))return cache.get(shade);
  const c=document.createElement('canvas');c.width=texture.width;c.height=texture.height;const ctx=c.getContext('2d');ctx.drawImage(texture,0,0);ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(0,0,0,'+(1-shade)+')';ctx.fillRect(0,0,c.width,c.height);cache.set(shade,c);return c;
}
const modelCache=new Map();
function modelFaces(range) {
  const key=range[0]+':'+range[1];
  if(!modelCache.has(key)){
    modelCache.set(key,HeritagePlayer.quads(playerGeometry,range));
    if(modelCache.size>64)modelCache.delete(modelCache.keys().next().value);
  }
  return modelCache.get(key);
}
function modelSurface(face) {
  if(face.surface)return face.surface;
  const data=HeritagePlayerData.textures[face.texture],texture=image(data.file),xs=face.uv.map(p=>p[0]*texture.width),ys=face.uv.map(p=>p[1]*texture.height);
  const x=Math.floor(Math.min(...xs)),y=Math.floor(Math.min(...ys)),w=Math.ceil(Math.max(...xs))-x,h=Math.ceil(Math.max(...ys))-y;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,w);canvas.height=Math.max(1,h);
  const ctx=canvas.getContext('2d'),pattern=ctx.createPattern(texture,'repeat');
  const paint=()=>{ctx.save();ctx.translate(-x,-y);ctx.fillStyle=pattern;ctx.fillRect(x,y,canvas.width,canvas.height);ctx.restore();};paint();
  if(face.color!==0xffffff){
    ctx.globalCompositeOperation='multiply';ctx.fillStyle='#'+face.color.toString(16).padStart(6,'0');ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='destination-in';paint();
  }
  return face.surface={texture:canvas,uv:xs.map((u,i)=>[u-x,ys[i]-y])};
}
function drawModelFace(ctx,face) {
  const [a,b,c]=face.points,[u,v,w]=face.uv,du=v[0]-u[0],dv=v[1]-u[1],eu=w[0]-u[0],ev=w[1]-u[1],det=du*ev-eu*dv;
  if(Math.abs(det)<1e-9)return;
  const ax=((b[0]-a[0])*ev-(c[0]-a[0])*dv)/det,ay=((b[1]-a[1])*ev-(c[1]-a[1])*dv)/det,bx=(du*(c[0]-a[0])-eu*(b[0]-a[0]))/det,by=(du*(c[1]-a[1])-eu*(b[1]-a[1]))/det;
  ctx.save();ctx.beginPath();face.points.forEach((point,i)=>i?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]));ctx.closePath();ctx.clip();
  ctx.transform(ax,ay,bx,by,a[0]-ax*u[0]-bx*u[1],a[1]-ay*u[0]-by*u[1]);
  ctx.drawImage(shadeTexture(face.texture,face.shade),0,0);ctx.restore();
}
function player(ctx,kit,aim) {
  const P=HeritagePlayer,equipped=P.equipment(kit),lookYaw=-Math.atan(aim.x/40),lookPitch=-Math.atan(aim.y/40),yaw=lookYaw*.35,pitch=lookPitch*.12,faces=[];
  const project=p=>{const q=rotate([p[0],p[1]-16,p[2]],yaw,pitch);return [51+q[0]*1.75,47+q[1]*1.75,q[2]];};
  const head=p=>P.head(p,lookYaw,lookPitch),right=p=>P.arm(p,-1,!!equipped.main),left=p=>P.arm(p,1,!!equipped.off);
  function box(texture,cx,cy,cz,w,h,d,u,v,inflate=0,attach=p=>p) {
    if(!texture)return;
    const x0=cx-w/2-inflate,x1=cx+w/2+inflate,y0=cy-h/2-inflate,y1=cy+h/2+inflate,z0=cz-d/2-inflate,z1=cz+d/2+inflate;
    const vertices=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
    const definitions=[
      [[0,1,2,3],u+d,v+d,w,h,1],[[5,4,7,6],u+d+w+d,v+d,w,h,.68],
      [[4,0,3,7],u,v+d,d,h,.78],[[1,5,6,2],u+d+w,v+d,d,h,.88],
      [[4,5,1,0],u+d,v,w,d,1],[[3,2,6,7],u+d+w,v,w,d,.55]
    ];
    for(const [indexes,tx,ty,tw,th,shade] of definitions) {
      const points=indexes.map(i=>project(attach(vertices[i])));
      const cross=(points[1][0]-points[0][0])*(points[3][1]-points[0][1])-(points[1][1]-points[0][1])*(points[3][0]-points[0][0]);
      if(cross<=0)continue;
      faces.push({points,texture,tx,ty,tw,th,shade,depth:points.reduce((sum,p)=>sum+p[2],0)/4});
    }
  }
  function model(range,attach) {
    for(const face of modelFaces(range)){
      const vertices=face.points.map(attach),points=vertices.map(project);
      if(!P.visible(points))continue;
      const ab=vertices[1].map((n,i)=>n-vertices[0][i]),ad=vertices[3].map((n,i)=>n-vertices[0][i]),normal=[ab[1]*ad[2]-ab[2]*ad[1],ab[2]*ad[0]-ab[0]*ad[2],ab[0]*ad[1]-ab[1]*ad[0]];
      const shade=Math.round((.65+.35*Math.abs(normal[2])/Math.max(1e-9,Math.hypot(...normal)))*20)/20;
      faces.push({...modelSurface(face),points,shade,depth:points.reduce((sum,p)=>sum+p[2],0)/4});
    }
  }
  const skin=image('steve.png');
  box(skin,0,4,0,8,8,8,0,0,0,head);box(skin,0,14,0,8,12,4,16,16);
  box(skin,-6,14,0,4,12,4,40,16,0,right);box(skin,6,14,0,4,12,4,32,48,0,left);
  box(skin,-2,26,0,4,12,4,0,16);box(skin,2,26,0,4,12,4,16,48);
  box(skin,0,4,0,8,8,8,32,0,.25,head);box(skin,0,14,0,8,12,4,16,32,.25);
  box(skin,-6,14,0,4,12,4,40,32,.25,right);box(skin,6,14,0,4,12,4,48,48,.25,left);
  box(skin,-2,26,0,4,12,4,0,32,.25);box(skin,2,26,0,4,12,4,0,48,.25);
  for(const [slot,stack] of equipped.armor) {
    const data=K.items.get(K.normalize(stack.id));
    if(!data?.material)continue;
    const layer=slot===37?2:1,texture=data.material==='leather'?leatherTexture(layer,stack):image('armor/'+data.material+'_layer_'+layer+'.png');
    if(slot===39)box(texture,0,4,0,8,8,8,0,0,1,head);
    if(slot===38){box(texture,0,14,0,8,12,4,16,16,1);box(texture,-6,14,0,4,12,4,40,16,1,right);box(texture,6,14,0,4,12,4,40,16,1,left);}
    if(slot===37){box(texture,0,14,0,8,12,4,16,16,.5);box(texture,-2,26,0,4,12,4,0,16,.5);box(texture,2,26,0,4,12,4,0,16,.5);}
    if(slot===36){box(texture,-2,26,0,4,12,4,0,16,1);box(texture,2,26,0,4,12,4,0,16,1);}
  }
  for(const [stack,side,context] of [[equipped.main,-1,0],[equipped.off,1,1]])if(stack){
    const range=HeritagePlayerData.models[K.normalize(stack.id)];
    if(range)model(range,p=>P.hand(p,side,HeritagePlayerData.transforms[range[2]][context]));
  }
  if(equipped.head){
    const id=K.normalize(equipped.head.id),range=HeritagePlayerData.models[id];
    if(range)model(range,p=>head(P.headItem(p,id,HeritagePlayerData.transforms[range[2]][2])));
  }
  const worn=equipped.chest&&HeritagePlayerData.worn[K.normalize(equipped.chest.id)];
  if(worn)model(worn,p=>p.map(n=>n*16));
  faces.sort((a,b)=>b.depth-a.depth);
  for(const face of faces) {
    if(face.uv){drawModelFace(ctx,face);continue;}
    const [a,b,,d]=face.points;ctx.save();ctx.transform((b[0]-a[0])/face.tw,(b[1]-a[1])/face.tw,(d[0]-a[0])/face.th,(d[1]-a[1])/face.th,a[0],a[1]);
    ctx.drawImage(shadeTexture(face.texture,face.shade),face.tx,face.ty,face.tw,face.th,0,0,face.tw,face.th);ctx.restore();
  }
}
let carriedGhost,carriedKey='',carriedPointer={x:20,y:20};
function moveCursor(event) {carriedPointer={x:event.clientX,y:event.clientY};if(carriedGhost){carriedGhost.style.left=event.clientX+10+'px';carriedGhost.style.top=event.clientY-16+'px';}}
function setCursor(stack) {
  document.addEventListener('pointermove',moveCursor,{passive:true});
  const key=JSON.stringify(stack??null);if(key===carriedKey)return;carriedKey=key;carriedGhost?.remove();carriedGhost=null;
  document.body.classList.toggle('mc-carrying',!!stack);
  if(!stack)return;
  carriedGhost=document.createElement('div');carriedGhost.className='mc-drag-stack mc-carried-stack';carriedGhost.setAttribute('aria-hidden','true');carriedGhost.append(icon(stack.id));
  if((stack.count??1)>1){const count=document.createElement('span');count.textContent=stack.count;carriedGhost.append(count);}
  document.body.append(carriedGhost);moveCursor({clientX:carriedPointer.x,clientY:carriedPointer.y});hideTooltip();
}
function dragStart(event,payload,onDrop,options={}) {
  if(!(options.buttons??[0]).includes(event.button)||event.isPrimary===false)return;
  const source=event.target.closest('button');if(!source)return;
  const start={x:event.clientX,y:event.clientY,time:performance.now()},pointerId=event.pointerId;
  let active=true,moved=false,cancelled=false,ghost,target,ghostKey;const visited=[],button=event.button;
  source.setPointerCapture(pointerId);
  function clearPreview() {
    ghost?.remove();ghost=null;target?.classList.remove('mc-drop-target');target=null;
    document.body.classList.remove('mc-dragging');hideTooltip();options.onPreviewEnd?.();
  }
  function cleanup() {
    if(!active)return;
    active=false;clearPreview();
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cleanup);
    source.removeEventListener('lostpointercapture',cancel);
    if(source.hasPointerCapture(pointerId))source.releasePointerCapture(pointerId);
  }
  function destination(event) {
    const slot=document.elementFromPoint(event.clientX,event.clientY)?.closest('.mc-slot');
    return slot?.closest('.mc-inventory')?.dataset.editable==='true'?slot:null;
  }
  function move(event) {
    if(!active||cancelled||event.pointerId!==pointerId)return;
    let changed=!moved;
    if(!moved){
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<5)return;
      if(event.pointerType==='touch'&&performance.now()-start.time<180)return;
      moved=true;hideTooltip();document.body.classList.add('mc-dragging');
      ghost=document.createElement('div');ghost.className='mc-drag-stack';ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
    }
    event.preventDefault();ghost.style.left=event.clientX+10+'px';ghost.style.top=event.clientY-16+'px';
    const next=destination(event);
    if(target!==next){target?.classList.remove('mc-drop-target');target=next;target?.classList.add('mc-drop-target');if(target){const raw=target.dataset.slot,value=/^\d+$/.test(raw)?Number(raw):raw;if(!visited.includes(value)){visited.push(value);changed=true;}}}
    if(changed){
      const preview=options.onPreview?.({slots:[...visited],button}),stack=preview?preview.cursor?.entry.item:payload.item,key=JSON.stringify(stack??null);
      if(key!==ghostKey){
        ghostKey=key;ghost.hidden=!stack;ghost.replaceChildren();
        if(stack){ghost.append(icon(stack.id));if((stack.count??1)>1){const count=document.createElement('span');count.textContent=stack.count;ghost.append(count);}}
      }
    }
  }
  function up(event) {
    if(!active||event.pointerId!==pointerId)return;
    const raw=destination(event)?.dataset.slot,value=raw===undefined?null:/^\d+$/.test(raw)?Number(raw):raw,dragged=moved;
    cleanup();
    if(!dragged&&!cancelled&&!options.onTap)return;
    event.preventDefault();
    const suppress=event=>{event.preventDefault();event.stopImmediatePropagation();};
    for(const type of ['click','contextmenu'])window.addEventListener(type,suppress,{capture:true,once:true});setTimeout(()=>{for(const type of ['click','contextmenu'])window.removeEventListener(type,suppress,true);},0);
    if(!cancelled&&!dragged){options.onTap?.(event);return;}
    if(!cancelled&&value!==null&&HeritageEquipment.valid(value))onDrop(value,{slots:visited,button:event.button??0});
  }
  function cancel(event){if(event.pointerId===pointerId)cleanup();}
  function escape(event){if(event.key==='Escape'){cancelled=true;clearPreview();event.preventDefault();event.stopImmediatePropagation();}}
  window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('keydown',escape,true);window.addEventListener('blur',cleanup);
  source.addEventListener('lostpointercapture',cancel);
  return cleanup;
}
class Inventory {
  constructor(host,{editable=false,onSelect,onMove,onDrop,onClick,onCollect,onClone,getCursor,onControl,isSelecting,getSelection,onToggleSelection,onMovePreview,onMovePreviewEnd,scaleWidth=0}={}) {
    this.host=host;this.callbacks={onSelect,onMove,onDrop,onClick,onCollect,onClone,getCursor,onControl,isSelecting,getSelection,onToggleSelection,onMovePreview,onMovePreviewEnd};this.kit={items:[]};this.options={mode:'player'};this.selected=0;this.hover=null;this.aim={x:-12,y:0};this.scaleWidth=scaleWidth;this.editable=editable;this.ready=false;this.visible=true;this.dirty=true;this.bounds=null;
    this.frame=document.createElement('div');this.frame.className='mc-inventory';this.frame.dataset.editable=String(editable);this.frame.setAttribute('aria-busy','true');
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');this.background=document.createElement('canvas');
    this.frame.append(this.canvas);host.replaceChildren(this.frame);this.buttons=new Map();this.controls=new Map();this.entries=new Map();this.stacks=new Map();this.set(this.kit);
    this.invalidate=()=>{this.bounds=null;hideTooltip();};
    this.refit=()=>{this.invalidate();this.fit();};
    this.pointer=event=>{
      if(!this.ready||!this.visible||document.hidden||reducedMotion.matches||!this.frame.isConnected)return;
      const r=this.bounds??=this.frame.getBoundingClientRect();if(!r.width)return;
      const scale=r.width/this.layout.width,x=Math.round(Math.max(-160,Math.min(160,(event.clientX-r.left)/scale-this.layout.inventoryX-this.layout.playerX))*2)/2,y=Math.round(Math.max(-160,Math.min(160,(event.clientY-r.top)/scale-this.layout.inventoryY-32))*2)/2;
      if(this.aim.x===x&&this.aim.y===y)return;this.aim={x,y};
      if(!this.frameRequest)this.frameRequest=requestAnimationFrame(()=>{this.frameRequest=0;if(this.frame.isConnected&&this.visible)this.draw();});
    };
    this.frame.addEventListener('wheel',event=>{
      if(this.layout.mode==='player'||!this.layout.maxOffset||!event.deltaY)return;
      const r=this.frame.getBoundingClientRect(),x=(event.clientX-r.left)*this.layout.width/r.width;
      if(x>=this.layout.inventoryX)return;
      event.preventDefault();this.callbacks.onControl?.({kind:'page',value:Math.max(0,Math.min(this.layout.maxOffset,this.layout.offset+Math.sign(event.deltaY)))});
    },{passive:false});
    document.addEventListener('pointermove',this.pointer,{passive:true});document.addEventListener('scroll',this.invalidate,{passive:true,capture:true});window.addEventListener('resize',this.refit,{passive:true});
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(this.host);
    this.visibility=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(this.visible){this.refit();this.draw();}});this.visibility.observe(this.frame);
    assets().then(()=>{if(!this.frame.isConnected)return;this.ready=true;this.frame.setAttribute('aria-busy','false');this.labels();this.draw();}).catch(error=>{host.textContent='Inventory assets could not load: '+error.message;});
  }
  fit() {
    let ratio=devicePixelRatio||1;
    for(let node=this.host;node;node=node.parentElement)ratio*=Number.parseFloat(getComputedStyle(node).zoom)||1;
    const scale=HeritagePlayer.guiScale(Math.max(this.layout.width,this.scaleWidth),this.host.clientWidth,ratio),width=this.layout.width*scale,height=this.layout.height*scale;
    this.scale=scale;this.frame.style.width=width/ratio+'px';this.frame.style.height=height/ratio+'px';
    this.host.style.overflowX=this.host.clientWidth<width/ratio?'auto':'';
    if(this.canvas.width!==width||this.canvas.height!==height){
      this.canvas.width=this.background.width=width;this.canvas.height=this.background.height=height;this.scale=scale;this.dirty=true;this.bounds=null;this.draw();
    }
  }
  position(node,position) {
    node.style.left=position.x/this.layout.width*100+'%';node.style.top=position.y/this.layout.height*100+'%';node.style.width=position.width/this.layout.width*100+'%';node.style.height=position.height/this.layout.height*100+'%';
  }
  buildSlots() {
    const focused=this.frame.contains(document.activeElement)?document.activeElement.dataset.slot:null;
    for(const button of this.buttons.values())button.remove();this.buttons.clear();
    for(const position of this.layout.slots) {
      const value=position.id,button=document.createElement('button');button.type='button';button.className='mc-slot';button.dataset.slot=String(value);
      this.position(button,{x:position.x-1,y:position.y-1,width:18,height:18});
      button.addEventListener('click',event=>{if(this.editable&&this.callbacks.isSelecting?.(event)){this.callbacks.onToggleSelection?.(value,event);return;}if(!this.editable||event.altKey||!this.entry(value)&&!this.callbacks.getCursor?.()){this.select(value);this.callbacks.onSelect?.(value,event);}else if(!event.detail)this.callbacks.onClick?.(value,event);});
      button.addEventListener('keydown',event=>{
        if(!event.key.startsWith('Arrow'))return;
        event.preventDefault();const next=HeritageEquipment.neighbor(this.layout,value,event.key);this.select(next,true);this.callbacks.onSelect?.(next);
      });
      button.addEventListener('pointerenter',()=>{this.hover=value;this.draw();});button.addEventListener('pointerleave',()=>{this.hover=null;this.draw();});
      bindTooltip(button,()=>{const entry=this.entry(value);return entry?T.tooltip(entry.item,HeritageEquipment.name(value)):[HeritageEquipment.name(value)];});
      if(this.editable) {
        button.addEventListener('contextmenu',event=>event.preventDefault());
        button.addEventListener('dblclick',event=>{if(!event.altKey&&!this.callbacks.isSelecting?.(event))this.callbacks.onCollect?.(value);});
        button.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
        button.addEventListener('pointerdown',event=>{
          if(event.altKey||this.callbacks.isSelecting?.(event))return;
          if(event.button===1){event.preventDefault();this.callbacks.onClone?.(value);return;}
          const stack=this.callbacks.getCursor?.()??this.entry(value)?.item;if(!stack)return;
          const payload={item:{...stack,count:event.button===2&&!this.callbacks.getCursor?.()?Math.ceil((stack.count??1)/2):stack.count??1}};
          this.cancelDrag=dragStart(event,payload,(destination,gesture)=>this.callbacks.onMove?.(value,destination,gesture),{
            buttons:[0,2],onTap:up=>this.callbacks.onClick?.(value,{button:event.button===2?1:0,shiftKey:up.shiftKey}),
            onPreview:gesture=>{const state=this.callbacks.onMovePreview?.(value,gesture);if(state)this.preview(state.document);return state;},
            onPreviewEnd:()=>{this.preview(null);this.callbacks.onMovePreviewEnd?.();}
          });
        });
      }
      this.frame.append(button);this.buttons.set(value,button);
    }
    for(const control of this.layout.controls) {
      let node=this.controls.get(control.key);
      if(!node) {
        node=document.createElement(control.kind==='scroll'?'input':'button');node.className='mc-control';node.dataset.control=control.key;
        if(control.kind==='scroll') {
          node.type='range';node.min=0;node.step=1;
          node.addEventListener('input',()=>this.callbacks.onControl?.({...this.layout.controls.find(item=>item.key===control.key),value:Number(node.value)}));
        }else{
          node.type='button';node.addEventListener('click',()=>this.callbacks.onControl?.(this.layout.controls.find(item=>item.key===control.key)));
          node.addEventListener('pointerenter',()=>{this.hoverControl=control.key;this.draw();});node.addEventListener('pointerleave',()=>{this.hoverControl=null;this.draw();});
        }
        bindTooltip(node,()=>[this.layout.controls.find(item=>item.key===control.key)?.label||'Equipment control']);this.frame.append(node);this.controls.set(control.key,node);
      }
      this.position(node,control);node.setAttribute('aria-label',control.label);node.disabled=control.disabled??false;
      if(control.kind==='scroll'){node.max=control.max;node.value=control.value;node.classList.add('mc-native-scroll');}
    }
    for(const [key,node] of this.controls)if(!this.layout.controls.some(control=>control.key===key)){node.remove();this.controls.delete(key);}
    if(focused!==null){const value=/^\d+$/.test(focused)?Number(focused):focused;this.buttons.get(value)?.focus({preventScroll:true});}
  }
  entry(value){return (this.previewEntries??this.entries).get(value);}
  labels() {
    for(const [value,button] of this.buttons){
      const entry=this.entry(value);button.setAttribute('aria-label',HeritageEquipment.name(value)+(entry?': '+T.name(entry.item)+', '+(entry.item.count??1):': empty'));
    }
  }
  preview(kit) {
    if(!kit&&!this.previewKit)return;
    this.previewKit=kit;this.previewEntries=kit?new Map(kit.items.map(entry=>[HeritageEquipment.id(entry),entry])):null;
    this.dirty=true;this.labels();this.draw();
  }
  select(value,focus=false) {
    if(!HeritageEquipment.valid(value))return;
    this.selected=value;
    const selection=this.callbacks.getSelection?.(),multiple=selection?.size||this.callbacks.isSelecting?.({});
    for(const [slot,button] of this.buttons){button.tabIndex=slot===value?0:-1;button.setAttribute('aria-pressed',String(this.editable&&(multiple?selection?.has(slot):slot===value)));}
    if(!this.buttons.has(value))this.buttons.values().next().value?.setAttribute('tabindex','0');
    if(focus)this.buttons.get(value)?.focus({preventScroll:true});this.draw();
  }
  set(kit,options=this.options) {
    this.cancelDrag?.();
    this.options=options;this.kit=kit.enabled===false?{items:[]}:kit;
    this.entries=new Map((this.kit.items||[]).map(entry=>[HeritageEquipment.id(entry),entry]));
    this.stacks=new Map((this.kit.items||[]).filter(entry=>(entry.inventory??'player')==='player').map(entry=>[entry.index,entry.item]));
    const layout=HeritageEquipment.layout(this.kit,options),layoutKey=JSON.stringify(layout);
    if(layoutKey!==this.layoutKey) {
      this.layout=layout;this.layoutKey=layoutKey;this.dirty=true;this.bounds=null;this.hover=null;hideTooltip();
      this.fit();this.buildSlots();
    }
    const key=JSON.stringify([this.kit.items,this.kit.selected_slot]);if(key!==this.contentKey){this.dirty=true;this.contentKey=key;}
    this.labels();
    this.select(this.selected);
  }
  destroy() {
    this.cancelDrag?.();
    document.removeEventListener('pointermove',this.pointer);document.removeEventListener('scroll',this.invalidate,true);window.removeEventListener('resize',this.refit);
    this.resize.disconnect();this.visibility.disconnect();if(this.frameRequest)cancelAnimationFrame(this.frameRequest);hideTooltip();
  }
  blit(ctx,part) {
    const img=image(part.file);if(!part.nine){ctx.drawImage(img,part.sx,part.sy,part.sw,part.sh,part.x,part.y,part.width,part.height);return;}
    const border=HeritageEquipmentData.assets[part.file].metadata.gui.scaling.border;
    const bx=Math.min(border,Math.floor(part.width/2)),by=Math.min(border,Math.floor(part.height/2));
    const sourceX=[0,bx,img.width-bx,img.width],sourceY=[0,by,img.height-by,img.height],targetX=[part.x,part.x+bx,part.x+part.width-bx,part.x+part.width],targetY=[part.y,part.y+by,part.y+part.height-by,part.y+part.height];
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const sw=sourceX[col+1]-sourceX[col],sh=sourceY[row+1]-sourceY[row];
      if(!sw||!sh)continue;
      for(let y=targetY[row];y<targetY[row+1];y+=sh)for(let x=targetX[col];x<targetX[col+1];x+=sw){
        const width=Math.min(sw,targetX[col+1]-x),height=Math.min(sh,targetY[row+1]-y);
        ctx.drawImage(img,sourceX[col],sourceY[row],width,height,x,y,width,height);
      }
    }
  }
  renderBase() {
    const {width,height,inventoryX,inventoryY,mode}=this.layout,ctx=this.background.getContext('2d');ctx.setTransform(this.scale,0,0,this.scale,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,width,height);
    for(const part of this.layout.blits)this.blit(ctx,part);
    if(mode!=='accessories')text(ctx,'Crafting',inventoryX+97,inventoryY+6,'#404040');
    for(const position of this.layout.slots) {
      const entry=this.entry(position.id);
      if(entry)item(ctx,entry.item,position.x,position.y);
      else if(position.inventory==='player'&&position.index>=36){const name=({36:'boots',37:'leggings',38:'chestplate',39:'helmet',40:'shield'})[position.index];ctx.drawImage(image('empty_armor_slot_'+name+'.png'),position.x,position.y,16,16);}
      else if(position.icon)ctx.drawImage(image(position.icon),position.x,position.y,16,16);
      else if(position.inventory!=='player')text(ctx,'?',position.x+Math.floor((17-textWidth('?'))/2),position.y+4,'#555555');
      if(this.editable&&position.inventory==='player'&&position.index===(this.kit.selected_slot??0)){ctx.fillStyle='#ffaa00';ctx.fillRect(position.x,position.y+15,16,1);}
    }
    this.dirty=false;
  }
  draw() {
    if(!this.ready||!this.visible)return;
    if(this.dirty)this.renderBase();
    const {width,height,inventoryX,inventoryY,playerX}=this.layout,ctx=this.canvas.getContext('2d');ctx.setTransform(this.scale,0,0,this.scale,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,width,height);ctx.drawImage(this.background,0,0,width,height);
    ctx.save();ctx.beginPath();ctx.rect(inventoryX+26,inventoryY+8,this.layout.mode==='accessories'?124:49,70);ctx.clip();ctx.translate(inventoryX+playerX-51,inventoryY);player(ctx,this.previewKit??this.kit,this.aim);ctx.restore();
    const hovered=this.layout.slots.find(slot=>slot.id===this.hover),selected=this.layout.slots.find(slot=>slot.id===this.selected);
    if(hovered){ctx.fillStyle='#ffffff80';ctx.fillRect(hovered.x,hovered.y,16,16);}
    const selection=this.callbacks.getSelection?.();
    if(this.editable&&selection?.size)for(const position of this.layout.slots)if(selection.has(position.id)){ctx.fillStyle='#e4c17a45';ctx.fillRect(position.x,position.y,16,16);ctx.strokeStyle='#e4c17a';ctx.lineWidth=1;ctx.strokeRect(position.x-.5,position.y-.5,17,17);}
    if(this.editable&&selected&&!selection?.size){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(selected.x-.5,selected.y-.5,17,17);}
    const control=this.layout.controls.find(item=>item.key===this.hoverControl);
    if(control?.kind==='cosmetics'){
      if(this.layout.mode==='curios')ctx.drawImage(image('curios/gui/curios/cosmetic_'+(this.options.cosmetics?'on':'off')+'_highlighted.png'),control.x,control.y,control.width,control.height);
      else if(this.layout.mode==='accessories')this.blit(ctx,{file:'widget/button_highlighted.png',x:control.x,y:control.y,width:control.width,height:control.height,nine:true});
    }
  }
}
globalThis.HeritageInventory={Inventory,icon,assets,bindTooltip,hideTooltip,dragStart,setCursor,setupTooltips};
})();
