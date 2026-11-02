(() => {
'use strict';
const clock=()=>Math.trunc(performance.now());
const F=HeritageFlow,P=HeritagePreview,$=id=>document.getElementById(id),dialog=$('flow-dialog');
const canvas=$('flow-canvas'),mainContext=canvas.getContext('2d'),mainRenderer=new HeritageCanvas(mainContext),base=new URL('assets/',document.currentScript.src);
let ctx=mainContext,renderer=mainRenderer;
const layer=document.createElement('canvas'),layerContext=layer.getContext('2d'),layerRenderer=new HeritageCanvas(layerContext),transition=new HeritagePresentation.Transition();
let cards,cardFrame,kitConfirmationFrom=0,kitConfirmationStarted=0,kitConfirming=false,kitPhase='',barSlant=0,arrivalToken,keyboard=false,pointer={x:0,y:0},dissolve,toastBackground,previousPhase='';
let musicTick=0,musicFade=0,musicDuck=1,hoverReady=false;
const backgroundStarted=clock();
const veil=document.createElement('canvas'),veilContext=veil.getContext('2d'),veilRenderer=new HeritageCanvas(veilContext);veil.setAttribute('aria-hidden','true');Object.assign(veil.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',imageRendering:'pixelated',background:'transparent',border:'0',borderRadius:'0',boxShadow:'none'});$('flow-screen').append(veil);
let kitYaw=NaN,kitPitch=NaN,kitRenderedAt=0,highlightedCard=null;
const pictures=new Map(),images=new Map(),buttons=new Map(),sounds=new Set();
let session,bundled,loading,artLoading,inventory,viewport,page=0,expanded='',scroll=0,started=0,frame=0,opened=0,visible=0;
let flowReturnFocus=null,needsFocus=false,openId=0,hiddenAt=0,lockedScale=0,playerScale=4,plannedRoute=null,planApplied=false,visited=new Set(),editAfterClose=null;
let introConfig,segments=[],reviewGlyphs=[],shader,activeButtons,previewState,inventoryOptions={mode:'player'},notice='';
const music=new Audio(new URL('selection.ogg',base));music.loop=true;music.volume=.18;
const speechPlayers={review:HeritageDialogueAudio.create({volume:.7,muted:()=>$('flow-mute').checked}),intro:HeritageDialogueAudio.create({muted:()=>$('flow-mute').checked})};
let speechCues=[],speechRunning=false;
function stopSpeech(){for(const player of Object.values(speechPlayers))player.stop();speechRunning=false;}
function startSpeech(){
  if(speechRunning||started<0||!speechPlayers[session?.phase]||session.phase==='review'&&visible===Infinity)return;
  speechRunning=true;speechPlayers[session.phase].start(speechCues,()=>Math.max(0,clock()-started)/50).catch(error=>{$('flow-status').textContent='Preview audio could not load: '+error.message;});
}
function revealStory(){visible=Infinity;stopSpeech();}
const label=(entry,field)=>F.label(entry,field,bundled.translations);
const literal=(value,color=0xffffff)=>Array.from(String(value)).map((ch,index)=>({ch,index,tint:color,effect:{}}));
const width=glyphs=>glyphs.reduce((sum,glyph)=>sum+renderer.advance(glyph),0);
function text(value,x,y,{color=0xffffff,scale=1,limit=10000,center=false,maxLines=100,alpha=255,count=Infinity,outline=true,shadow=false,tick=Math.floor(clock()/50)}={}) {
  const glyphs=Array.isArray(value)?value:literal(value,color),lines=P.wrap(glyphs,limit/scale,renderer.advance).slice(0,maxLines);
  renderer.block({x,y,scale,column:center?1:0,lines,lineHeight:9},count,alpha,tick,outline,shadow);
  return lines.length*9*scale;
}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function stopSounds(){for(const sound of sounds){sound.pause();sound.currentTime=0;}sounds.clear();}
function sound(name,volume=.25){
  if($('flow-mute').checked)return;
  const audio=new Audio(new URL(name+'.ogg',base));audio.volume=volume;audio.playbackRate=.95+Math.random()*.1;sounds.add(audio);
  audio.addEventListener('ended',()=>sounds.delete(audio),{once:true});audio.play().catch(()=>sounds.delete(audio));
}
function mute(){music.muted=$('flow-mute').checked;if(music.muted)stopSounds();stopSpeech();for(const player of Object.values(speechPlayers))player.syncMute();}
function hit(id,name,x,y,w,h,action,disabled=false){
  activeButtons.add(id);
  let button=buttons.get(id);
  if(!button){
    button=document.createElement('button');button.type='button';button.className='flow-hit';button.dataset.action=id;
    button.addEventListener('click',()=>{if(!button.disabled&&transition.phase==='idle'){sound('click');button.action();}});

    $('flow-controls').append(button);buttons.set(id,button);
  }
  button.action=action;button.disabled=disabled||transition.phase!=='idle';button.setAttribute('aria-label',name);
  if(id==='disconnect')button.style.zIndex=2;
  Object.assign(button.style,{left:x/viewport.guiWidth*100+'%',top:y/viewport.guiHeight*100+'%',width:w/viewport.guiWidth*100+'%',height:h/viewport.guiHeight*100+'%'});
  return button;
}
function button(id,name,x,y,w,action,disabled=false,alpha=1){
  const accessible=id.startsWith('description-')?(expanded?'Collapse description':'Read description'):({'previous-kit':'Previous kit','next-kit':'Next kit','previous-page':'Previous page','next-page':'Next page'})[id]??name;
  const node=hit(id,accessible,x,y,w,20,action,disabled),hover=!disabled&&node.matches(':hover,:focus-visible'),image=images.get(disabled?'button_disabled':hover?'button_highlighted':'button');
  ctx.save();ctx.globalAlpha=alpha;
  if(image){
    const edge=disabled?1:3;
    for(const [sx,sw,dx,dw] of [[0,edge,x,edge],[edge,image.width-edge*2,x+edge,w-edge*2],[image.width-edge,edge,x+w-edge,edge]])for(let offset=0;offset<dw;offset+=sw){
      const tile=Math.min(sw,dw-offset);ctx.drawImage(image,sx,0,tile,image.height,dx+offset,y,tile,20);
    }
  }else rect(x,y,w,20,hover?'#888':'#555');
  text(name,x+w/2,y+6,{center:true,color:disabled?0xa0a0a0:0xffffff,limit:w-6,maxLines:1,outline:false,shadow:true,alpha:Math.round(alpha*255)});ctx.restore();
}
function arrow(id,name,x,y,action,disabled=false,{scale=1,compact=false,forward=true}={}){
  const node=hit(id,name,x,y,(compact?19:32)*scale,32*scale,action,disabled);
  const hover=!disabled&&node.matches(':hover,:focus-visible'),sprite=images.get((forward?'select':'unselect')+(hover?'_highlighted':''));
  ctx.save();ctx.filter=disabled?'brightness(35%)':'none';ctx.drawImage(sprite,forward?8:0,4,16,24,x+(compact?1:8)*scale,y+4*scale,16*scale,24*scale);ctx.restore();
}
async function loadShader(source){
  const target=document.createElement('canvas'),gl=target.getContext('webgl2',{alpha:false});if(!gl)return;
  const compile=(kind,code)=>{const item=gl.createShader(kind);gl.shaderSource(item,code);gl.compileShader(item);if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(item));return item;};
  const vertex=compile(gl.VERTEX_SHADER,'#version 300 es\nin vec2 Position;void main(){gl_Position=vec4(Position,0.,1.);}');
  const fragment=compile(gl.FRAGMENT_SHADER,source.replace('#version 150','#version 300 es\nprecision highp float;\nprecision highp int;'));
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'Position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const resolution=gl.getUniformLocation(program,'Resolution'),time=gl.getUniformLocation(program,'Time');
  shader=(w,h,now)=>{
    const scale=Math.min(1,640/ctx.canvas.width,360/ctx.canvas.height),tw=Math.max(1,Math.round(ctx.canvas.width*scale)),th=Math.max(1,Math.round(ctx.canvas.height*scale));
    if(target.width!==tw||target.height!==th){target.width=tw;target.height=th;}
    gl.viewport(0,0,tw,th);gl.uniform2f(resolution,tw,th);gl.uniform1f(time,now/1000);gl.drawArrays(gl.TRIANGLES,0,3);ctx.drawImage(target,0,0,w,h);
  };
}
async function loadOverlayShader(source,toast=false){
  const target=document.createElement('canvas'),gl=target.getContext('webgl2',{alpha:true,premultipliedAlpha:true});
  if(!gl)throw new Error('WebGL 2 is required for the native card dissolve.');
  const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
  const vertex='#version 300 es\nin vec2 Position;out vec2 texCoord;void main(){gl_Position=vec4(Position,0.,1.);'+(toast?'texCoord=vec2((Position.x+1.)*.5,(1.-Position.y)*.5);':'texCoord=(Position+1.)*.5;')+'}';
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,source.replace('#version 150','#version 300 es\nprecision highp float;\nprecision highp int;')));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'Position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  const progress=gl.getUniformLocation(program,toast?'Time':'Progress'),resolution=gl.getUniformLocation(program,toast?'Size':'Resolution');
  const effect=(w,h,value)=>{const width=toast?Math.round(w*viewport.scale):layer.width,height=toast?Math.round(h*viewport.scale):layer.height;if(target.width!==width||target.height!==height){target.width=width;target.height=height;}gl.viewport(0,0,target.width,target.height);gl.uniform1f(progress,value);gl.uniform2f(resolution,w,h);if(!toast)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,layer);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);return target;};
  if(toast)toastBackground=effect;else dissolve=effect;
}
async function loadArt(){
  if(artLoading)return artLoading;
  artLoading=(async()=>{
    const response=await fetch(new URL('defaults.json',base));if(!response.ok)throw new Error('Default locations could not load.');bundled=await response.json();
    await Promise.all(['card','card_expanded','card_fallback','default','random','plains','village','disconnect','disconnect_highlighted','select','select_highlighted','unselect','unselect_highlighted','button','button_highlighted','button_disabled'].map(async name=>{
      const image=new Image();image.src=name.startsWith('button')?new URL('../../kit/assets/widget/'+name+'.png',base):new URL(name+'.png',base);await image.decode();images.set(name,image);
    }));
  })().catch(error=>{artLoading=null;throw error;});return artLoading;
}
async function load(){
  if(loading)return loading;
  loading=(async()=>{
    await Promise.all([loadArt(),mainRenderer.load(),layerRenderer.load(),veilRenderer.load(),HeritageInventory.assets()]);
    const dissolveSource=await fetch(new URL('selection_dissolve.fsh',base));if(!dissolveSource.ok)throw new Error('Card dissolve could not load.');await loadOverlayShader(await dissolveSource.text());
    const toastSource=await fetch(new URL('selection_music_toast.fsh',base));if(!toastSource.ok)throw new Error('Music toast could not load.');await loadOverlayShader(await toastSource.text(),true);
    const source=await fetch(new URL('selection_background.fsh',base));if(!source.ok)throw new Error('Selection background could not load.');
    try{await loadShader(await source.text());}catch(error){notice='Animated background unavailable: '+error.message;}
  })().catch(error=>{loading=null;throw error;});return loading;
}
function resize(){
  const [w,h]=$('flow-resolution').value.split('x').map(Number),locked=lockedScale>0&&(session?.phase!=='complete'||transition.phase!=='idle');
  viewport=P.guiViewport(w,h,locked?lockedScale:playerScale);
  $('flow-scale').disabled=locked;$('flow-scale').value=String(locked?lockedScale:playerScale);
  $('flow-scale-status').textContent=locked?'Pack override: '+lockedScale+'. Effective scale at this resolution: '+viewport.scale+'.':session?.phase==='complete'?'Player GUI scale restored. Effective scale: '+viewport.scale+'.':'Uses the player’s preview GUI scale. Effective scale: '+viewport.scale+'.';
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}$('flow-stage').style.aspectRatio=w+'/'+h;$('flow-stage').style.setProperty('--flow-ratio',w/h);
}
function cover(spawn,uploaded=true){
  const picture=uploaded&&pictures.get(spawn.image);if(picture)return picture;
  const match=/^kingdomsheritage:textures\/gui\/locations\/(default|random|plains|village)\.png$/.exec(spawn.image??'');
  return match?images.get(match[1]):images.get('card_fallback');
}
function cardTitle(spawn,painter=renderer){return HeritageCardText.title(literal(label(spawn,'title')),painter.advance,P.wrap);}
function cardFit(spawn,painter=renderer){const title=cardTitle(spawn,painter),subtitle=HeritageCardText.subtitle(literal(label(spawn,'subtitle')),painter.advance);return {titleLines:title.totalLines,titleClipped:title.clipped,subtitleClipped:subtitle.clipped,subtitleVisible:subtitle.text};}

function drawCard(spawn,x,y,scale,details=false,alpha=1,picture=cover(spawn)){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.translate(64,96);ctx.rotate((details.tilt??0)*Math.PI/180);ctx.translate(-64,-96);ctx.globalAlpha=alpha;
  const fallback=picture===images.get('card_fallback');
  ctx.drawImage(picture,fallback?0:4,fallback?0:4,fallback?128:120,fallback?192:184);
  const frameWidth=Math.round(details.width??128);
  if(frameWidth===128)ctx.drawImage(images.get('card'),0,0);else{const image=images.get('card_expanded');ctx.drawImage(image,0,0,frameWidth-3,192,0,0,frameWidth-3,192);ctx.drawImage(image,371,0,3,192,frameWidth-3,0,3,192);}
  const selectionAlpha=Math.round((details.selection??0)*alpha*255),hoverAlpha=Math.round((details.hover??0)*(1-(details.selection??0))*alpha*255);
  for(const [opacity,color] of [[selectionAlpha,'#f2cd83'],[hoverAlpha,'#eeeeee']])if(opacity>0){ctx.globalAlpha=opacity/255;ctx.fillStyle=color;ctx.fillRect(2,2,124,1);ctx.fillRect(2,189,124,1);ctx.fillRect(2,3,1,186);ctx.fillRect(125,3,1,186);}ctx.globalAlpha=alpha;
  const outline=spawn.outline!==false,title=cardTitle(spawn);renderer.block({x:7,y:title.y,scale:title.scale,column:0,lines:title.lines,lineHeight:9},Infinity,Math.round(alpha*255),Math.floor(clock()/50),outline,!outline);
  const subtitle=HeritageCardText.subtitle(literal(label(spawn,'subtitle')),renderer.advance).text;
  text(subtitle,7,177,{color:0xdddddd,alpha:Math.round(alpha*255),outline,shadow:!outline});
  if(Math.round((details.details??0)*alpha*255)>=4&&frameWidth>140){
    ctx.save();const transform=ctx.getTransform();ctx.setTransform(ctx.canvas.width/viewport.guiWidth,0,0,ctx.canvas.height/viewport.guiHeight,0,0);const left=Math.round(x+132*scale),top=Math.round(y)+Math.round(9*scale),right=Math.round(x+Math.min(366,frameWidth-8)*scale),bottom=Math.round(y)+Math.round(183*scale);ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.setTransform(transform);ctx.globalAlpha=(details.details??0)*alpha;
    const description=literal(label(spawn,'description')),height=P.wrap(description,230,renderer.advance).length*9;scroll=Math.min(scroll,Math.max(0,height-170));
    text(description,134,10-Math.trunc(scroll),{limit:230,alpha:Math.round((details.details??0)*alpha*255),outline,shadow:!outline});ctx.restore();
  }
  ctx.restore();ctx.globalAlpha=1;
}
const cardPreviews=new WeakMap();
async function cardPreview(target,spawn,pictureData){
  let preview=cardPreviews.get(target);
  if(!preview){const context=target.getContext('2d');if(!context)throw new Error('Card preview is unavailable in this browser.');preview={context,renderer:new HeritageCanvas(context)};cardPreviews.set(target,preview);}
  const request={};preview.request=request;
  await Promise.all([loadArt(),preview.renderer.load()]);
  let picture;
  if(pictureData){
    if(preview.source!==pictureData){const image=new Image();image.src=pictureData;await image.decode();if(preview.request!==request)return;preview.source=pictureData;preview.picture=image;}
    picture=preview.picture;
  }else picture=cover(spawn,false);
  if(preview.request!==request)return;
  const previousContext=ctx,previousRenderer=renderer;
  try{
    ctx=preview.context;renderer=preview.renderer;target.width=256;target.height=384;ctx.imageSmoothingEnabled=false;ctx.scale(2,2);
    drawCard(spawn,0,0,1,false,1,picture);
  }finally{ctx=previousContext;renderer=previousRenderer;}
  return {fallback:picture===images.get('card_fallback')};
}
async function monitorPreview(target){
  const context=target.getContext('2d');if(!context)throw new Error('The player view needs Canvas support.');
  const painter=new HeritageCanvas(context);await Promise.all([load(),painter.load()]);
  let layout,signature='',pointer={x:-1000,y:-1000},inventory,inventorySource,kitSignature='',shownSpawns=[],shownPictures={},drag=null,reorderMotion=null,settling=false,slotSignature='',shownPage=0;const uploaded=new Map();
  const point=event=>{const box=target.getBoundingClientRect(),view=P.guiViewport(target.width,target.height,target.dataset.guiScale?Number(target.dataset.guiScale):3);return {x:(event.clientX-box.left)*view.guiWidth/box.width,y:(event.clientY-box.top)*view.guiHeight/box.height};};
  const move=event=>{pointer=point(event);},leave=event=>{if(event?.relatedTarget?.closest?.('.card-text-editor')?.parentElement===target.parentElement)return;pointer={x:-1000,y:-1000};};
  const outside=event=>{if(event.target!==target&&event.target.closest?.('.card-text-editor')?.parentElement!==target.parentElement)leave();};
  target.addEventListener('pointermove',move);target.addEventListener('pointerleave',leave);document.addEventListener('pointermove',outside);
  return {
    defaults:bundled,
    textFit:spawn=>cardFit(spawn,painter),
    async pictures(entries){
      const sources=new Set(entries.map(entry=>entry.data));for(const data of uploaded.keys())if(!sources.has(data))uploaded.delete(data);
      await Promise.all(entries.map(async entry=>{if(uploaded.has(entry.data))return;const image=new Image();image.src=entry.data;await image.decode();uploaded.set(entry.data,image);}));
    },
    at(event){const p=point(event);return layout?.at(p.x,p.y,clock())?.id;},
    beginDrag(id,event){
      const card=layout?.cards.find(card=>card.id===id),spawn=shownSpawns.find(spawn=>spawn.id===id);if(!card||!spawn)return false;
      reorderMotion??=new HeritagePresentation.Reorder(matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);reorderMotion.seed(layout.cards.map(card=>[card.id,card.pose().x]));
      const pose=card.pose(),p=point(event);drag={id,spawn,picture:uploaded.get(shownPictures[id])??cover(spawn),scale:pose.scale,offsetX:P.clamp((p.x-pose.x)/pose.scale,0,128),offsetY:P.clamp((p.y-pose.y)/pose.scale,0,192),point:p};return true;
    },
    moveDrag(event){if(drag)drag.point=point(event);},
    previewOrder(ids){
      if(!drag)return null;drag.order=ids?Array.from(ids):null;if(!ids||!layout.cards.length)return null;
      const index=Math.max(0,Math.min(layout.cards.length-1,ids.indexOf(drag.id)-shownPage*10)),slot=layout.cards[index].target,view=P.guiViewport(target.width,target.height,Number(target.dataset.guiScale)),box=target.getBoundingClientRect();
      return {x:slot.x/view.guiWidth*box.width,y:slot.y/view.guiHeight*box.height,height:192*slot.scale/view.guiHeight*box.height};
    },
    endDrag(){if(drag)settling=true;drag=null;},
    hit(event){
      const p=point(event),card=layout?.at(p.x,p.y,clock());if(!card)return null;const pose=card.pose(),dx=(p.x-pose.x)/pose.scale-64,dy=(p.y-pose.y)/pose.scale-96,angle=-pose.tilt*Math.PI/180,x=64+dx*Math.cos(angle)-dy*Math.sin(angle),y=96+dx*Math.sin(angle)+dy*Math.cos(angle),spawn=shownSpawns.find(spawn=>spawn.id===card.id),title=cardTitle(spawn,painter);
      return {id:card.id,part:x>=132&&pose.width>140?'description':y>=175?'subtitle':y>=title.y-3?'title':'image'};
    },
    drop(event,editable){
      if(!layout)return null;const p=point(event),cards=layout.cards.filter(card=>card.visible&&editable(card.id));if(!cards.length)return null;
      const bounds=card=>{const pose=card.pose(),next=layout.cards.slice(layout.cards.indexOf(card)+1).find(card=>card.visible),right=Math.min(pose.x+128*pose.scale,next?.pose().x??Infinity);return {pose,right,center:(pose.x+right)/2};};
      const card=cards.reduce((best,card)=>Math.abs(p.x-bounds(card).center)<Math.abs(p.x-bounds(best).center)?card:best),{pose,right,center}=bounds(card),after=p.x>=center,view=P.guiViewport(target.width,target.height,Number(target.dataset.guiScale)),box=target.getBoundingClientRect();
      return {id:card.id,after,x:(after?right:pose.x)/view.guiWidth*box.width,y:pose.y/view.guiHeight*box.height,height:192*pose.scale/view.guiHeight*box.height};
    },
    needsResourcePack(spawn,data){return !!spawn?.image&&!uploaded.has(data)&&cover(spawn)===images.get('card_fallback');},
    draw({spawns,selectedId,guiScale=3,width=1920,height=1080,phase='cards',expanded=false,page=null,intro,time=0,names={},pictureData,kit,kitIndex=0,kitCount=1,inventoryMode='player'}){
      if(target.width!==width||target.height!==height){target.width=width;target.height=height;}target.dataset.guiScale=String(guiScale);
      const view=P.guiViewport(width,height,guiScale),w=view.guiWidth,h=view.guiHeight,old={ctx,renderer,viewport,scroll};
      try{
        ctx=context;renderer=painter;viewport=view;scroll=0;ctx.setTransform(width/w,0,0,height/h,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
        rect(0,0,w,h,'#101319');if(shader)shader(w,h,clock()-backgroundStarted);
        if(phase==='intro'){
          const config=intro??P.packDefaults;drawWorld(w,h,time*50,config);if(intro)renderer.intro(config,names,time,w,h,P.sampleSlant('53e2f276-2174-4276-917d-56c0db8848bb'));
          else text('Enter the world',w/2,h/2,{center:true});
        }else if(phase==='kits'){
          if(!kit){text('Choose a kit to preview',w/2,h/2,{center:true});return view;}
          if(!inventory){inventorySource=document.createElement('div');inventorySource.hidden=true;inventorySource.inert=true;target.after(inventorySource);inventory=new HeritageInventory.Inventory(inventorySource);}
          const key=JSON.stringify([kit,inventoryMode]);if(key!==kitSignature){kitSignature=key;inventory.set(kit,{mode:inventoryMode,hideCrafting:true,controlledAim:true});}
          inventory.visible=true;inventory.draw();const bw=inventory.layout.width,bh=inventory.layout.height,x=Math.trunc((w-bw)/2),y=Math.trunc((h-bh)/2);
          ctx.drawImage(inventory.canvas,x,y,bw,bh);const titleY=Math.max(2,y-13),center=x+Math.trunc(bw/2);let title=label(kit,'title')+' ('+(kitIndex+1)+'/'+kitCount+')';
          while(width(literal(title))>Math.min(w-24,bw+60))title=Array.from(title).slice(0,-1).join('');
          if(titleY>=16)text('Choose your starting kit',center,titleY-12,{center:true});text(title,center,titleY,{center:true});
        }else{
          const index=Math.max(0,spawns.findIndex(entry=>entry.id===selectedId)),pageIndex=page===null?Math.floor(index/10):Math.max(0,Math.min(page,Math.floor(Math.max(0,spawns.length-1)/10))),shown=spawns.slice(pageIndex*10,pageIndex*10+10),key=JSON.stringify([shown.map(entry=>entry.id),w,h]);
          if(key!==signature){signature=key;layout=new HeritagePresentation.Cards(shown.map(entry=>entry.id),w,h,clock());}
          const slotsKey=JSON.stringify([pageIndex,w,h]);if(slotsKey!==slotSignature){slotSignature=slotsKey;reorderMotion=null;settling=false;}shownPage=pageIndex;
          shownSpawns=shown;shownPictures=pictureData??{};const selected=shown.some(spawn=>spawn.id===selectedId)?selectedId:null,targetExpanded=expanded?selected:null;layout.selected=selected;if(selected)layout.preview=selected;if(layout.expanded!==targetExpanded){layout.expanded=targetExpanded;layout.layout(clock(),true);}const frame=layout.frame(clock(),drag?{}:pointer),draw=card=>{const spawn=shown.find(entry=>entry.id===card.id),pose=card.pose();drawCard(spawn,pose.x,pose.y,pose.scale,pose,pose.opacity*(drag?.id===card.id ? .25 : 1),uploaded.get(pictureData?.[spawn.id])??cover(spawn));};
          if((drag||settling)&&layout.cards.length){
            reorderMotion??=new HeritagePresentation.Reorder(matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);reorderMotion.seed(layout.cards.map(card=>[card.id,card.pose().x]));
            const ids=drag?.order??spawns.map(spawn=>spawn.id),visible=ids.slice(pageIndex*10,pageIndex*10+10),slots=layout.cards.map(card=>card.target),targets=new Map(),initial=new Map(),all=new Set([...shown.map(spawn=>spawn.id),...visible,...reorderMotion.positions.keys()]),prototype=slots[0];
            for(const id of all){
              const index=visible.indexOf(id),original=spawns.findIndex(spawn=>spawn.id===id);if(original<0)continue;
              targets.set(id,index>=0?slots[index].x:ids.indexOf(id)<pageIndex*10?-128*prototype.scale:w);
              initial.set(id,original<pageIndex*10?-128*prototype.scale:w);
            }
            reorderMotion.seed(initial);const positions=reorderMotion.frame(targets,clock());
            for(const id of ids)if(positions.has(id)){
              const index=visible.indexOf(id),slot=slots[index]??prototype,spawn=spawns.find(spawn=>spawn.id===id),native=layout.cards.find(card=>card.id===id),pose={...(native?.pose()??slot),...slot,x:positions.get(id),y:native?.pose().y??slot.y,width:128,details:0,tilt:0};
              drawCard(spawn,pose.x,pose.y,pose.scale,pose,drag?.id===id ? .25 : 1,uploaded.get(pictureData?.[id])??cover(spawn));
            }
            if(!drag){settling=reorderMotion.active;if(!settling)reorderMotion=null;}
          }else{for(const card of layout.cards)if(card.id!==frame.foreground)draw(card);const front=layout.cards.find(card=>card.id===frame.foreground);if(front)draw(front);}
          if(drag)drawCard(drag.spawn,P.clamp(drag.point.x-drag.offsetX*drag.scale,0,Math.max(0,w-128*drag.scale)),P.clamp(drag.point.y-drag.offsetY*drag.scale,0,Math.max(0,h-192*drag.scale)),drag.scale,{width:128,selection:1},.95,drag.picture);
          text('Choose your starting location',w/2,12,{center:true});if(!shown.length)text('Add a starting location',w/2,h/2,{center:true});
        }
      }finally{ctx=old.ctx;renderer=old.renderer;viewport=old.viewport;scroll=old.scroll;}
      return view;
    },
    destroy(){target.removeEventListener('pointermove',move);target.removeEventListener('pointerleave',leave);document.removeEventListener('pointermove',outside);inventory?.destroy();inventorySource?.remove();}
  };
}
function poolOptions(){
  const pool=session.spawn?.type==='pool'?session.spawn.pool:[];const select=$('flow-pool'),previous=select.value;select.disabled=!pool.length;
  select.replaceChildren(new Option('Random','random'),...pool.map((entry,index)=>new Option((index+1)+'. '+(F.place(entry.target)||entry.type),String(index))));
  if(pool.some((_,index)=>String(index)===previous))select.value=previous;
}
function enter(focus=true){
  const now=clock(),phase=session.phase,justCompleted=phase==='complete'&&previousPhase!=='complete';visited.add(phase);
  if(phase.startsWith('kit')&&phase!==kitPhase){const progress=kitProgress(now);kitConfirmationFrom=previousPhase.startsWith('kit')?progress:0;kitConfirming=phase==='kit-confirm';kitConfirmationStarted=now;kitPhase=phase;if(!previousPhase.startsWith('kit')){kitYaw=NaN;kitPitch=NaN;}}
  if(phase==='intro'&&previousPhase!=='intro'){arrivalToken=crypto.randomUUID();barSlant=P.sampleSlant(arrivalToken,session.arrival.intro.bar_style??'random');}
  previousPhase=phase;resize();needsFocus=focus;
  if(justCompleted)dialog.dispatchEvent(new CustomEvent('heritage:flow-complete',{detail:progressSnapshot()}));
  $('flow-narration').textContent='';
  stopSpeech();speechCues=[];started=phase==='review'?-1:clock();visible=0;expanded='';scroll=0;
  const names={location:'Starting location','location-confirm':'Confirm location',kit:'Starting kit','kit-confirm':'Confirm kit',loading:'Preparing terrain',review:'Your story begins',intro:'Arrival intro',complete:'Preview complete'};
  $('flow-phase').textContent=names[session.phase];$('flow-controls').setAttribute('aria-label',names[session.phase]);
  if(session.phase==='location-confirm'){poolOptions();if(!planApplied&&plannedRoute?.spawnId===session.spawn.id){const index=session.allowed().findIndex(kit=>kit.id===plannedRoute.kitId);if(index>=0){session.kitIndex=index;session.kit=session.allowed()[index];}if(Number.isInteger(plannedRoute.poolIndex)&&session.spawn.pool?.[plannedRoute.poolIndex])$('flow-pool').value=String(plannedRoute.poolIndex);planApplied=true;}}
  updateEditChoices();const kitScreen=['kit','kit-confirm'].includes(session.phase);
  $('flow-inventory').hidden=!kitScreen;
  if(kitScreen){
    if(!inventory)inventory=new HeritageInventory.Inventory($('flow-inventory'),{onControl:control=>{
      if(['page','scroll'].includes(control.kind))inventoryOptions.offset=control.value;
      if(control.kind==='cosmetics')inventoryOptions.cosmetics=!inventoryOptions.cosmetics;
      inventory.set(session.kit,inventoryOptions);
    }});
    inventoryOptions.mode=$('flow-inventory-mode').value;inventoryOptions.hideCrafting=true;inventoryOptions.controlledAim=true;inventory.set(session.kit,inventoryOptions);
  }
  if(session.phase==='review'){
    segments=F.narration($('flow-player').value.trim()||'Player',sampleNames(),session.kit,bundled.translations);
    const story=segments.map(segment=>segment.text).join('');reviewGlyphs=literal(story,0xeeeae0);$('flow-narration').textContent=story;
    let offset=0;for(const segment of segments){
      if(segment.highlight){const [start,length]=segment.highlight;for(const glyph of reviewGlyphs.slice(offset+start,offset+start+length))glyph.tint=0x55ffff;}
      offset+=Array.from(segment.text).length;
    }

  }
  if(session.phase==='intro'){introConfig=P.readJson(JSON.stringify(session.arrival.intro)).config;speechCues=P.blipCues(introConfig,sampleNames());}
  if(session.phase==='review'){const length=segments.reduce((total,segment)=>total+Array.from(segment.text).length*40+segment.pause,0);speechCues=P.revealCues(reviewGlyphs,tick=>F.revealed(segments,tick*50),Math.ceil(length/50)+1,{first:1,step:2,pitch:.95,spread:.1});}
  const custom=session.choices.spawns.some(spawn=>spawn.image&&!/^kingdomsheritage:/.test(spawn.image)&&!pictures.has(spawn.image));
  $('flow-status').textContent=[notice,custom?'Images from external resource packs use the fallback card here.':'',session.phase==='complete'?'Preview complete. Close this window to download your pack.':''].filter(Boolean).join(' ');
  for(const node of buttons.values())node.remove();buttons.clear();
}
function sampleNames(){const spawn=session.arrival??session.spawn;return F.context(spawn,session.kit,$('flow-player').value.trim()||'Player',F.locations(spawn,{biome:$('flow-biome').value,structure:$('flow-structure').value}),bundled.translations);}
function next(){
  const phase=session.phase,now=clock();
  const advance=()=>{let index=0;if(session.spawn?.type==='pool')index=$('flow-pool').value==='random'?Math.floor(Math.random()*session.spawn.pool.length):Number($('flow-pool').value);session.next(index);enter();if(session.phase==='kit')transition.reveal(clock());else if(session.phase==='intro'){sound('confirmation');transition.clear();}else if(session.phase==='complete'){if(phase==='review'){sound('confirmation');transition.reveal(clock());}else transition.clear();}};
  if(['location-confirm','kit-confirm','review'].includes(phase))transition.fade(now,advance);else advance();
}
function back(){
  if(transition.phase!=='idle')return;
  const phase=session.phase,now=clock(),go=()=>{session.back();enter();};
  if(phase==='location-confirm'){cards.confirm(session.spawn.id,false,now);go();}
  else if(phase==='kit-confirm')go();
  else if(['kit','review'].includes(phase))transition.fade(now,()=>{go();transition.reveal(clock());});
}
function locationsScreen(w,h,now){
  const ids=session.choices.spawns.slice(page*10,page*10+10).map(spawn=>spawn.id);
  if(!cards)cards=new HeritagePresentation.Cards(ids,w,h,now);
  else if(cards.width!==w||cards.height!==h||cards.cards[0]?.id!==ids[0])cards.reset(ids,w,h,now);
  if(session.phase==='location-confirm'&&!cards.confirming)cards.confirm(session.spawn.id,true,now);
  const focused=document.activeElement?.dataset.action?.replace(/^card-/,'');
  cardFrame=cards.frame(now,{...pointer,focused,keyboard});expanded=cards.expanded??'';
  const progress=cardFrame.progress,confirming=cards.confirming,active=progress===0&&!confirming;
  if(cardFrame.active!==highlightedCard){if(hoverReady&&cardFrame.active&&active&&transition.phase==='idle')sound('hover');highlightedCard=cardFrame.active;}
  const draw=card=>{const spawn=session.choices.spawns.find(entry=>entry.id===card.id),pose=card.pose();if(pose.opacity>=.02)drawCard(spawn,pose.x,pose.y,pose.scale,pose,pose.opacity);};
  if(layer.width!==canvas.width||layer.height!==canvas.height){layer.width=canvas.width;layer.height=canvas.height;}
  layerContext.setTransform(1,0,0,1,0,0);layerContext.clearRect(0,0,layer.width,layer.height);layerContext.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);layerContext.imageSmoothingEnabled=false;
  ctx=layerContext;renderer=layerRenderer;
  try{for(const card of cards.cards)if(card.id!==cardFrame.foreground)draw(card);}finally{ctx=mainContext;renderer=mainRenderer;}
  if(progress<1)ctx.drawImage(progress>0?dissolve(w,h,progress):layer,0,0,w,h);
  const front=cards.cards.find(card=>card.id===cardFrame.foreground);if(front)draw(front);
  for(let index=0;index<cards.cards.length;index++){
    const card=cards.cards[index],pose=card.pose();if(!active||!card.visible)continue;
    const x=Math.round(pose.x),right=cards.expanded===null&&index+1<cards.cards.length?Math.min(x+Math.round(pose.width*pose.scale),Math.round(cards.cards[index+1].layout.x)):x+Math.round(pose.width*pose.scale);
    hit('card-'+card.id,label(session.choices.spawns.find(spawn=>spawn.id===card.id),'title'),x,card.layout.y-12*pose.scale,right-x,204*pose.scale,()=>{session.choose(card.id);cards.confirm(card.id,true,clock());if(cards.cards.length>1)sound('dissolve');enter();});
  }
  const preview=cards.cards.find(card=>card.id===cards.preview),spawn=session.choices.spawns.find(entry=>entry.id===cards.preview);
  if(active&&preview&&(expanded||label(spawn,'description'))){
    const pose=preview.pose(),index=cards.cards.indexOf(preview),x=Math.round(pose.x),right=expanded?x+Math.round(pose.width*pose.scale):Math.min(x+Math.round(pose.width*pose.scale),index+1<cards.cards.length?Math.round(cards.cards[index+1].layout.x):Infinity),aw=Math.max(12,Math.round(19*pose.scale)),ax=x+Math.min(Math.round(109*pose.scale),Math.max(0,right-x-aw));
    const node=hit('description-'+preview.id,expanded?'Collapse description':'Read description',ax,Math.round(pose.y)+Math.round(80*pose.scale),aw,Math.max(18,Math.round(32*pose.scale)),()=>{cards.expand(preview.id,clock());expanded=cards.expanded??'';scroll=0;});
    ctx.save();ctx.translate(pose.x,pose.y);ctx.scale(pose.scale,pose.scale);ctx.translate(64,96);ctx.rotate(pose.tilt*Math.PI/180);ctx.translate(-64,-96);const sprite=images.get((expanded?'unselect':'select')+(node.matches(':hover,:focus-visible')?'_highlighted':''));ctx.drawImage(sprite,expanded?0:8,4,16,24,(ax-cardFrame.cards[index].layout.x)/pose.scale+1,84,16,24);ctx.restore();
  }
  if(progress>0||confirming){
    const scale=Math.max(.1,Math.min(1,(w-32)/344,(h-116)/192)),limit=Math.max(1,Math.round(192*scale)),promptHeight=P.wrap(literal('Is this your choice?'),limit,renderer.advance).length*9,titleHeight=P.wrap(literal(label(session.spawn,'title')),limit,renderer.advance).slice(0,2).length*9;
    const x=Math.round((w-344*scale)/2+152*scale)+Math.round((1-progress)*12),y=Math.trunc((h-promptHeight-titleHeight-64)/2),alpha=P.clamp((progress-.3)/.7);
    if(alpha>0){text('Is this your choice?',x,y,{limit,alpha:Math.max(4,Math.round(alpha*255))});text(label(session.spawn,'title'),x,y+promptHeight+6,{limit,color:0xf2cd83,maxLines:2,alpha:Math.max(4,Math.round(alpha*255))});}
    button('next',session.allowed().length===1?'Continue':'Yes, choose kit',x,y+promptHeight+titleHeight+18,Math.min(150,limit),next,!confirming||progress<1,alpha);
    button('back','Choose another',x,y+promptHeight+titleHeight+42,Math.min(150,limit),back,!confirming||progress<=.65,alpha);
  }
  if(progress<1)text('Choose your starting location',Math.trunc(w/2),12,{center:true,alpha:Math.max(4,Math.round((1-progress)*255))});
  if(active&&!expanded&&session.allowed().length>1)text('Step 1 of 2',Math.trunc(w/2),h-43,{center:true});
  if(active&&!expanded&&session.choices.spawns.length>10){
    const buttonWidth=Math.min(130,Math.trunc((w-100)/2));arrow('previous-page','Previous page',Math.trunc((w-buttonWidth)/2)-40,h-34,()=>{page--;},page===0,{forward:false});arrow('next-page','Next page',Math.trunc((w+buttonWidth)/2)+8,h-34,()=>{page++;},(page+1)*10>=session.choices.spawns.length);
    const last=cards.cards.at(-1).layout;text((page+1)+' / '+Math.ceil(session.choices.spawns.length/10),Math.round(last.x+last.width*last.scale/2),Math.round(last.y+192*last.scale)+8,{center:true});
  }
}
function kitProgress(now){const eased=HeritagePresentation.ease(Math.fround((now-kitConfirmationStarted)/550));return kitConfirmationFrom+(Number(kitConfirming)-kitConfirmationFrom)*eased;}
function kitScreen(w,h,now){
  const progress=kitProgress(now),reviewing=kitConfirming||progress>0,layout=inventory.layout,bw=layout.width,bh=layout.height,normalX=Math.trunc((w-bw)/2),normalY=Math.trunc((h-bh)/2),center=normalX+Math.trunc(bw/2),pose=HeritagePresentation.kitPose(w,h,bw,bh,progress,now);
  const response=1-Math.exp(-Math.min(.05,Math.max(0,(now-kitRenderedAt)/1000))*12);kitRenderedAt=now;
  const yaw=Math.atan((normalX+layout.inventoryX+layout.playerX-pointer.x)/40)*(reviewing?1-progress:1),pitch=Math.atan((normalY+layout.inventoryY+32-pointer.y)/40)*(reviewing?1-progress:1);
  kitYaw=Number.isNaN(kitYaw)?yaw:kitYaw+(yaw-kitYaw)*response;kitPitch=Number.isNaN(kitPitch)?pitch:kitPitch+(pitch-kitPitch)*response;
  inventory.aim={x:-Math.tan(kitYaw)*40,y:-Math.tan(kitPitch)*40};inventory.visible=true;inventory.draw();
  const host=$('flow-inventory');host.hidden=reviewing;host.style.pointerEvents=transition.phase==='idle'?'':'none';
  if(reviewing){ctx.save();ctx.translate(pose.x+bw*pose.scale/2,pose.y+bh*pose.scale/2);ctx.rotate(pose.tilt*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.drawImage(inventory.canvas,-bw/2,-bh/2,bw,bh);ctx.restore();}
  else{Object.assign(host.style,{left:normalX/w*100+'%',top:normalY/h*100+'%',width:bw/w*100+'%',height:bh/h*100+'%'});const frame=inventory.frame,cssScale=host.clientWidth/bw;frame.style.width=bw+'px';frame.style.height=bh+'px';frame.style.transformOrigin='top left';frame.style.transform='scale('+cssScale+')';}
  const titleY=Math.max(2,normalY-13),title=label(session.kit,'title')+' ('+(session.kitIndex+1)+'/'+session.allowed().length+')';
  if(progress<1){const alpha=Math.max(4,Math.round((1-progress)*255));if(titleY>=16)text('Choose your starting kit',center,titleY-12,{center:true,alpha});let shown=title;while(width(literal(shown))>Math.min(w-24,bw+60))shown=Array.from(shown).slice(0,-1).join('');text(shown,center,titleY,{center:true,alpha});}
  if(reviewing){
    const scale=Math.max(.1,Math.min(1,(w-32)/(bw+216),(h-96)/bh)),left=Math.round((w-(bw+216)*scale)/2+(bw+24)*scale)+Math.round((1-progress)*12),limit=Math.max(1,Math.round(192*scale)),promptHeight=P.wrap(literal('Is this your choice?'),limit,renderer.advance).length*9,textHeight=promptHeight+Math.min(2,P.wrap(literal(label(session.kit,'title')),limit,renderer.advance).length)*9,top=Math.trunc((h-textHeight-64)/2),alpha=P.clamp((progress-.3)/.7);
    if(alpha>0){text('Is this your choice?',left,top,{limit,alpha:Math.max(4,Math.round(alpha*255))});text(label(session.kit,'title'),left,top+promptHeight+6,{color:0xf2cd83,limit,maxLines:2,alpha:Math.max(4,Math.round(alpha*255))});}
    button('next','Continue',left,top+textHeight+18,Math.min(150,limit),next,!kitConfirming||progress<1,alpha);button('back','Choose another',left,top+textHeight+42,Math.min(150,limit),back,!kitConfirming||progress<=.65,alpha);
  }else{
    arrow('previous-kit','Previous kit',Math.max(4,normalX-42),normalY+Math.trunc((bh-32)/2),()=>{session.select(session.kitIndex-1);enter();},session.kitIndex===0,{forward:false});arrow('next-kit','Next kit',Math.min(w-36,normalX+bw+10),normalY+Math.trunc((bh-32)/2),()=>{session.select(session.kitIndex+1);enter();},session.kitIndex+1===session.allowed().length);
    const bottom=Math.min(h-24,normalY+bh+6),size=Math.min(100,Math.trunc((bw-4)/2));button('back','Back',center-size-2,bottom,size,back);button('next','Choose kit',center+2,bottom,size,next);
    if(bottom+34<h)text(label(session.kit,'description'),center,bottom+25,{center:true,color:0xcccccc,limit:w-16,maxLines:1});
  }
}
function reviewScreen(w,h,elapsed){
  const count=visible===Infinity?reviewGlyphs.length:F.revealed(segments,elapsed),complete=count===reviewGlyphs.length;
  const f=Math.fround,margin=Math.min(48,Math.max(16,Math.trunc(w/12))),available=Math.min(560,w-margin*2);let scale=1.5,lines;
  do{lines=P.wrap(reviewGlyphs,Math.max(1,Math.trunc(f(available/scale))),renderer.advance);if(f(lines.length*14*scale)<=Math.max(24,h-136)||scale<=f(.6))break;scale=f(scale-f(.1));}while(true);
  const height=f(lines.length*14*scale),top=f(f((h-height)/2)-24),buttonWidth=Math.min(150,Math.trunc((w-margin*2-8)/2)),buttonY=Math.round(f(f(top+height)+20)),center=Math.trunc(w/2);
  renderer.block({x:w/2,y:top,scale,column:1,lines:lines.map(line=>({...line,width:width(line.glyphs.filter(glyph=>glyph.index<count))})),lineHeight:14},count,255,Math.floor(elapsed/50),true);
  if(complete){if(buttons.has('reveal')&&document.activeElement===buttons.get('reveal'))needsFocus=true;button('next',"That's correct",center-buttonWidth-4,buttonY,buttonWidth,next);button('back','Go back',center+4,buttonY,buttonWidth,back);}
  else{
    hit('reveal','Reveal all',0,0,w,h,revealStory);text('Click or press Space to reveal all',Math.trunc(w/2),h-27,{center:true,color:0xaaaaaa});
  }
}
function drawWorld(w,h,elapsed,config=introConfig){
  const image=images.get('default');
  const fit=Math.max(w/image.width,h/image.height),progress=P.clamp((elapsed/50-config.black_hold_ticks)/config.fade_from_black_ticks),reveal=progress*progress*(3-2*progress),zoom=Math.tan(70*Math.PI/360)/Math.tan((70-10*(1-reveal))*Math.PI/360);
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);ctx.drawImage(image,-image.width*fit/2,-image.height*fit/2,image.width*fit,image.height*fit);ctx.restore();
}
function drawTransition(w,h,now){
  if(veil.width!==canvas.width||veil.height!==canvas.height){veil.width=canvas.width;veil.height=canvas.height;}
  veilContext.setTransform(1,0,0,1,0,0);veilContext.clearRect(0,0,veil.width,veil.height);if(transition.phase==='idle')return;
  veilContext.setTransform(veil.width/w,0,0,veil.height/h,0,0);const opacity=Math.round(transition.opacity(now)*255);veilContext.fillStyle='rgba(0,0,0,'+opacity/255+')';veilContext.fillRect(0,0,w,h);
  if(opacity>=4&&transition.phase==='waiting'&&now-transition.started>=700){
    const oldContext=ctx,oldRenderer=renderer;ctx=veilContext;renderer=veilRenderer;
    try{for(const cell of HeritagePresentation.loadingCells(Math.trunc(w/2),Math.trunc(h/2)-8,now,opacity)){ctx.fillStyle='rgba(255,255,255,'+cell.alpha/255+')';ctx.fillRect(cell.x,cell.y,5,5);}text('Preparing terrain...',Math.trunc(w/2),Math.trunc(h/2)+16,{center:true,alpha:opacity});}finally{ctx=oldContext;renderer=oldRenderer;}
  }
}
function updateMusic(now){
  const tick=Math.floor(now/50),playing=!['intro','complete'].includes(session.phase);for(let n=musicTick;n<tick;n++){musicFade=P.clamp(musicFade+(playing?1/30:-1/40));musicDuck+=Math.sign((session.phase==='review'?.5:1)-musicDuck)*Math.min(.05,Math.abs((session.phase==='review'?.5:1)-musicDuck));}musicTick=tick;
  music.volume=.5*musicFade*musicFade*(3-2*musicFade)*musicDuck;if(!playing&&musicFade===0)music.pause();
}
function drawToast(w,h,now){
  if(['intro','complete'].includes(session.phase))return;
  const elapsed=now-opened-50;if(elapsed<0||elapsed>=6200)return;
  const visible=elapsed<5600?P.clamp(elapsed/600)**2:1-P.clamp((elapsed-5600)/600)**2,x=w-160*visible,time=Math.max(0,elapsed-600);
  const oldContext=ctx,oldRenderer=renderer;ctx=veilContext;renderer=veilRenderer;
  try{ctx.setTransform(veil.width/w,0,0,veil.height/h,0,0);ctx.drawImage(toastBackground(160,32,time/1000),x,0,160,32);HeritageInventory.item(ctx,{id:'minecraft:jukebox'},x+8,8);text(P.parse('<rainbow>'+(bundled.translations['toast.kingdomsheritage.now_playing']??'Now playing')+'</rainbow>'),x+30,7,{tick:Math.floor(time/50)});text(bundled.translations['music.kingdomsheritage.selection']??'Selection music - jvn',x+30,18);}finally{ctx=oldContext;renderer=oldRenderer;}
}
function render(now){
  now=clock();frame=0;if(!dialog.open||!session||document.hidden)return;
  const transitionWasActive=transition.phase!=='idle';transition.tick(now);if(transitionWasActive&&transition.phase==='idle'&&session.phase==='complete')resize();
  if(session.phase==='review'&&started<0&&transition.phase==='idle')started=now;
  startSpeech();const w=viewport.guiWidth,h=viewport.guiHeight,elapsed=started<0?0:now-started;
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
  rect(0,0,w,h,'#101319');if(shader)shader(w,h,now-backgroundStarted);
  activeButtons=new Set();
  const disconnect=hit('disconnect','Disconnect and close preview',8,h-29,31,21,close);
  const disconnectImage=images.get(disconnect.matches(':hover,:focus-visible')?'disconnect_highlighted':'disconnect');
  ctx.drawImage(disconnectImage,12,h-25,23,13);
  if(session.phase.startsWith('location'))locationsScreen(w,h,now);
  else if(session.phase.startsWith('kit'))kitScreen(w,h,now);
  else if(session.phase==='loading'){
    if(elapsed>=50){session.next();enter();transition.reveal(now);}
  }else if(session.phase==='review')reviewScreen(w,h,elapsed);
  else if(session.phase==='intro'){
    drawWorld(w,h,elapsed);renderer.intro(introConfig,sampleNames(),elapsed/50,w,h,barSlant);
    if(elapsed/50>=P.duration(introConfig,sampleNames()))next();
  }else if(session.phase==='complete'){
    text('Your story begins',w/2,h/2-25,{center:true,scale:1.5});
    text(label(session.spawn,'title')+' · '+label(session.kit,'title'),w/2,h/2,{center:true,color:0xf2cd83,limit:w-32});
    button('restart','Play again',w/2-154,h/2+24,150,restart);button('close','Return to pack',w/2+4,h/2+24,150,close);
  }
  updateMusic(now);drawTransition(w,h,now);drawToast(w,h,now);
  for(const [id,node] of buttons)if(!activeButtons.has(id)){node.remove();buttons.delete(id);}
  if(needsFocus){const target=buttons.get('next')??buttons.get('reveal')??[...buttons].find(([id])=>id!=='disconnect')?.[1];if(target&&!target.disabled){needsFocus=false;target.focus({preventScroll:true});}}
  frame=requestAnimationFrame(render);
}
function flowSnapshot(){
  const value=session.snapshot();if(session.spawn?.type==='pool'&&value.poolIndex===null&&$('flow-pool').value!=='random')value.poolIndex=Number($('flow-pool').value);return value;
}
function progressSnapshot(){
  const parts=[],phase=session.phase,passedLocation=!['location','location-confirm'].includes(phase),passedKit=['loading','review','intro','complete'].includes(phase),passedStory=['intro','complete'].includes(phase);
  if(passedLocation&&(visited.has('location')||visited.has('location-confirm')))parts.push('location');
  if(passedKit&&(visited.has('kit')||visited.has('kit-confirm')||session.allowed().length===1&&visited.has('location-confirm')))parts.push('kit');
  if(passedStory&&visited.has('review'))parts.push('arrival');if(phase==='complete'&&(visited.has('intro')||!session.arrival.intro&&visited.has('review')))parts.push('intro');
  return {...flowSnapshot(),parts,settings:{resolution:$('flow-resolution').value,guiScale:lockedScale||playerScale,playerGuiScale:playerScale,inventory:$('flow-inventory-mode').value}};
}
function editChoices(){
  const snapshot=session?flowSnapshot():null,location=previewState?.locations.find(entry=>previewState.namespace+':'+entry.path===snapshot?.spawnId),kit=previewState?.kits.find(entry=>previewState.namespace+':'+entry.path===snapshot?.kitId);
  const destination=location?.fields.type==='pool'&&Number.isInteger(snapshot?.poolIndex)?location.destinations[snapshot.poolIndex]:null,intro=destination&&Object.hasOwn(destination,'intro')&&destination.intro!==''?destination.intro:location?.intro;
  return {snapshot,location,kit:kit?.id===HeritagePack.emptyKit.id?null:kit,intro:typeof intro==='string'&&intro&&(location?.fields.type!=='pool'||Number.isInteger(snapshot?.poolIndex))?intro:null};
}
function updateEditChoices(){
  const choices=editChoices();$('flow-edit-menu').hidden=!choices.location&&!choices.kit;$('flow-edit-location').disabled=!choices.location;$('flow-edit-kit').disabled=!choices.location||!choices.kit;$('flow-edit-intro').disabled=!choices.location||!choices.intro;
}
for(const kind of ['location','kit','intro'])$('flow-edit-'+kind).addEventListener('click',()=>{
  const choices=editChoices();if(!choices.location||kind==='kit'&&!choices.kit||kind==='intro'&&!choices.intro)return;
  const resume={...choices.snapshot,phase:kind==='intro'?'intro':kind==='kit'&&session.allowed().length>1?'kit':'location-confirm'};
  editAfterClose={kind,id:kind==='location'?choices.location.id:kind==='kit'?choices.kit.id:choices.intro,locationId:choices.location.id,resume,progress:progressSnapshot()};close();
});
function restart(snapshot=null){if(!session)return;transition.clear();cards=null;cardFrame=null;kitPhase='';previousPhase='';kitConfirmationFrom=0;kitConfirming=false;highlightedCard=null;hoverReady=false;musicFade=0;musicDuck=1;musicTick=Math.floor(clock()/50);opened=clock();session.restart();visited=new Set();planApplied=false;if(snapshot?.phase&&!session.resume(snapshot))notice='The previous choice is unavailable. Choose a location to continue.';page=Math.max(0,Math.floor(session.choices.spawns.findIndex(entry=>entry.id===plannedRoute?.spawnId)/10));inventoryOptions={mode:$('flow-inventory-mode').value};poolOptions();if(snapshot?.phase&&Number.isInteger(snapshot.poolIndex)&&session.spawn?.pool?.[snapshot.poolIndex])$('flow-pool').value=String(snapshot.poolIndex);music.currentTime=0;music.muted=$('flow-mute').checked;music.play().catch(()=>{});enter();}
function close(){dialog.close();}
async function open(output,state,options={}){
  if(dialog.open)return;
  flowReturnFocus=document.activeElement;const id=++openId;previewState=structuredClone(state);playerScale=Number($('flow-scale').value);session=null;notice='';plannedRoute=options.route??options.resume??null;$('flow-target').hidden=!plannedRoute;$('flow-target').textContent=options.resume?'Resuming your selected path from '+(options.resume.phase??'selection').replaceAll('-',' ')+'.':plannedRoute?'Choose the location shown in the test path. Its kit and pool destination are preselected.':'';dialog.showModal();$('flow-phase').textContent='Loading preview…';$('flow-status').textContent='Loading game assets…';
  try{
    HeritageDialogueAudio.prepare().catch(error=>{notice='Preview audio could not load: '+error.message;});
    await load();if(!dialog.open||id!==openId)return;const choices=F.catalog(output,bundled);if(plannedRoute){const spawn=choices.spawns.find(entry=>entry.id===plannedRoute.spawnId),kit=choices.kits.find(entry=>entry.id===plannedRoute.kitId);$('flow-target').textContent=(options.resume?'Resuming: ':'Test path: ')+(spawn?label(spawn,'title'):'Unavailable location')+(kit?' / '+label(kit,'title'):'')+(Number.isInteger(plannedRoute.poolIndex)?' / Place '+(plannedRoute.poolIndex+1):'');}lockedScale=choices.guiScale;resize();pictures.clear();
    for(const entry of previewState.locations)if(HeritagePack.usesPicture(entry)){
      const image=new Image();image.src=entry.picture.data;await image.decode();pictures.set(HeritagePack.pictureId(previewState.namespace,entry.path),image);
    }
    if(!dialog.open||id!==openId)return;session=new F.Session(choices);opened=clock();restart(options.resume);if(session.phase==='intro')transition.clear();else{transition.phase='waiting';transition.from=1;transition.reveal(clock());}frame=requestAnimationFrame(render);
  }catch(error){if(!dialog.open||id!==openId)return;$('flow-status').textContent='Could not open the preview: '+error.message;$('flow-phase').textContent='Preview unavailable';}
}
$('flow-close').addEventListener('click',close);$('flow-restart').addEventListener('click',restart);$('flow-mute').addEventListener('change',mute);
$('flow-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('flow-stage').requestFullscreen();}catch(error){$('flow-status').textContent='Full screen unavailable: '+error.message;}});
$('flow-resolution').addEventListener('change',()=>{if(session)resize();});
$('flow-scale').addEventListener('change',()=>{playerScale=Number($('flow-scale').value);if(session)resize();});
for(const id of ['flow-player','flow-biome','flow-structure','flow-inventory-mode'])$(id).addEventListener('change',()=>{if(session)enter(false);});
$('flow-stage').addEventListener('wheel',event=>{if(!expanded)return;event.preventDefault();scroll=Math.max(0,scroll+Math.sign(event.deltaY)*16);},{passive:false});
$('flow-stage').addEventListener('keydown',event=>{
  if(!session)return;keyboard=true;hoverReady=true;if(transition.phase!=='idle'){event.preventDefault();return;}
  if(['kit','kit-confirm'].includes(session.phase)&&event.key.toLowerCase()==='e'){event.preventDefault();sound('click');back();}
  else if(session.phase==='kit-confirm'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const ids=['next','back','disconnect'],index=ids.findIndex(id=>buttons.get(id)===document.activeElement),direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;buttons.get(ids[(index+direction+ids.length)%ids.length])?.focus();}
  else if(session.phase==='review'&&visible!==Infinity&&[' ','Enter'].includes(event.key)&&F.revealed(segments,clock()-started)<reviewGlyphs.length){event.preventDefault();revealStory();}
  else if(session.phase==='location'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(cards.expanded!==null)return;const index=cards.cards.findIndex(card=>'card-'+card.id===document.activeElement?.dataset.action)+(event.key==='ArrowLeft'?-1:1);const card=cards.cards[index];if(card)buttons.get('card-'+card.id)?.focus();}
  else if(session.phase==='kit'&&['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.closest('#flow-inventory')){event.preventDefault();session.select(session.kitIndex+(event.key==='ArrowLeft'?-1:1));enter();}
});
dialog.addEventListener('cancel',event=>{if(!session||session.phase==='complete')return;event.preventDefault();if(['location-confirm','kit','kit-confirm','review'].includes(session.phase)&&transition.phase==='idle'){sound('click');back();}});
dialog.addEventListener('close',async()=>{
  openId++;hiddenAt=0;lockedScale=0;transition.clear();cards=null;veilContext.clearRect(0,0,veil.width,veil.height);
  $('flow-scale').disabled=false;$('flow-scale').value=String(playerScale);
  if(frame)cancelAnimationFrame(frame);frame=0;music.pause();stopSounds();stopSpeech();
  inventory?.destroy();inventory=null;$('flow-inventory').replaceChildren();$('flow-inventory').hidden=true;
  for(const node of buttons.values())node.remove();buttons.clear();session=null;
  if(document.fullscreenElement===$('flow-stage'))await document.exitFullscreen().catch(()=>{});
  if(editAfterClose){const detail=editAfterClose;editAfterClose=null;dialog.dispatchEvent(new CustomEvent('heritage:flow-edit',{detail}));}else if(!dialog.open){const reviewId=flowReturnFocus?.dataset?.reviewTest,launcher=reviewId?document.querySelector('[data-review-test="'+CSS.escape(reviewId)+'"]'):flowReturnFocus,target=launcher?.isConnected&&launcher!==document.body&&launcher.getClientRects().length?launcher:$('preview-flow');target.focus({preventScroll:true});}
});
$('flow-stage').addEventListener('pointermove',event=>{keyboard=false;hoverReady=true;const bounds=$('flow-canvas').getBoundingClientRect();if(viewport)pointer={x:Math.trunc((event.clientX-bounds.left)*viewport.guiWidth/bounds.width),y:Math.trunc((event.clientY-bounds.top)*viewport.guiHeight/bounds.height)};});
$('flow-stage').addEventListener('pointerdown',()=>{keyboard=false;});
document.addEventListener('visibilitychange',()=>{
  if(!dialog.open||!session)return;
  if(document.hidden){hiddenAt=clock();if(frame)cancelAnimationFrame(frame);frame=0;music.pause();stopSounds();stopSpeech();}
  else{if(hiddenAt){const paused=clock()-hiddenAt;if(started>=0)started+=paused;opened+=paused;transition.started+=paused;kitConfirmationStarted+=paused;musicTick+=Math.floor(paused/50);if(cards){cards.confirmationStarted+=paused;cards.renderedAt+=paused;for(const card of cards.cards)card.started+=paused;}hiddenAt=0;}if(!['intro','complete'].includes(session.phase))music.play().catch(()=>{});if(!frame)frame=requestAnimationFrame(render);}
});
globalThis.HeritageFlowPreview={open,cardPreview,monitorPreview,catalog:async output=>{await loadArt();return {choices:F.catalog(output,bundled),translations:bundled.translations};}};
})();
