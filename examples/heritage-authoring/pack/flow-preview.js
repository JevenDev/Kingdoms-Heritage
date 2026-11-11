(() => {
'use strict';
const clock=()=>Math.trunc(performance.now());
const F=HeritageFlow,P=HeritagePreview,$=id=>document.getElementById(id),dialog=$('flow-dialog');
const canvas=$('flow-canvas'),mainContext=canvas.getContext('2d'),mainRenderer=new HeritageCanvas(mainContext),base=new URL('assets/',document.currentScript.src);
let ctx=mainContext,renderer=mainRenderer;
const layer=document.createElement('canvas'),layerContext=layer.getContext('2d'),layerRenderer=new HeritageCanvas(layerContext),transition=new HeritagePresentation.Transition();
const partyMotion=new HeritagePresentation.Spring(0,0,.001,.02);
let partyOpen=false,partyMenu=null,partyMenuFocus=false,partyPage=0,partyPageAt=0,partyPageCells=[],outgoingPeers=[],partyPortraits=[],partyPages=1,partyFocusPage=false,waitingForParty=false,revealedAt=-1;
const partyMembers=new Map(),partyInvites=new Map();
const playerName=()=>$('flow-player').value.trim()||'Player';
const sampleCount=()=>P.clamp(Math.trunc(Number($('flow-sample-players').value))||0,0,20);
const selectionScreen=()=>session&&!['intro','complete'].includes(session.phase);
const partyEnabled=()=>selectionScreen()&&!session.shopOnly&&sampleCount()>0;
let effectNotice='';
let cards,cardFrame,kitConfirmationFrom=0,kitConfirmationStarted=0,kitConfirming=false,kitPhase='',barSlant=0,arrivalToken,keyboard=false,pointer={x:0,y:0},dissolve,toastBackground,previousPhase='';
let musicTick=0,musicFade=0,musicDuck=1,hoverReady=false;
const backgroundStarted=clock();
const veil=document.createElement('canvas'),veilContext=veil.getContext('2d'),veilRenderer=new HeritageCanvas(veilContext);veil.setAttribute('aria-hidden','true');Object.assign(veil.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',imageRendering:'pixelated',background:'transparent',border:'0',borderRadius:'0',boxShadow:'none'});$('flow-screen').append(veil);
let carousel,outgoingCards=[],browseFocus=null,kitFrames=new Map();
let shopPage=0,shopKit=null,shopTrade=null,shopSection='',shopSectionPage=0;
const shopTabRows=6,shopTabHeight=26,shopTabPitch=27,shopTabWidth=28;
const shopTradeDuration=270,tradeSprite=document.createElement('canvas');
tradeSprite.width=tradeSprite.height=16;
const tradeContext=tradeSprite.getContext('2d');
tradeContext.imageSmoothingEnabled=false;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const shopInventoryOptions={mode:'player',hideCrafting:true,controlledAim:true,passiveWheel:true};
let kitYaw=NaN,kitPitch=NaN,kitRenderedAt=0,highlightedCard=null;
const pictures=new Map(),images=new Map(),buttons=new Map(),sounds=new Set();
let session,bundled,loading,artLoading,inventory,viewport,page=0,expanded='',scroll=0,started=0,frame=0,opened=0,visible=0;
let flowReturnFocus=null,needsFocus=false,openId=0,hiddenAt=0,lockedScale=0,playerScale=4,plannedRoute=null,planApplied=false,visited=new Set(),editAfterClose=null;
let introConfig,segments=[],reviewGlyphs=[],shader,activeButtons,previewState,inventoryOptions={mode:'player'},notice='';
const music=new Audio();music.preload='none';music.src=new URL('selection.ogg',base);music.loop=true;music.volume=.18;
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
function inputReady(id){return transition.phase==='idle'||waitingForParty&&transition.phase==='waiting'&&(id.startsWith('party-')||id==='disconnect');}
function hit(id,name,x,y,w,h,action,disabled=false){
  activeButtons.add(id);
  let button=buttons.get(id);
  if(!button){
    button=document.createElement('button');button.type='button';button.className='flow-hit';button.dataset.action=id;
    button.addEventListener('click',()=>{if(!button.disabled&&inputReady(id)){sound('click');button.action();}});

    $(id.startsWith('party-')&&id!=='party-suggestion'?'flow-party-controls':'flow-controls').append(button);buttons.set(id,button);
  }
  button.action=action;button.disabled=disabled||!inputReady(id);button.setAttribute('aria-label',name);
  if(id==='disconnect')button.style.zIndex=2;
  Object.assign(button.style,{left:x/viewport.guiWidth*100+'%',top:y/viewport.guiHeight*100+'%',width:w/viewport.guiWidth*100+'%',height:h/viewport.guiHeight*100+'%'});
  return button;
}
function button(id,name,x,y,w,action,disabled=false,alpha=1,height=20){
  const accessible=id.startsWith('description-')?(expanded?'Collapse description':'Read description'):({'previous-kit':'Previous kit','next-kit':'Next kit','previous-page':'Previous page','next-page':'Next page'})[id]??name;
  const node=hit(id,accessible,x,y,w,height,action,disabled),hover=!disabled&&node.matches(':hover,:focus-visible'),image=images.get(disabled?'button_disabled':hover?'button_highlighted':'button');
  ctx.save();ctx.globalAlpha=alpha;
  if(image){
    const edge=disabled?1:3;
    for(const [sx,sw,dx,dw] of [[0,edge,x,edge],[edge,image.width-edge*2,x+edge,w-edge*2],[image.width-edge,edge,x+w-edge,edge]])for(let offset=0;offset<dw;offset+=sw){
      const tile=Math.min(sw,dw-offset);ctx.drawImage(image,sx,0,tile,image.height,dx+offset,y,tile,height);
    }
  }else rect(x,y,w,height,hover?'#888':'#555');
  text(name,x+w/2,y+Math.trunc((height-8)/2),{center:true,color:disabled?0xa0a0a0:0xffffff,limit:w-6,maxLines:1,outline:false,shadow:true,alpha:Math.round(alpha*255)});ctx.restore();
}
function arrow(id,name,x,y,action,disabled=false,{scale=1,compact=false,forward=true}={}){
  const node=hit(id,name,x,y,(compact?19:32)*scale,32*scale,action,disabled);
  const hover=!disabled&&node.matches(':hover,:focus-visible'),sprite=images.get((forward?'select':'unselect')+(hover?'_highlighted':''));
  ctx.save();ctx.filter=disabled?'brightness(35%)':'none';ctx.drawImage(sprite,forward?8:0,4,16,24,x+(compact?1:8)*scale,y+4*scale,16*scale,24*scale);ctx.restore();
}
async function loadShader(source){
  const target=document.createElement('canvas'),gl=target.getContext('webgl2',{alpha:false});if(!gl)throw new Error('WebGL 2 is unavailable.');
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
  if(!gl)throw new Error('WebGL 2 is unavailable.');
  const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
  const vertex='#version 300 es\nin vec2 Position;out vec2 texCoord;void main(){gl_Position=vec4(Position,0.,1.);'+(toast?'texCoord=vec2((Position.x+1.)*.5,(1.-Position.y)*.5);':'texCoord=(Position+1.)*.5;')+'}';
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,source.replace('#version 150','#version 300 es\nprecision highp float;\nprecision highp int;')));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'Position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  const progress=gl.getUniformLocation(program,toast?'Time':'Progress'),resolution=gl.getUniformLocation(program,toast?'Size':'Resolution');
  const edge=toast?null:gl.getUniformLocation(program,'EdgeColor');
  const effect=(w,h,value,input=layer,white=false)=>{
    const width=toast?Math.round(w*viewport.scale):input.width,height=toast?Math.round(h*viewport.scale):input.height;
    if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
    gl.viewport(0,0,width,height);gl.uniform1f(progress,value);gl.uniform2f(resolution,w,h);
    if(!toast){
      if(white)gl.uniform3f(edge,1,1,1);else gl.uniform3f(edge,.95,.73,.40);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
    return target;
  };
  if(toast)toastBackground=effect;else dissolve=effect;
}
async function loadArt(){
  if(artLoading)return artLoading;
  artLoading=(async()=>{
    const response=await fetch(new URL('defaults.json?v=3',base));if(!response.ok)throw new Error('Default locations could not load.');bundled=await response.json();
    await Promise.all(['card','card_expanded','card_fallback','default','random','plains','village','disconnect','disconnect_highlighted','select','select_highlighted','unselect','unselect_highlighted','button','button_highlighted','button_disabled','tab_button','tab_button_selected','empty_slot','send_request','shop','tab_top_selected_1','tab_top_selected_2','tab_top_unselected_1','experience_bar_background','experience_bar_progress'].map(async name=>{
      const image=new Image();image.src=name.startsWith('button')?new URL('../../kit/assets/widget/'+name+'.png',base):new URL((name==='shop'?'../../kit/assets/':'')+name+'.png',base);await image.decode();images.set(name,image);
    }));
    const bar=images.get('experience_bar_progress'),red=document.createElement('canvas');
    red.width=bar.width;red.height=bar.height;
    const pixels=red.getContext('2d');pixels.drawImage(bar,0,0);
    const frame=pixels.getImageData(0,0,red.width,red.height);
    for(let i=0;i<frame.data.length;i+=4){
      frame.data[i]*=1.65;frame.data[i+1]*=.42;frame.data[i+2]*=.72;
    }
    pixels.putImageData(frame,0,0);images.set('experience_bar_red',red);
  })().catch(error=>{artLoading=null;throw error;});return artLoading;
}
async function load(){
  if(loading)return loading;
  loading=(async()=>{
    await Promise.all([loadArt(),mainRenderer.load(),layerRenderer.load(),veilRenderer.load(),HeritageInventory.assets()]);
    const effects=await Promise.allSettled([
      ['selection_dissolve',loadOverlayShader],['selection_music_toast',source=>loadOverlayShader(source,true)],
      ['selection_background',loadShader]
    ].map(async ([name,init])=>{
      const response=await fetch(new URL(name+'.fsh',base));
      if(!response.ok)throw new Error(name+' could not load.');
      await init(await response.text());
    }));
    if(effects.some(effect=>effect.status==='rejected'))effectNotice='Some visual effects are unavailable on this browser.';
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
    draw({spawns,selectedId,guiScale=3,width:pixelWidth=1920,height:pixelHeight=1080,phase='cards',expanded=false,page=null,intro,time=0,names={},pictureData,kit,kitIndex=0,kitCount=1,inventoryMode='player',kitPreview='inventory'}){
      if(target.width!==pixelWidth||target.height!==pixelHeight){target.width=pixelWidth;target.height=pixelHeight;}target.dataset.guiScale=String(guiScale);
      const view=P.guiViewport(pixelWidth,pixelHeight,guiScale),w=view.guiWidth,h=view.guiHeight,old={ctx,renderer,viewport,scroll};
      try{
        ctx=context;renderer=painter;viewport=view;scroll=0;ctx.setTransform(pixelWidth/w,0,0,pixelHeight/h,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
        rect(0,0,w,h,'#101319');if(shader)shader(w,h,clock()-backgroundStarted);
        if(phase==='intro'){
          const config=intro??P.packDefaults;drawWorld(w,h,time*50,config);if(intro)renderer.intro(config,names,time,w,h,P.sampleSlant('53e2f276-2174-4276-917d-56c0db8848bb'));
          else text('Enter the world',w/2,h/2,{center:true});
        }else if(phase==='kits'){
          if(!kit){text('Choose a kit to preview',w/2,h/2,{center:true});return view;}
          if(!inventory){inventorySource=document.createElement('div');inventorySource.hidden=true;inventorySource.inert=true;target.after(inventorySource);inventory=new HeritageInventory.Inventory(inventorySource);}
          const modelOnly=kitPreview==='model';
          const mode=modelOnly?'player':inventoryMode,key=JSON.stringify([kit,mode,modelOnly]);
          if(key!==kitSignature){kitSignature=key;inventory.set(kit,{mode,modelOnly,hideCrafting:true,controlledAim:true});}
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
const partyText=(key,...args)=>{
  let index=0;
  return bundled.translations['screen.kingdomsheritage.party_'+key].replace(/%s/g,()=>String(args[index++]));
};
const sampleSkins=['alex','ari','efe','kai','makena','noor','sunny','zuri','steve'].map(name=>{
  const image=new Image();image.src=new URL('../../kit/assets/'+name+'.png',base);
  return {name:name[0].toUpperCase()+name.slice(1),image};
});
function peer(id){
  const skin=sampleSkins[id%sampleSkins.length],suffix=Math.floor(id/sampleSkins.length)+1;
  let name=skin.name+(suffix===1?'':suffix);
  if(name===playerName())name+=' (guest)';
  return {name,image:skin.image};
}
const companionNames=()=>[...partyMembers.keys()].map(id=>peer(id).name);
function updateParty(){
  $('flow-sample-accept').hidden=!partyEnabled()||!partyInvites.size;
  if(partyInvites.size)$('flow-sample-accept').textContent='Simulate '+peer(partyInvites.keys().next().value).name+' accepting the invite';
  $('flow-sample-ready').hidden=!waitingForParty;
}
function toggleParty(open){
  if(open&&!partyEnabled())return;
  partyMotion.select(Number(open),clock());partyOpen=open;partyMenu=null;partyMenuFocus=false;
  $('flow-controls').inert=$('flow-inventory').inert=open;
  if(open)HeritageInventory.hideTooltip();
  buttons.get('party-trigger')?.focus({preventScroll:true});
}
function leaveParty(){
  partyMembers.clear();partyInvites.clear();
  if(waitingForParty){
    waitingForParty=false;enter(false);visible=Infinity;transition.reveal(clock());
  }else if(session.phase==='review')enter(false);
  updateParty();
}
$('flow-sample-players').addEventListener('change',()=>{
  $('flow-sample-players').value=String(sampleCount());
  if(!session)return;
  if(!sampleCount())toggleParty(false);
  const wasGrouped=partyMembers.size>0;
  for(const id of partyMembers.keys())if(id>=sampleCount())partyMembers.delete(id);
  for(const id of partyInvites.keys())if(id>=sampleCount())partyInvites.delete(id);
  if(partyMenu?.id>=sampleCount())partyMenu=null;
  if(wasGrouped&&!partyMembers.size)leaveParty();else if(wasGrouped&&session.phase==='review'&&!waitingForParty)enter(false);
  updateParty();
});
$('flow-sample-accept').addEventListener('click',()=>{
  const id=partyInvites.keys().next().value;
  if(id===undefined||partyMembers.size>=7||partyInvites.get(id)<=clock())return;
  partyInvites.delete(id);partyMembers.set(id,clock());
  if(partyMembers.size===7)partyInvites.clear();
  if(session.phase==='review'&&!waitingForParty)enter(false);
  updateParty();buttons.get('party-trigger')?.focus({preventScroll:true});
});
$('flow-sample-ready').addEventListener('click',()=>{
  if(!waitingForParty)return;
  waitingForParty=false;toggleParty(false);updateParty();
  session.next();enter();
  if(session.phase==='intro'){sound('confirmation');transition.clear();}
  else transition.reveal(clock());
});
const partyFace=sampleSkins.at(-1).image;
function face(image,x,y,size){
  if(size>8)rect(x,y,size,size,'#000');
  if(!image.complete||!image.naturalWidth)return;
  ctx.drawImage(image,8,8,8,8,x,y,size,size);
  ctx.drawImage(image,40,8,8,8,x,y,size,size);
}
function outline(x,y,size,color){ctx.strokeStyle=color;ctx.strokeRect(x+.5,y+.5,size-1,size-1);}
function tooltipFrame(x,y,w,h){
  rect(x-3,y-3,w+6,h+6,'#100010f0');
  const border=ctx.createLinearGradient(x,y,x,y+h);
  border.addColorStop(0,'#5000ff50');border.addColorStop(1,'#28007f50');
  ctx.strokeStyle=border;ctx.strokeRect(x-2.5,y-2.5,w+5,h+5);
}
function tooltip(lines,x,y,w,h){
  const glyphs=lines.map(([line,color])=>literal(line,color)),tw=Math.max(...glyphs.map(width)),th=glyphs.length*10;
  x=Math.max(4,Math.min(x,w-tw-4));y=Math.max(4,Math.min(y,h-th-6));
  tooltipFrame(x,y,tw,th+2);
  glyphs.forEach((line,index)=>text(line,x,y+index*10+(index>0?2:0),{outline:false,shadow:true}));
}
function partyStage(){
  if(waitingForParty)return 4;
  if(session.phase==='review')return 3;
  if(session.phase==='loading')return 2;
  return session.phase.startsWith('kit')?1:0;
}
function openPartyMenu(id,x,y,focus=false){partyMenu={id,x,y};partyMenuFocus=focus;}
function changePartyPage(offset,focus=false){
  const page=P.clamp(partyPage+offset,0,partyPages-1);
  if(page===partyPage)return;
  partyPage=page;partyPageAt=clock();outgoingPeers=partyPageCells;partyMenu=null;partyFocusPage=focus;
}
function drawParty(w,h,now){
  const members=[...partyMembers.keys()],joined=members.length>0,ready=partyText('ready_count',Number(waitingForParty),members.length+1);
  const peers=Array.from({length:sampleCount()},(_,id)=>id),others=peers.filter(id=>!partyMembers.has(id));
  const visibility=P.clamp(partyMotion.motion(now).position);
  const canClick=partyOpen&&visibility>.65,shift=(1-visibility)*10;
  let hint=null;
  partyPortraits=[];
  if(visibility>.001){
    ctx.globalAlpha=.94*visibility;
    if(shader)shader(w,h,now-backgroundStarted);else rect(0,0,w,h,'#171a20');
    ctx.globalAlpha=1;
    const title=[...literal(partyText('your_party'),0xf4f1e8),...literal('  '+(members.length+1)+' / 8',0xf2cd83)].map((glyph,index)=>({...glyph,index}));
    const other=partyText('other_players'),empty=partyText('no_other_players'),stage=partyStage();
    const spawn=partyText('spawn_choice',stage===0?partyText('choosing_spawn'):label(session.spawn,'title'));
    const kit=stage===0?partyText('choosing_kit'):label(session.kit,'title');
    const summary=[...literal(spawn,0xf2cd83),...literal('  ·  '+partyText('your_kit',kit)+'  ·  '+ready,0xcccccc)].map((glyph,index)=>({...glyph,index}));
    const lines=joined?P.wrap(summary,Math.max(1,w-24),renderer.advance).slice(0,2):[];
    const summaryHeight=joined?lines.length*11+19:0;
    const layout=HeritagePresentation.partyLayout(w,h,width(title),width(literal(other)),width(literal(empty)),others.length,summaryHeight,partyPage,value=>width(literal(value)));
    partyPage=layout.page;partyPages=layout.pageCount;
    const alpha=Math.round(visibility*255);
    text(title,layout.partyCenter,layout.top+shift,{center:true,alpha});
    text(other,layout.otherCenter,layout.top+shift,{center:true,alpha,color:0xf4f1e8});
    if(!others.length)text(empty,layout.otherCenter,layout.top+20+shift,{center:true,alpha,color:0xaaaaaa});
    const portrait=(id,name,image,x,y,stage,color,otherPlayer)=>{
      const actionId='party-'+id;
      const node=hit(actionId,name,x-1,y-1,26,26,()=>{
        if(otherPlayer!==undefined)openPartyMenu(otherPlayer,keyboard?x+29:pointer.x,keyboard?y+16:pointer.y,keyboard);
      },!canClick);
      if(!node.disabled)partyPortraits.push({id:actionId,x,y,party:otherPlayer===undefined});
      if(otherPlayer!==undefined)node.oncontextmenu=event=>{event.preventDefault();if(canClick)openPartyMenu(otherPlayer,pointer.x,pointer.y);};
      face(image,x,y,24);
      if(color){
        outline(x-1,y-1,26,color);
        if(stage===2){
          for(const cell of HeritagePresentation.loadingCells(x+12,y+12,now,255,4,1))rect(cell.x,cell.y,4,4,'rgba(255,255,255,'+cell.alpha/255+')');
        }else{
          rect(x+12,y+12,11,11,'#000');
          if(stage===4){
            for(const [dx,dy] of [[2,5],[4,7],[6,5],[8,3]])rect(x+12+dx,y+12+dy,2,2,'#55ff55');
          }else text(partyText('stage_short_'+stage),x+18,y+14,{center:true,color:stage===1?0x55ffff:0xffff55});
        }
      }
      if(node.matches(':hover,:focus-visible')&&canClick){
        outline(x-2,y-2,28,'#fff');
        hint=[[name,color?0xffff55:0xffffff],[partyText('stage_'+stage),0xaaaaaa]];
        if(otherPlayer!==undefined)hint.push([partyText(partyInvites.has(otherPlayer)?'invited':'more'),0xaaaaaa]);
        else hint.push([id==='self'?partyText('you'):partyText('member'),0xaaaaaa]);
      }
      if(partyInvites.has(otherPlayer))ctx.drawImage(images.get('send_request'),x+17,y+17,15,15);
    };
    ctx.globalAlpha=visibility;
    for(const [index,{x,y}] of layout.slots.entries()){
      const top=y+shift;
      if(index===0)portrait('self',playerName(),partyFace,x,top,stage,joined?'#55cfff':'#55ff55');
      else if(index<=members.length){
        const id=members[index-1],member=peer(id),blend=P.clamp((now-partyMembers.get(id))/180);
        ctx.globalAlpha=visibility*(1-blend);ctx.drawImage(images.get('empty_slot'),x-1,top-1,26,26);
        ctx.globalAlpha=visibility*blend;portrait('member-'+id,member.name,member.image,x,top,stage===4?3:stage,'#ffff55');ctx.globalAlpha=visibility;
      }else{
        ctx.drawImage(images.get('empty_slot'),x-1,top-1,26,26);
        if(pointer.x>=x-1&&pointer.x<x+25&&pointer.y>=top-1&&pointer.y<top+25)hint=[[partyText('empty_slot'),0xaaaaaa]];
      }
    }
    const blend=P.clamp((now-partyPageAt)/180);
    if(blend<1){
      ctx.globalAlpha=visibility*(1-blend);
      for(const {id,x,y} of outgoingPeers)face(peer(id).image,x,y+shift,24);
    }else outgoingPeers=[];
    partyPageCells=layout.others.map(({x,y},index)=>({id:others[layout.first+index],x,y}));
    ctx.globalAlpha=visibility*blend;
    for(const {id,x,y} of partyPageCells){
      const player=peer(id);portrait('peer-'+id,player.name,player.image,x,y+shift,0,null,id);
    }
    ctx.globalAlpha=1;
    if(partyFocusPage&&canClick){
      partyFocusPage=false;buttons.get('party-peer-'+partyPageCells[0]?.id)?.focus({preventScroll:true});
    }
    if(layout.pageCount>1){
      const {otherCenter,pageWidth,pageY,pageCount}=layout,half=Math.trunc(pageWidth/2);
      text((partyPage+1)+' / '+pageCount,otherCenter,pageY+shift,{center:true,color:0xcccccc,alpha});
      ctx.globalAlpha=visibility;
      arrow('party-previous','Previous player page',otherCenter-half-28,pageY+shift-5,()=>changePartyPage(-1),!canClick||partyPage===0,{scale:20/32,forward:false});
      arrow('party-next','Next player page',otherCenter+half+8,pageY+shift-5,()=>changePartyPage(1),!canClick||partyPage===pageCount-1,{scale:20/32});
      ctx.globalAlpha=1;
    }
    text(partyText('list_controls'),Math.trunc(w/2),h-12,{center:true,color:0xcccccc,alpha});
    if(joined){
      lines.forEach((line,index)=>renderer.block({x:Math.trunc(w/2),y:layout.summaryY+shift+index*11,scale:1,column:1,lines:[line],lineHeight:9},Infinity,alpha,0,true));
      const leave=partyText('leave'),bw=width(literal(leave))+12;
      const x=Math.trunc((w-bw)/2),y=layout.summaryY+shift+lines.length*11+3;
      button('party-leave',leave,x,y,bw,leaveParty,!canClick,visibility,16);
      if(buttons.get('party-leave').matches(':hover,:focus-visible'))hint=[[partyText('leave_leader_hint'),0xaaaaaa]];
    }
  }
  const node=hit('party-trigger',partyOpen?'Close player list':'View players',5,6,64,22,()=>toggleParty(!partyOpen));
  node.setAttribute('aria-expanded',String(partyOpen));
  const hover=node.matches(':hover,:focus-visible');
  const at=Math.floor(now/3000)%peers.length,prev=(at+peers.length-1)%peers.length,t=P.clamp(now%3000/240);
  const blend=t*t*(3-2*t),before=peers[prev],current=peers[at];
  rect(7,8,18,18,'#000');face(peer(before).image,8,9,16);
  ctx.globalAlpha=blend;face(peer(current).image,8,9,16);ctx.globalAlpha=1;
  const memberBlend=Number(partyMembers.has(before))*(1-blend)+Number(partyMembers.has(current))*blend;
  if(memberBlend>0){ctx.globalAlpha=memberBlend;outline(6,7,20,'#ffff55');ctx.globalAlpha=1;}if(hover)outline(5,6,22,'#fff');
  ctx.drawImage(images.get(hover||partyOpen?'tab_button_selected':'tab_button'),28,8,41,19);
  if(partyMenu){
    const {id}=partyMenu,name=peer(id).name,stage=partyText('stage_0'),action=partyText(partyInvites.has(id)?'invited':'invite');
    const menuWidth=Math.max(...[name,stage,action].map(line=>width(literal(line))));
    const x=Math.max(4,Math.min(partyMenu.x,w-menuWidth-4)),y=Math.max(4,Math.min(partyMenu.y,h-38));
    const dismiss=hit('party-menu-dismiss','Close player options',0,0,w,h,()=>{partyMenu=null;buttons.get('party-peer-'+id)?.focus({preventScroll:true});});
    dismiss.style.zIndex=1;dismiss.tabIndex=-1;
    const menu=hit('party-invite',action,x,y+25,menuWidth,10,()=>{
      partyInvites.set(id,clock()+30000);partyMenu=null;updateParty();buttons.get('party-peer-'+id)?.focus({preventScroll:true});
    },partyInvites.has(id)||partyMembers.size>=7||session.phase!=='location');
    menu.style.zIndex=2;
    if(partyMenuFocus&&!menu.disabled){menu.focus({preventScroll:true});partyMenuFocus=false;}
    tooltipFrame(x,y,menuWidth,33);
    text(name,x,y,{outline:false,shadow:true});
    text(stage,x,y+12,{color:0xaaaaaa,outline:false,shadow:true});
    text(action,x,y+25,{color:menu.disabled?0x888888:menu.matches(':hover,:focus-visible')?0xffff55:0xffffff,outline:false,shadow:true});
  }else if(hover){
    const lines=[[partyText(peers.length===1?'player_count_single':'player_count',peers.length),0xffff55]];
    if(joined)lines.push([ready,0xaaaaaa]);
    lines.push([partyText('list_hint','Tab'),0xaaaaaa]);
    if(!keyboard)tooltip(lines,pointer.x+12,pointer.y-12,w,h);
  }else if(hint&&canClick)tooltip(hint,pointer.x+12,pointer.y-12,w,h);
}
function poolOptions(){
  const pool=session.spawn?.type==='pool'?session.spawn.pool:[];const select=$('flow-pool'),previous=select.value;select.disabled=!pool.length;
  select.replaceChildren(new Option('Random','random'),...pool.map((entry,index)=>new Option((index+1)+'. '+(F.place(entry.target)||entry.type),String(index))));
  if(pool.some((_,index)=>String(index)===previous))select.value=previous;
}
function enter(focus=true){
  const now=clock(),phase=session.phase,justCompleted=phase==='complete'&&previousPhase!=='complete';visited.add(phase);
  if(phase.startsWith('kit')&&!previousPhase.startsWith('kit'))carousel=new HeritagePresentation.KitCarousel(session.kitIndex,now);
  if(phase.startsWith('kit')&&phase!==kitPhase){const progress=kitProgress(now);kitConfirmationFrom=previousPhase.startsWith('kit')?progress:0;kitConfirming=phase==='kit-confirm';kitConfirmationStarted=now;kitPhase=phase;if(!previousPhase.startsWith('kit')){kitYaw=NaN;kitPitch=NaN;}}
  if(phase==='intro'&&previousPhase!=='intro'){arrivalToken=crypto.randomUUID();barSlant=P.sampleSlant(arrivalToken,session.arrival.intro.bar_style??'random');}
  previousPhase=phase;shopTrade=null;resize();needsFocus=focus;
  if(!partyEnabled()&&partyOpen)toggleParty(false);
  if(!phase.startsWith('location'))partyInvites.clear();
  updateParty();
  if(justCompleted)dialog.dispatchEvent(new CustomEvent('heritage:flow-complete',{detail:progressSnapshot()}));
  $('flow-narration').textContent='';
  stopSpeech();speechCues=[];revealedAt=-1;started=phase==='review'?-1:clock();visible=0;expanded='';scroll=0;
  const names={location:'Starting location','location-confirm':'Confirm location',kit:'Starting kit','kit-confirm':'Confirm kit','kit-shop':'Starting kit shop',loading:'Preparing terrain',review:'Your story begins',intro:'Arrival intro',complete:'Preview complete'};
  $('flow-phase').textContent=waitingForParty?'Waiting for your party':names[session.phase];$('flow-controls').setAttribute('aria-label',names[session.phase]);
  if(session.phase==='location-confirm'){poolOptions();if(!planApplied&&plannedRoute?.spawnId===session.spawn.id){const index=session.allowed().findIndex(kit=>kit.id===plannedRoute.kitId);if(index>=0){session.kitIndex=index;session.kit=session.allowed()[index];}if(Number.isInteger(plannedRoute.poolIndex)&&session.spawn.pool?.[plannedRoute.poolIndex])$('flow-pool').value=String(plannedRoute.poolIndex);planApplied=true;}}
  updateEditChoices();
  $('flow-inventory').hidden=true;
  $('flow-inventory-mode').closest('label').hidden=session.choices.kitPreview==='model'||phase==='kit-shop';
  if(phase.startsWith('kit')){
    kitFrames.clear();
    if(!inventory)inventory=new HeritageInventory.Inventory($('flow-inventory'),{fillHost:true,onControl:control=>{
      if(['page','scroll'].includes(control.kind))inventoryOptions.offset=control.value;
      if(control.kind==='cosmetics')inventoryOptions.cosmetics=!inventoryOptions.cosmetics;
      kitFrames.clear();inventory.set(session.kit,inventoryOptions);
    }});
    if(phase==='kit-shop'){
      if(shopKit!==session.kit){shopKit=session.kit;shopPage=shopSectionPage=0;shopSection='';}
      HeritageInventory.hideTooltip();
      inventory.set(session.loadout(),shopInventoryOptions);
      $('flow-narration').textContent=shopBudget();
    }else{
      inventoryOptions.modelOnly=session.choices.kitPreview==='model';
      inventoryOptions.mode=inventoryOptions.modelOnly?'player':$('flow-inventory-mode').value;
      inventoryOptions.hideCrafting=true;inventoryOptions.controlledAim=true;inventoryOptions.passiveWheel=true;inventory.set(session.kit,inventoryOptions);
    }
  }
  if(session.phase==='review'){
    segments=F.narration(playerName(),sampleNames(),session.loadout(),bundled.translations);
    const story=segments.map(segment=>segment.text).join('');reviewGlyphs=literal(story,0xeeeae0);$('flow-narration').textContent=story;
    let offset=0;for(const segment of segments){
      if(segment.highlight){const [start,length]=segment.highlight;for(const glyph of reviewGlyphs.slice(offset+start,offset+start+length))glyph.tint=0x55ffff;}
      offset+=Array.from(segment.text).length;
    }

  }
  if(session.phase==='intro'){introConfig=P.readJson(JSON.stringify(session.arrival.intro)).config;speechCues=P.blipCues(introConfig,sampleNames());}
  if(session.phase==='review'){const length=segments.reduce((total,segment)=>total+Array.from(segment.text).length*40+segment.pause,0);speechCues=P.revealCues(reviewGlyphs,tick=>F.revealed(segments,tick*50),Math.ceil(length/50)+1,{first:1,step:2,pitch:.95,spread:.1});}
  const custom=session.choices.spawns.some(spawn=>spawn.image&&!/^kingdomsheritage:/.test(spawn.image)&&!pictures.has(spawn.image));
  $('flow-status').textContent=[notice,effectNotice,custom?'Images from external resource packs use the fallback card here.':'',session.phase==='complete'?'Preview complete. Close this window to download your pack.':''].filter(Boolean).join(' ');
  for(const node of buttons.values())node.remove();buttons.clear();
}
function sampleNames(){const spawn=session.arrival??session.spawn;return F.context(spawn,session.loadout(),playerName(),F.locations(spawn,{biome:$('flow-biome').value,structure:$('flow-structure').value}),bundled.translations,companionNames());}
function next(){
  const phase=session.phase,now=clock();
  if(phase==='review'&&partyMembers.size){
    stopSpeech();transition.fade(now,()=>{waitingForParty=true;$('flow-phase').textContent='Waiting for your party';updateParty();needsFocus=true;});return;
  }
  const advance=()=>{let index=0;if(session.spawn?.type==='pool')index=$('flow-pool').value==='random'?Math.floor(Math.random()*session.spawn.pool.length):Number($('flow-pool').value);session.next(index);enter();if(session.phase==='kit')transition.reveal(clock());else if(session.phase==='intro'){sound('confirmation');transition.clear();}else if(session.phase==='complete'){if(phase==='review'){sound('confirmation');transition.reveal(clock());}else transition.clear();}};
  if(['location-confirm','kit-confirm','kit-shop','review'].includes(phase))transition.fade(now,advance);else advance();
}
function back(){
  if(transition.phase!=='idle')return;
  if(session.shopOnly){close();return;}
  const phase=session.phase,now=clock(),go=()=>{waitingForParty=false;session.back();enter();};
  if(phase==='location-confirm'){cards.confirm(session.spawn.id,false,now);go();}
  else if(['kit-confirm','kit-shop'].includes(phase))go();
  else if(['kit','review'].includes(phase))transition.fade(now,()=>{go();transition.reveal(clock());});
}
const pageIds=()=>session.choices.spawns.slice(page*F.pageSize,(page+1)*F.pageSize).map(spawn=>spawn.id);
function browseLocation(offset,byPage=false){
  if(!cards||cards.expanded!==null||cards.progress(clock())!==0)return;
  const choices=session.choices.spawns,index=Math.max(0,choices.findIndex(spawn=>spawn.id===cards.preview));
  const nextIndex=F.browseLocation(choices.length,index,offset,byPage);
  if(nextIndex===index)return;
  const nextPage=Math.floor(nextIndex/F.pageSize);
  if(nextPage!==page){
    const direction=Math.sign(nextPage-page);page=nextPage;
    outgoingCards=cards.turn(pageIds(),direction,clock());
  }
  browseFocus=cards.preview=choices[nextIndex].id;
  keyboard=true;hoverReady=true;
}
function locationsScreen(w,h,now){
  const ids=pageIds();
  if(!cards)cards=new HeritagePresentation.Cards(ids,w,h,now);
  else if(cards.width!==w||cards.height!==h||cards.cards[0]?.id!==ids[0]){cards.reset(ids,w,h,now);outgoingCards=[];}
  if(session.phase==='location-confirm'&&!cards.confirming)cards.confirm(session.spawn.id,true,now);
  const focused=browseFocus??document.activeElement?.dataset.action?.replace(/^card-/,'');
  cardFrame=cards.frame(now,partyOpen?{}:{...pointer,focused,keyboard});expanded=cards.expanded??'';
  const progress=cardFrame.progress,confirming=cards.confirming,active=progress===0&&!confirming;
  if(cardFrame.active!==highlightedCard){if(hoverReady&&cardFrame.active&&active&&transition.phase==='idle')sound('hover');highlightedCard=cardFrame.active;}
  const draw=card=>{const spawn=session.choices.spawns.find(entry=>entry.id===card.id),pose=card.pose();if(pose.opacity>=.02)drawCard(spawn,pose.x,pose.y,pose.scale,pose,pose.opacity);};
  if(layer.width!==canvas.width||layer.height!==canvas.height){layer.width=canvas.width;layer.height=canvas.height;}
  layerContext.setTransform(1,0,0,1,0,0);layerContext.clearRect(0,0,layer.width,layer.height);layerContext.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);layerContext.imageSmoothingEnabled=false;
  ctx=layerContext;renderer=layerRenderer;
  try{
    for(const card of outgoingCards){card.sample(now);draw(card);}
    outgoingCards=outgoingCards.filter(card=>card.layout.opacity>0);
    for(const card of cards.cards)if(card.id!==cardFrame.foreground)draw(card);
  }finally{ctx=mainContext;renderer=mainRenderer;}
  if(progress<1){
    ctx.globalAlpha=dissolve?1:1-progress;
    ctx.drawImage(progress>0&&dissolve?dissolve(w,h,progress):layer,0,0,w,h);
    ctx.globalAlpha=1;
  }
  const front=cards.cards.find(card=>card.id===cardFrame.foreground);if(front)draw(front);
  for(let index=0;index<cards.cards.length;index++){
    const card=cards.cards[index],pose=card.pose();if(!active||!card.visible||pose.opacity<.05)continue;
    const x=Math.round(pose.x),right=cards.expanded===null&&index+1<cards.cards.length?Math.min(x+Math.round(pose.width*pose.scale),Math.round(cards.cards[index+1].layout.x)):x+Math.round(pose.width*pose.scale);
    hit('card-'+card.id,label(session.choices.spawns.find(spawn=>spawn.id===card.id),'title'),x,card.layout.y-12*pose.scale,right-x,204*pose.scale,()=>{session.choose(card.id);cards.confirm(card.id,true,clock());if(cards.cards.length>1)sound('dissolve');enter();});
  }
  if(browseFocus&&buttons.get('card-'+browseFocus)?.isConnected){buttons.get('card-'+browseFocus).focus({preventScroll:true});browseFocus=null;}
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
    button('next',session.allowed().length===1?'Continue':'Yes, choose kit',x,y+promptHeight+titleHeight+18,Math.min(150,limit),next,!confirming||progress<1||!session.allowed().length,alpha);
    button('back','Choose another',x,y+promptHeight+titleHeight+42,Math.min(150,limit),back,!confirming||progress<=.65,alpha);
  }
  if(progress<1)text('Choose your starting location',Math.trunc(w/2),12,{center:true,alpha:Math.max(4,Math.round((1-progress)*255))});
  if(active&&!expanded&&session.allowed().length>1)text('Step 1 of 2',Math.trunc(w/2),h-43,{center:true});
  if(partyMembers.size&&session.choices.spawns.length>1){
    const id=partyMembers.keys().next().value,player=peer(id),suggestion=session.choices.spawns[1],message=partyText('suggestion',player.name,label(suggestion,'title'));
    const fade=P.clamp((now-partyMembers.get(id))/180),card=cards.cards.find(entry=>entry.id===suggestion.id);
    if(card?.visible&&progress<1){
      const pose=card.pose(),x=Math.round(pose.x+pose.width*pose.scale/2)-4,y=Math.round(pose.y+192*pose.scale)+4;
      ctx.globalAlpha=fade*pose.opacity*(1-progress);face(player.image,x,y,8);ctx.globalAlpha=1;
    }
    if(fade>0){
      const left=Math.max(4,Math.trunc((w-width(literal(message)))/2)-4);
      const node=hit('party-suggestion',message,left,h-58,w-left*2,13,()=>{
        const current=session.choices.spawns.findIndex(spawn=>spawn.id===cards.preview);
        browseLocation(1-current);
      },!active||!!expanded);
      text(message,Math.trunc(w/2),h-56,{center:true,color:node.matches(':hover,:focus-visible')?0xffff55:0xf2cd83,limit:w-8,maxLines:1,alpha:Math.round(fade*255)});
    }
  }
  if(active&&!expanded&&session.choices.spawns.length>F.pageSize){
    const buttonWidth=Math.min(130,Math.trunc((w-100)/2));arrow('previous-page','Previous page',Math.trunc((w-buttonWidth)/2)-40,h-34,()=>browseLocation(-1,true),page===0,{forward:false});arrow('next-page','Next page',Math.trunc((w+buttonWidth)/2)+8,h-34,()=>browseLocation(1,true),(page+1)*F.pageSize>=session.choices.spawns.length);
    text((page+1)+' / '+Math.ceil(session.choices.spawns.length/F.pageSize),Math.trunc(w/2),h-22,{center:true});
  }
}
function kitProgress(now){const eased=HeritagePresentation.ease(Math.fround((now-kitConfirmationStarted)/550));return kitConfirmationFrom+(Number(kitConfirming)-kitConfirmationFrom)*eased;}
function selectKit(index){
  if(index===session.kitIndex||!session.allowed()[index]||session.phase!=='kit'||kitProgress(clock())>0)return;
  if(document.activeElement?.dataset.action?.startsWith('kit-card-'))needsFocus=true;
  session.select(index);carousel.select(index,clock());inventory.set(session.kit,inventoryOptions);updateEditChoices();
}
function kitFrame(index,kits){
  if(kitFrames.has(index))return kitFrames.get(index);
  const image=document.createElement('canvas');image.width=inventory.layout.width;image.height=inventory.layout.height;
  const aim=inventory.aim,hover=inventory.hover;inventory.aim={x:0,y:0};inventory.hover=null;
  inventory.preview(kits[index]);image.getContext('2d').drawImage(inventory.canvas,0,0,image.width,image.height);
  inventory.aim=aim;inventory.hover=hover;inventory.preview(null);
  kitFrames.set(index,image);return image;
}
function kitScreen(w,h,now){
  const progress=kitProgress(now),reviewing=kitConfirming||progress>0,layout=inventory.layout,bw=layout.width,bh=layout.height,normalX=Math.trunc((w-bw)/2),normalY=Math.trunc((h-bh)/2),center=normalX+Math.trunc(bw/2),pose=HeritagePresentation.kitPose(w,h,bw,bh,progress,now);
  const response=1-Math.exp(-Math.min(.05,Math.max(0,(now-kitRenderedAt)/1000))*12);kitRenderedAt=now;
  const modelOnly=inventoryOptions.modelOnly;
  const aimX=modelOnly?bw/2:layout.inventoryX+layout.playerX,aimY=modelOnly?bh/2:layout.inventoryY+32;
  const yaw=Math.atan((normalX+aimX-pointer.x)/40)*(reviewing?1-progress:1),pitch=Math.atan((normalY+aimY-pointer.y)/40)*(reviewing?1-progress:1);
  kitYaw=Number.isNaN(kitYaw)?yaw:kitYaw+(yaw-kitYaw)*response;kitPitch=Number.isNaN(kitPitch)?pitch:kitPitch+(pitch-kitPitch)*response;
  inventory.aim={x:-Math.tan(kitYaw)*40,y:-Math.tan(kitPitch)*40};inventory.visible=true;inventory.draw();
  const kits=session.allowed(),motion=carousel.motion(now),moving=motion.position!==session.kitIndex||motion.velocity!==0;
  const host=$('flow-inventory');host.hidden=modelOnly||reviewing||moving;host.style.pointerEvents=transition.phase==='idle'?'':'none';
  if(inventory.ready){
    for(const index of kitFrames.keys())if(Math.abs(index-motion.position)>2)kitFrames.delete(index);
    for(const card of carousel.poses({x:normalX,y:normalY,width:bw,height:bh},w,kits.length,now)){
      if(card.opacity<=0||card.index===session.kitIndex&&(!moving||reviewing))continue;
      const width=bw*card.scale,height=bh*card.scale,name=label(kits[card.index],'title'),neighbor=card.index!==session.kitIndex;
      const left=!moving&&card.distance>0?Math.max(card.x,normalX+bw):card.x;
      const right=!moving&&card.distance<0?Math.min(card.x+width,normalX):card.x+width;
      const node=neighbor&&!reviewing&&right>left?hit('kit-card-'+card.index,name,left,card.y,right-left,height,()=>selectKit(card.index)):null;
      const opacity=Math.min(1,card.opacity+(node?.matches(':hover,:focus-visible') ? .2 : 0))*(1-progress);
      ctx.globalAlpha=opacity;ctx.drawImage(kitFrame(card.index,kits),card.x,card.y,width,height);ctx.globalAlpha=1;
      const nameAlpha=Math.round(opacity*P.clamp((Math.abs(card.distance)-.85)/.15)*255);
      if(neighbor&&nameAlpha>=4)text(name,card.x+width/2,card.y-13,{center:true,limit:width-8,maxLines:1,alpha:nameAlpha});
    }
  }
  if(reviewing){ctx.save();ctx.translate(pose.x+bw*pose.scale/2,pose.y+bh*pose.scale/2);ctx.rotate(pose.tilt*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.drawImage(inventory.canvas,-bw/2,-bh/2,bw,bh);ctx.restore();}
  else if(!moving&&modelOnly)ctx.drawImage(inventory.canvas,normalX,normalY,bw,bh);
  else if(!moving)Object.assign(host.style,{left:normalX/w*100+'%',top:normalY/h*100+'%',width:bw/w*100+'%',height:bh/h*100+'%'});
  const titleY=Math.max(2,normalY-13),title=label(session.kit,'title')+' ('+(session.kitIndex+1)+'/'+session.allowed().length+')';
  if(progress<1){const alpha=Math.max(4,Math.round((1-progress)*255));if(titleY>=16)text('Choose your starting kit',center,titleY-12,{center:true,alpha});let shown=title;while(width(literal(shown))>Math.min(w-24,bw+60))shown=Array.from(shown).slice(0,-1).join('');text(shown,center,titleY,{center:true,alpha});}
  if(reviewing){
    const scale=Math.max(.1,Math.min(1,(w-32)/(bw+216),(h-96)/bh)),left=Math.round((w-(bw+216)*scale)/2+(bw+24)*scale)+Math.round((1-progress)*12),limit=Math.max(1,Math.round(192*scale)),promptHeight=P.wrap(literal('Is this your choice?'),limit,renderer.advance).length*9,textHeight=promptHeight+Math.min(2,P.wrap(literal(label(session.kit,'title')),limit,renderer.advance).length)*9,top=Math.trunc((h-textHeight-64)/2),alpha=P.clamp((progress-.3)/.7);
    if(alpha>0){text('Is this your choice?',left,top,{limit,alpha:Math.max(4,Math.round(alpha*255))});text(label(session.kit,'title'),left,top+promptHeight+6,{color:0xf2cd83,limit,maxLines:2,alpha:Math.max(4,Math.round(alpha*255))});}
    button('next','Continue',left,top+textHeight+18,Math.min(150,limit),next,!kitConfirming||progress<1,alpha);button('back','Choose another',left,top+textHeight+42,Math.min(150,limit),back,!kitConfirming||progress<=.65,alpha);
  }else{
    arrow('previous-kit','Previous kit',Math.max(4,normalX-42),normalY+Math.trunc((bh-32)/2),()=>selectKit(session.kitIndex-1),session.kitIndex===0,{forward:false});
    arrow('next-kit','Next kit',Math.min(w-36,normalX+bw+10),normalY+Math.trunc((bh-32)/2),()=>selectKit(session.kitIndex+1),session.kitIndex+1===kits.length);
    const bottom=Math.min(h-24,normalY+bh+6),size=Math.min(100,Math.trunc((bw-4)/2));
    button('back','Back',center-size-2,bottom,size,back);button('next',session.kit.shop?'Open shop':'Choose kit',center+2,bottom,size,next,moving);
    if(bottom+34<h)text(label(session.kit,'description'),center,bottom+25,{center:true,color:0xcccccc,limit:w-16,maxLines:1});
  }
}
function shopText(key,...args){
  let index=0;
  return bundled.translations['screen.kingdomsheritage.shop.'+key].replace(/%s/g,()=>args[index++]);
}
const shopPoints=count=>shopText(count===1?'one_point':'points',count);
const shopBudget=()=>shopText('budget',session.spent,session.kit.shop.budget,session.kit.shop.budget-session.spent);
function shopStatusText(status,refunding=false){
  if(refunding)return shopText('refund_points',shopPoints(status.offer.cost));
  if(status.issue)return shopText(status.issue,-status.remaining);
  return shopText('after_purchase',shopPoints(status.remaining));
}
function updateShop(message,pick=null,buying=false){
  shopTrade=pick&&!reduceMotion.matches?{...pick,buying,started:clock()}:null;
  inventory.set(session.loadout(),shopInventoryOptions);
  $('flow-narration').textContent=message+' '+shopBudget();
}
function shopName(value,x,y,maxLines,center=false){
  const lines=P.wrap(literal(value,0x404040),68,renderer.advance),last=lines[maxLines-1];
  if(lines.length>maxLines){
    const ellipsis=literal('…',0x404040),glyphs=last.glyphs;
    while(width(glyphs)+width(ellipsis)>68)glyphs.pop();
    while(/\s/u.test(glyphs.at(-1)?.ch??''))glyphs.pop();
    glyphs.push(...ellipsis);
  }
  lines.slice(0,maxLines).forEach((line,index)=>text(line.glyphs,x,y+index*9,{center,outline:false}));
  return lines.length>maxLines;
}
function drawShopTrade(item,x,y,progress){
  if(progress>=1)return;
  const icon={...item,count:1},size=tradeSprite.width;
  if(progress>0&&dissolve){
    tradeContext.clearRect(0,0,size,size);
    HeritageInventory.item(tradeContext,icon,0,0,inventory.requestIcon);
    ctx.drawImage(dissolve(size,size,progress,tradeSprite,true),x,y,size,size);
  }else{
    ctx.save();ctx.globalAlpha=1-progress;
    HeritageInventory.item(ctx,icon,x,y,inventory.requestIcon);
    ctx.restore();
  }
}
const currentShopOffers=()=>F.shopOfferIndices(session.kit.shop,shopSection);
function paintShopTab({x,y,icon,sprite}){
  ctx.save();ctx.translate(x,y);ctx.rotate(-Math.PI/2);ctx.scale(-1,1);
  ctx.drawImage(images.get(sprite),0,0);ctx.restore();
  const id=HeritageKit.items.has(HeritageKit.normalize(icon))?icon:'minecraft:paper';
  HeritageInventory.item(ctx,{id},x+9,y+5,inventory.requestIcon);
}
function drawShopTabs(left,top,showing){
  const sections=session.kit.shop.sections??[];
  if(!sections.length)return {};
  const tabs=[{id:'',name:shopText('all_sections'),icon:'minecraft:chest'},...sections];
  const overflow=tabs.length>shopTabRows,rows=overflow?shopTabRows-1:shopTabRows;
  const x=left-shopTabWidth,start=shopSectionPage*rows;
  let hovered=null,active=null;
  if(overflow){
    arrow('shop-sections-prev',shopText('previous_sections'),x+6,top,()=>{shopSectionPage=Math.max(0,shopSectionPage-1);},start===0,{scale:.5,forward:false});
    arrow('shop-sections-next',shopText('next_sections'),x+6,top+150,()=>{shopSectionPage=Math.min(Math.floor((tabs.length-1)/rows),shopSectionPage+1);},start+rows>=tabs.length,{scale:.5});
  }
  for(const [row,tab] of tabs.slice(start,start+rows).entries()){
    const y=top+(overflow?16:4)+row*shopTabPitch,selected=tab.id===shopSection;
    const node=hit((tab.id?'shop-section-'+tab.id:'shop-all-offers'),tab.name,x,y,shopTabWidth,shopTabHeight,()=>{
      if(tab.id===shopSection)return;
      shopSection=tab.id;shopPage=0;
      $('flow-narration').textContent=tab.name+'. '+shopBudget();
    });
    node.classList.add('shop-tab-hit');
    node.setAttribute('aria-pressed',String(selected));
    const sprite=selected?(row===0?'tab_top_selected_1':'tab_top_selected_2'):'tab_top_unselected_1';
    const drawing={x,y,icon:tab.icon,sprite};
    if(selected)active=drawing;else paintShopTab(drawing);
    if(showing(node))hovered={name:tab.name,x,y};
  }
  return {hovered,active};
}
function shopScreen(w,h,now){
  const progress=shopTrade?P.clamp((now-shopTrade.started)/shopTradeDuration):1;
  if(progress>=1)shopTrade=null;
  const shake=shopTrade?Math.round(Math.sin(progress*19)*2.5*(1-progress)):0;
  const {budget,offers}=session.kit.shop,spent=session.spent,shop=images.get('shop');
  const left=Math.trunc((w-shop.width-inventory.layout.width)/2),top=Math.trunc((h-shop.height)/2),inv=left+shop.width,bottom=top+shop.height+4;
  const visibleOffers=currentShopOffers(),pages=Math.max(1,Math.ceil(visibleOffers.length/F.shopPageSize)),start=shopPage*F.shopPageSize;
  let detail=null;
  const showing=node=>!partyOpen&&node.matches(':hover,:focus-visible');
  const {hovered:hoveredTab,active:activeTab}=drawShopTabs(left,top,showing);
  ctx.drawImage(shop,left,top);
  if(activeTab)paintShopTab(activeTab);
  inventory.aim={x:pointer.x-inv-51,y:pointer.y-top-32};
  inventory.visible=true;inventory.draw(shopTrade?.buying?shopTrade.slot:null);
  ctx.drawImage(inventory.canvas,inv,top,inventory.layout.width,inventory.layout.height);

  for(const [cell,index] of visibleOffers.slice(start,start+F.shopPageSize).entries()){
    const x=left+8+cell%3*18,y=top+12+Math.floor(cell/3)*18;
    const status=session.shopStatus(index),{offer}=status,name=HeritageItemText.name(offer.item);
    const action=shopText('buy',name,offer.cost),feedback=shopStatusText(status);
    const limitReached=status.issue==='limit_reached',short=status.issue==='short'||status.issue==='short_one';
    const count=limitReached?'. '+shopText('bought',status.bought,status.limit):'';
    const node=hit('shop-offer-'+index,action+'. '+feedback+count,x,y,16,16,()=>{
      if(session.buy(index))updateShop(action+'.',session.purchases.at(-1),true);
      else $('flow-narration').textContent=shopStatusText(session.shopStatus(index))+'. '+shopBudget();
    });
    HeritageInventory.item(ctx,offer.item,x,y,inventory.requestIcon,shopTrade?.offer===index?-shake:0);
    if(short||limitReached)rect(x,y,16,16,short?'#0006':'#00000026');
    if(status.issue==='no_space'){
      rect(x,y+10,6,6,'#343434');
      outline(x,y+10,6,'#e4e4e4');
    }
    if(status.bought&&!limitReached)outline(x-1,y-1,18,'#629d42');
    const price=literal(String(offer.cost),short?0xff7777:0xffe4a1),scale=Math.min(.75,16/width(price));
    text(price,x,y,{scale,outline:false,shadow:true});
    if(showing(node)){
      outline(x-1,y-1,18,'#ffe4a1');detail={node,status,name,refunding:false};
    }
  }
  for(const {offer,slot} of session.purchases){
    const position=inventory.layout.slots.find(position=>position.index===slot);
    const x=inv+position.x,y=top+position.y,status=session.shopStatus(offer),name=HeritageItemText.name(status.offer.item);
    const action=shopText('sell',name,status.offer.cost);
    const node=hit('shop-refund-'+slot,action,x,y,16,16,()=>{
      const pick=session.purchases.find(pick=>pick.slot===slot);
      if(!pick||!session.refund(slot))return;
      const refundedOffer=offers[pick.offer];
      updateShop(shopText('sell',HeritageItemText.name(refundedOffer.item),refundedOffer.cost)+'.',pick);
      if(keyboard)(buttons.get('shop-offer-'+pick.offer)??buttons.get('next'))?.focus({preventScroll:true});
    });
    if(showing(node)){
      outline(x-1,y-1,18,'#ffe4a1');detail={node,status,name,refunding:true};
    }
  }

  if(shopTrade){
    const {offer,slot,buying}=shopTrade,position=inventory.layout.slots.find(position=>position.id===slot);
    drawShopTrade(offers[offer].item,inv+position.x+shake,top+position.y,buying?1-progress:progress);
  }

  text(shopText('title'),w/2,top-32,{center:true});
  text(shopBudget(),w/2,top-19,{center:true});
  const bar=images.get('experience_bar_background'),meter=Math.trunc((w-bar.width)/2),meterY=top-7;
  const fill=points=>budget?Math.round(bar.width*points/budget):0,filled=fill(spent);
  const segment=(image,start,end,alpha=1)=>{
    if(end<=start)return;
    ctx.globalAlpha=alpha;
    ctx.drawImage(images.get(image),start,0,end-start,bar.height,meter+start,meterY,end-start,bar.height);
    ctx.globalAlpha=1;
  };
  ctx.drawImage(bar,meter,meterY);
  segment('experience_bar_progress',0,filled);
  if(detail?.refunding){
    segment('experience_bar_red',fill(spent-detail.status.offer.cost),filled);
  }else if(detail&&['short','short_one'].includes(detail.status.issue)){
    segment('experience_bar_red',filled,bar.width,.85);
  }else if(detail&&!detail.status.issue){
    segment('experience_bar_progress',filled,fill(spent+detail.status.offer.cost),.6);
  }

  const detailX=inv+100;
  shopName(label(session.kit,'title'),detailX+34,top+10,1,true);
  rect(detailX,top+21,68,1,'#a2a2a2');
  if(!detail){
    text(shopText('add_hint'),detailX,top+29,{color:0x505050,limit:68,maxLines:2,outline:false});
    text(shopText('refund_hint'),detailX,top+52,{color:0x505050,limit:68,maxLines:2,outline:false});
  }else{
    const {node,status,name,refunding}=detail,{offer}=status;
    HeritageInventory.item(ctx,{...offer.item,count:1},inv+77,top+26,inventory.requestIcon);
    const clipped=shopName(name,detailX,top+27,2);
    if(clipped)node.title=name;else node.removeAttribute('title');
    const ink={limit:68,outline:false},feedback=shopStatusText(status,refunding);
    text(shopText('stack_price',offer.item.count??1,shopPoints(offer.cost)),detailX,top+46,{...ink,color:0x505050,maxLines:1});
    const lines=text(feedback,detailX,top+56,{...ink,color:status.issue&&!refunding?0x812e2a:0x37632a,maxLines:2});
    if(lines===9&&(status.limit>1||status.bought>=status.limit))text(shopText('bought',status.bought,status.limit),detailX,top+67,{...ink,color:0x505050,maxLines:1});
  }

  if(!visibleOffers.length)text(shopText('empty_section'),left+shop.width/2,top+18,{center:true,limit:shop.width-12});
  if(pages>1){
    arrow('shop-previous',shopText('previous_page'),left+3,bottom,()=>changeShopPage(-1),shopPage===0,{scale:.67,compact:true,forward:false});
    text(shopText('page',shopPage+1,pages),left+shop.width/2,bottom+6,{center:true});
    arrow('shop-next',shopText('next_page'),inv-16,bottom,()=>changeShopPage(1),shopPage+1===pages,{scale:.67,compact:true});
  }
  if(!session.shopOnly)button('back','Back',inv+3,bottom,46,back);
  button('shop-reset',shopText('reset'),inv+53,bottom,44,()=>{
    session.resetShop();updateShop('Purchases reset.');
    if(keyboard)buttons.get('next')?.focus({preventScroll:true});
  },!session.purchases.length);
  if(session.shopOnly)button('next','Done',inv+101,bottom,72,close);
  else button('next',shopText('review'),inv+101,bottom,72,next);
  if(hoveredTab){
    const lines=P.wrap(literal(hoveredTab.name),Math.min(180,w-16),renderer.advance);
    const leftEdge=hoveredTab.x-Math.max(...lines.map(line=>line.width))-7;
    tooltip(lines.map(line=>[line.glyphs.map(glyph=>glyph.ch).join(''),0xffffff]),
      leftEdge>=4?leftEdge:hoveredTab.x,leftEdge>=4?hoveredTab.y+6:hoveredTab.y+shopTabHeight+3,w,h);
  }
}
function changeShopPage(offset){
  const pages=Math.max(1,Math.ceil(currentShopOffers().length/F.shopPageSize)),page=P.clamp(shopPage+offset,0,pages-1);
  if(page===shopPage)return;
  shopPage=page;
  if(keyboard)needsFocus=true;
}
function reviewScreen(w,h,elapsed){
  if(waitingForParty)return;
  const count=visible===Infinity?reviewGlyphs.length:F.revealed(segments,elapsed),complete=count===reviewGlyphs.length;
  const f=Math.fround,margin=Math.min(48,Math.max(16,Math.trunc(w/12))),available=Math.min(560,w-margin*2);let scale=1.5,lines;
  do{lines=P.wrap(reviewGlyphs,Math.max(1,Math.trunc(f(available/scale))),renderer.advance);if(f(lines.length*14*scale)<=Math.max(24,h-136)||scale<=f(.6))break;scale=f(scale-f(.1));}while(true);
  const height=f(lines.length*14*scale),top=f(f((h-height)/2)-24),buttonWidth=Math.min(150,Math.trunc((w-margin*2-8)/2)),buttonY=Math.round(f(f(top+height)+20)),center=Math.trunc(w/2);
  renderer.block({x:w/2,y:top,scale,column:1,lines:lines.map(line=>({...line,width:width(line.glyphs.filter(glyph=>glyph.index<count))})),lineHeight:14},count,255,Math.floor(elapsed/50),true);
  if(complete){
    const now=clock();if(revealedAt<0)revealedAt=now;
    const progress=P.clamp((now-revealedAt)/220),alpha=progress*progress*(3-2*progress);
    if(buttons.has('reveal')&&document.activeElement===buttons.get('reveal'))needsFocus=true;
    button('next',"That's correct",center-buttonWidth-4,buttonY,buttonWidth,next,progress<1,alpha);
    button('back','Go back',center+4,buttonY,buttonWidth,back,progress<1,alpha);
    if(alpha<1)text('Click or press Space to reveal all',center,h-27,{center:true,color:0xaaaaaa,alpha:Math.round((1-alpha)*255)});
  }else{
    hit('reveal','Reveal all',0,0,w,h,revealStory);text('Click or press Space to reveal all',center,h-27,{center:true,color:0xaaaaaa});
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
    try{for(const cell of HeritagePresentation.loadingCells(Math.trunc(w/2),Math.trunc(h/2)-8,now,opacity)){ctx.fillStyle='rgba(255,255,255,'+cell.alpha/255+')';ctx.fillRect(cell.x,cell.y,5,5);}text(waitingForParty?partyText('ready_count',1,partyMembers.size+1):'Preparing terrain...',Math.trunc(w/2),Math.trunc(h/2)+16,{center:true,alpha:opacity});if(waitingForParty)text(partyText('waiting_for',companionNames().map(name=>partyText('waiting_member',name,partyText('stage_3'))).join(', ')),Math.trunc(w/2),Math.trunc(h/2)+32,{center:true,color:0xcccccc,alpha:opacity,limit:w-40,maxLines:3});}finally{ctx=oldContext;renderer=oldRenderer;}
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
  try{ctx.setTransform(veil.width/w,0,0,veil.height/h,0,0);if(toastBackground)ctx.drawImage(toastBackground(160,32,time/1000),x,0,160,32);else rect(x,0,160,32,'#242323');HeritageInventory.item(ctx,{id:'minecraft:jukebox'},x+8,8);text(P.parse('<rainbow>'+(bundled.translations['toast.kingdomsheritage.now_playing']??'Now playing')+'</rainbow>'),x+30,7,{tick:Math.floor(time/50)});text(bundled.translations['music.kingdomsheritage.selection']??'Selection music - jvn',x+30,18);}finally{ctx=oldContext;renderer=oldRenderer;}
}
function render(now){
  now=clock();frame=0;if(!dialog.open||!session||document.hidden)return;
  for(const [id,expires] of partyInvites)if(expires<=now){partyInvites.delete(id);updateParty();}
  const transitionWasActive=transition.phase!=='idle';transition.tick(now);if(transitionWasActive&&transition.phase==='idle'&&session.phase==='complete')resize();
  if(session.phase==='review'&&started<0&&transition.phase==='idle')started=now;
  if(!waitingForParty)startSpeech();const w=viewport.guiWidth,h=viewport.guiHeight,elapsed=started<0?0:now-started;
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
  rect(0,0,w,h,'#101319');if(shader)shader(w,h,now-backgroundStarted);
  activeButtons=new Set();
  if(selectionScreen()){
    const disconnect=hit('disconnect','Disconnect and close preview',8,h-29,31,21,close);
    const image=images.get(disconnect.matches(':hover,:focus-visible')?'disconnect_highlighted':'disconnect');
    ctx.drawImage(image,12,h-25,23,13);
  }
  if(session.phase.startsWith('location'))locationsScreen(w,h,now);
  else if(session.phase==='kit-shop')shopScreen(w,h,now);
  else if(session.phase.startsWith('kit'))kitScreen(w,h,now);
  else if(session.phase==='loading'){
    if(elapsed>=50){session.next();enter();transition.reveal(now);}
  }else if(session.phase==='review')reviewScreen(w,h,elapsed);
  else if(session.phase==='intro'){
    drawWorld(w,h,elapsed);renderer.intro(introConfig,sampleNames(),elapsed/50,w,h,barSlant);
    if(elapsed/50>=P.duration(introConfig,sampleNames()))next();
  }else if(session.phase==='complete'){
    drawWorld(w,h,Infinity,P.packDefaults);
  }
  if(!partyOpen&&transition.phase==='idle'&&['kit','kit-confirm'].includes(session.phase)){
    const id=['previous-kit','next-kit','next','back','disconnect'].find(id=>activeButtons.has(id)&&buttons.get(id).matches(':hover,:focus-visible'));
    if(id){
      const control=buttons.get(id),name=id==='next'?bundled.translations['screen.kingdomsheritage.policy.merge']:control.getAttribute('aria-label');
      const limit=w-24,lines=P.wrap(literal(name),limit,renderer.advance).map(line=>[line.glyphs.map(glyph=>glyph.ch).join(''),0xffffff]);
      const x=keyboard?(Number.parseFloat(control.style.left)+Number.parseFloat(control.style.width)/2)*w/100:pointer.x+12;
      const y=keyboard?(Number.parseFloat(control.style.top)+Number.parseFloat(control.style.height))*h/100:pointer.y-12;
      if(lines.length)tooltip(lines,x,y,w,h);
    }
  }
  updateMusic(now);drawTransition(w,h,now);
  if(waitingForParty&&now-transition.started>=700){
    veilContext.drawImage(images.get(buttons.get('disconnect').matches(':hover,:focus-visible')?'disconnect_highlighted':'disconnect'),12,h-25,23,13);
  }
  const blur=partyEnabled()?P.clamp(partyMotion.motion(now).position):0;
  canvas.style.filter=$('flow-inventory').style.filter=blur>.001?'blur('+3*blur+'px)':'';
  if(partyEnabled()){
    ctx=veilContext;renderer=veilRenderer;
    try{ctx.setTransform(veil.width/w,0,0,veil.height/h,0,0);ctx.imageSmoothingEnabled=false;drawParty(w,h,now);}
    finally{ctx=mainContext;renderer=mainRenderer;}
  }
  drawToast(w,h,now);
  for(const [id,node] of buttons)if(!activeButtons.has(id)){node.remove();buttons.delete(id);}
  if(needsFocus&&session.phase==='complete'){$('flow-close').focus({preventScroll:true});needsFocus=false;}
  if(needsFocus&&!partyOpen){const target=(waitingForParty?buttons.get('party-trigger'):null)??(session.phase==='kit-shop'?buttons.get('shop-offer-'+currentShopOffers()[shopPage*F.shopPageSize]):null)??buttons.get('next')??buttons.get('reveal')??[...buttons].find(([id])=>id!=='disconnect')?.[1];if(target&&!target.disabled){needsFocus=false;target.focus({preventScroll:true});}}
  frame=requestAnimationFrame(render);
}
function flowSnapshot(){
  const value=session.snapshot();if(session.spawn?.type==='pool'&&value.poolIndex===null&&$('flow-pool').value!=='random')value.poolIndex=Number($('flow-pool').value);return value;
}
function progressSnapshot(){
  const parts=[],phase=session.phase,passedLocation=!['location','location-confirm'].includes(phase),passedKit=['loading','review','intro','complete'].includes(phase),passedStory=['intro','complete'].includes(phase);
  if(passedLocation&&(visited.has('location')||visited.has('location-confirm')))parts.push('location');
  if(passedKit&&(session.kit.shop?visited.has('kit-shop'):visited.has('kit')||visited.has('kit-confirm')||session.allowed().length===1&&visited.has('location-confirm')))parts.push('kit');
  if(passedStory&&visited.has('review'))parts.push('arrival');if(phase==='complete'&&(visited.has('intro')||!session.arrival.intro&&visited.has('review')))parts.push('intro');
  return {...flowSnapshot(),parts,settings:{resolution:$('flow-resolution').value,guiScale:lockedScale||playerScale,playerGuiScale:playerScale,inventory:session.choices.kitPreview==='model'?'Model only':$('flow-inventory-mode').value}};
}
function editChoices(){
  if(!previewState)return {};
  const snapshot=session?flowSnapshot():null,location=previewState?.locations.find(entry=>previewState.namespace+':'+entry.path===snapshot?.spawnId),kit=previewState?.kits.find(entry=>previewState.namespace+':'+entry.path===snapshot?.kitId);
  const destination=location?.fields.type==='pool'&&Number.isInteger(snapshot?.poolIndex)?location.destinations[snapshot.poolIndex]:null,intro=destination&&Object.hasOwn(destination,'intro')&&destination.intro!==''?destination.intro:location?.intro;
  return {snapshot,location,kit:kit?.id===HeritagePack.emptyKit.id?null:kit,intro:typeof intro==='string'&&intro&&(location?.fields.type!=='pool'||Number.isInteger(snapshot?.poolIndex))?intro:null};
}
function updateEditChoices(){
  const choices=editChoices();$('flow-edit-menu').hidden=!choices.location&&!choices.kit;$('flow-edit-location').disabled=!choices.location;$('flow-edit-kit').disabled=!choices.location||!choices.kit;$('flow-edit-intro').disabled=!choices.location||!choices.intro;
}
for(const kind of ['location','kit','intro'])$('flow-edit-'+kind).addEventListener('click',()=>{
  const choices=editChoices();if(!choices.location||kind==='kit'&&!choices.kit||kind==='intro'&&!choices.intro)return;
  const resume={...choices.snapshot,phase:kind==='intro'?'intro':kind==='kit'&&(session.kit.shop||session.allowed().length>1)?'kit':'location-confirm'};
  if(kind==='kit')delete resume.purchases;
  editAfterClose={kind,id:kind==='location'?choices.location.id:kind==='kit'?choices.kit.id:choices.intro,locationId:choices.location.id,resume,progress:progressSnapshot()};close();
});
function restart(snapshot=null){if(!session)return;toggleParty(false);partyMembers.clear();partyInvites.clear();partyPage=0;partyPageAt=0;partyPageCells=[];outgoingPeers=[];partyFocusPage=false;waitingForParty=false;updateParty();transition.clear();cards=null;outgoingCards=[];browseFocus=null;kitFrames.clear();shopKit=null;shopPage=0;cardFrame=null;kitPhase='';previousPhase='';kitConfirmationFrom=0;kitConfirming=false;highlightedCard=null;hoverReady=false;musicFade=0;musicDuck=1;musicTick=Math.floor(clock()/50);opened=clock();session.restart();visited=new Set();planApplied=false;if(snapshot?.phase&&!session.resume(snapshot))notice='The previous choice is unavailable. Choose a location to continue.';page=Math.max(0,Math.floor(session.choices.spawns.findIndex(entry=>entry.id===plannedRoute?.spawnId)/F.pageSize));inventoryOptions={mode:$('flow-inventory-mode').value};poolOptions();if(snapshot?.phase&&Number.isInteger(snapshot.poolIndex)&&session.spawn?.pool?.[snapshot.poolIndex])$('flow-pool').value=String(snapshot.poolIndex);music.currentTime=0;music.muted=$('flow-mute').checked;music.play().catch(()=>{});enter();}
function close(){dialog.close();}
function openShop(kit){return open(null,null,{shop:kit});}
async function open(output,state,options={}){
  if(dialog.open)return;
  const draftKit=options.shop?structuredClone(options.shop):null;
  flowReturnFocus=document.activeElement;const id=++openId;previewState=structuredClone(state);playerScale=Number($('flow-scale').value);session=null;notice='';plannedRoute=options.route??options.resume??null;
  dialog.toggleAttribute('data-shop-test',!!draftKit);$('flow-heading').textContent=draftKit?'Test shop':'Selection flow preview';
  $('flow-target').hidden=!plannedRoute;$('flow-target').textContent=options.resume?'Resuming your selected path from '+(options.resume.phase??'selection').replaceAll('-',' ')+'.':plannedRoute?'Choose the location shown in the test path. Its kit and pool destination are preselected.':'';dialog.showModal();$('flow-phase').textContent='Loading preview…';$('flow-status').textContent='Loading game assets…';
  try{
    if(!draftKit)HeritageDialogueAudio.prepare().catch(error=>{notice='Preview audio could not load: '+error.message;});
    await load();if(!dialog.open||id!==openId)return;
    const choices=draftKit?{spawns:[],kits:[draftKit],guiScale:0}:F.catalog(output,bundled);if(plannedRoute){const spawn=choices.spawns.find(entry=>entry.id===plannedRoute.spawnId),kit=choices.kits.find(entry=>entry.id===plannedRoute.kitId);$('flow-target').textContent=(options.resume?'Resuming: ':'Test path: ')+(spawn?label(spawn,'title'):'Unavailable location')+(kit?' / '+label(kit,'title'):'')+(Number.isInteger(plannedRoute.poolIndex)?' / Place '+(plannedRoute.poolIndex+1):'');}lockedScale=choices.guiScale;resize();pictures.clear();
    for(const entry of previewState?.locations??[])if(HeritagePack.usesPicture(entry)){
      const image=new Image();image.src=entry.picture.data;await image.decode();pictures.set(HeritagePack.pictureId(previewState.namespace,entry.path),image);
    }
    if(!dialog.open||id!==openId)return;session=new F.Session(choices,{shopOnly:!!draftKit});opened=clock();restart(options.resume);if(session.phase==='intro')transition.clear();else{transition.phase='waiting';transition.from=1;transition.reveal(clock());}frame=requestAnimationFrame(render);
  }catch(error){if(!dialog.open||id!==openId)return;$('flow-status').textContent='Could not open the preview: '+error.message;$('flow-phase').textContent='Preview unavailable';}
}
$('flow-close').addEventListener('click',close);$('flow-restart').addEventListener('click',restart);$('flow-mute').addEventListener('change',mute);
$('flow-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('flow-stage').requestFullscreen();}catch(error){$('flow-status').textContent='Full screen unavailable: '+error.message;}});
$('flow-resolution').addEventListener('change',()=>{if(session)resize();});
$('flow-scale').addEventListener('change',()=>{playerScale=Number($('flow-scale').value);if(session)resize();});
$('flow-pool').addEventListener('change',()=>{if(session)updateEditChoices();});
for(const id of ['flow-player','flow-biome','flow-structure','flow-inventory-mode'])$(id).addEventListener('change',()=>{if(session)enter(false);});
$('flow-stage').addEventListener('wheel',event=>{
  if(!session||!event.deltaY)return;
  if(partyOpen){event.preventDefault();if(!partyMenu)changePartyPage(Math.sign(event.deltaY));return;}
  if(!['location','kit'].includes(session.phase))return;
  event.preventDefault();if(transition.phase!=='idle')return;
  const direction=Math.sign(event.deltaY);
  if(expanded)scroll=Math.max(0,scroll+direction*16);
  else if(session.phase==='location')browseLocation(direction);
  else selectKit(session.kitIndex+direction);
},{passive:false});
$('flow-stage').addEventListener('keydown',event=>{
  if(!session)return;
  keyboard=true;hoverReady=true;
  if(!partyOpen&&event.key==='Tab'&&!event.shiftKey&&document.activeElement===buttons.get('party-trigger')){
    event.preventDefault();toggleParty(true);return;
  }
  if(partyOpen){
    if(event.key==='Escape'){
      event.preventDefault();
      if(partyMenu){const {id}=partyMenu;partyMenu=null;buttons.get('party-peer-'+id)?.focus({preventScroll:true});}
      else toggleParty(false);
    }else if(!partyMenu&&['PageUp','PageDown'].includes(event.key)){
      event.preventDefault();changePartyPage(event.key==='PageUp'?-1:1,true);
    }else if(!partyMenu&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();
      const direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
      const target=HeritagePresentation.portraitNeighbor(partyPortraits,document.activeElement?.dataset.action,direction,['ArrowUp','ArrowDown'].includes(event.key));
      if(target){sound('hover');buttons.get(target)?.focus({preventScroll:true});}
    }else if(event.key==='Tab'||partyMenu&&['ArrowUp','ArrowDown'].includes(event.key)){
      const choices=partyMenu?['party-invite']:['party-trigger',...[...buttons.keys()].filter(id=>/^party-(self|member-|peer-|previous|next|leave)/.test(id))];
      const nodes=choices.map(id=>buttons.get(id)).filter(node=>node&&!node.disabled);
      if(nodes.length){
        event.preventDefault();
        const direction=event.shiftKey||['ArrowLeft','ArrowUp'].includes(event.key)?-1:1,index=nodes.indexOf(document.activeElement);
        nodes[(index+direction+nodes.length)%nodes.length]?.focus({preventScroll:true});
      }
    }
    return;
  }
  if(transition.phase!=='idle'){event.preventDefault();return;}
  if(event.key==='Escape'&&session.phase==='location'&&cards?.expanded){event.preventDefault();cards.expand(expanded,clock());expanded='';}
  else if(['kit','kit-confirm','kit-shop'].includes(session.phase)&&event.key.toLowerCase()==='e'){event.preventDefault();sound('click');back();}
  else if(session.phase==='kit-confirm'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const ids=['next','back','disconnect'],index=ids.findIndex(id=>buttons.get(id)===document.activeElement),direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;buttons.get(ids[(index+direction+ids.length)%ids.length])?.focus();}
  else if(session.phase==='review'&&visible!==Infinity&&[' ','Enter'].includes(event.key)&&F.revealed(segments,clock()-started)<reviewGlyphs.length){event.preventDefault();revealStory();}
  else if(session.phase==='location'&&['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(event.key)){event.preventDefault();browseLocation(['ArrowLeft','PageUp'].includes(event.key)?-1:1,event.key.startsWith('Page'));}
  else if(session.phase==='kit-shop'&&['PageUp','PageDown'].includes(event.key)){event.preventDefault();changeShopPage(event.key==='PageUp'?-1:1);}
  else if(session.phase==='kit'&&['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.closest('#flow-inventory')){event.preventDefault();selectKit(session.kitIndex+(event.key==='ArrowLeft'?-1:1));}
});
dialog.addEventListener('cancel',event=>{if(partyOpen){event.preventDefault();if(partyMenu)partyMenu=null;else toggleParty(false);return;}if(!session||session.shopOnly||session.phase==='complete')return;event.preventDefault();if(['location-confirm','kit','kit-confirm','kit-shop','review'].includes(session.phase)&&transition.phase==='idle'){sound('click');back();}});
dialog.addEventListener('close',async()=>{
  toggleParty(false);HeritageInventory.hideTooltip();openId++;hiddenAt=0;lockedScale=0;transition.clear();cards=null;veilContext.clearRect(0,0,veil.width,veil.height);
  $('flow-scale').disabled=false;$('flow-scale').value=String(playerScale);
  if(frame)cancelAnimationFrame(frame);frame=0;music.pause();stopSounds();stopSpeech();
  inventory?.destroy();inventory=null;kitFrames.clear();outgoingCards=[];$('flow-inventory').replaceChildren();$('flow-inventory').hidden=true;
  for(const node of buttons.values())node.remove();buttons.clear();session=null;
  if(document.fullscreenElement===$('flow-stage'))await document.exitFullscreen().catch(()=>{});
  if(editAfterClose){const detail=editAfterClose;editAfterClose=null;dialog.dispatchEvent(new CustomEvent('heritage:flow-edit',{detail}));}else if(!dialog.open){const reviewId=flowReturnFocus?.dataset?.reviewTest,launcher=reviewId?document.querySelector('[data-review-test="'+CSS.escape(reviewId)+'"]'):flowReturnFocus,target=launcher?.isConnected&&launcher!==document.body&&launcher.getClientRects().length?launcher:$('preview-flow')??$('shop-test');target?.focus({preventScroll:true});}
});
$('flow-stage').addEventListener('pointermove',event=>{keyboard=false;hoverReady=true;const bounds=$('flow-canvas').getBoundingClientRect();if(viewport)pointer={x:Math.trunc((event.clientX-bounds.left)*viewport.guiWidth/bounds.width),y:Math.trunc((event.clientY-bounds.top)*viewport.guiHeight/bounds.height)};});
$('flow-stage').addEventListener('pointerdown',()=>{keyboard=false;});
document.addEventListener('visibilitychange',()=>{
  if(!dialog.open||!session)return;
  if(document.hidden){hiddenAt=clock();if(frame)cancelAnimationFrame(frame);frame=0;music.pause();stopSounds();stopSpeech();}
  else{if(hiddenAt){const paused=clock()-hiddenAt;if(started>=0)started+=paused;opened+=paused;transition.started+=paused;kitConfirmationStarted+=paused;if(revealedAt>=0)revealedAt+=paused;partyMotion.shiftTime(paused);partyPageAt+=paused;for(const [id,time] of partyMembers)partyMembers.set(id,time+paused);carousel?.shiftTime(paused);for(const card of outgoingCards)card.started+=paused;musicTick+=Math.floor(paused/50);if(cards){cards.confirmationStarted+=paused;cards.renderedAt+=paused;for(const card of cards.cards)card.started+=paused;}hiddenAt=0;}if(!['intro','complete'].includes(session.phase))music.play().catch(()=>{});if(!frame)frame=requestAnimationFrame(render);}
});
globalThis.HeritageFlowPreview={open,openShop,cardPreview,monitorPreview,catalog:async output=>{await loadArt();return {choices:F.catalog(output,bundled),translations:bundled.translations};}};
})();
