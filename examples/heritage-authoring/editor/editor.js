(async () => {
'use strict';
const P=HeritagePreview, $=id=>document.getElementById(id),storageKey='heritage.introEditor.v1';
if(!await HeritageSession.acquire(storageKey))return;
const previewFields=['viewport','background','biome','structure','dimension','loop'];
const canvas=$('preview'), ctx=canvas.getContext('2d'), font=new Map(), tinted=new Map(), widthBuckets=new Map();
let jsonState=P.readJson(JSON.stringify({intro:P.defaults}));
let config=jsonState.config, main=[], sub=[], all=[], blocks=[], cues=[], revealEnds=[];
let time=0, playing=false, previewing=true, muted=false, lastFrame=0, frameRequest=0, slant=-7, activeField=$('text'), valid=true;
let audioContext, audioBuffer, gain;
let history=[], historyIndex=-1, restoringHistory=false, historyGroup=null, historyTime=0, currentValidation={error:null,fromJson:false};
let workspace,saveTimer,saveUnavailable=false,saveBlocked=false;
function draftOptions() {
  if(!workspace)return;
  const field=$('intro-drafts'),ids=[...workspace.entries.keys()];
  if(field.options.length!==ids.length||ids.some((id,index)=>field.options[index]?.value!==id)){
    field.replaceChildren(...ids.map(id=>{const option=document.createElement('option');option.value=id;return option;}));
  }
  const names=new Map();
  for(const option of field.options){
    const value=option.value===workspace.active?$('intro-name').value:workspace.entries.get(option.value).state.name;
    const name=typeof value==='string'&&value.trim()?value.trim():'Untitled intro',count=(names.get(name)||0)+1;names.set(name,count);
    option.textContent=name+(count>1?' ('+count+')':'');
  }
  field.value=workspace.active;
  $('use-in-pack').href='pack-assembler.html?intro='+encodeURIComponent(workspace.active);
}
function saveDraft() {
  clearTimeout(saveTimer);
  if(!workspace||saveBlocked)return;
  try{
    workspace.update(historySnapshot());localStorage.setItem(storageKey,JSON.stringify(workspace.serialize()));
    $('intro-draft-status').textContent='Draft saved';saveUnavailable=false;
  }catch(error){
    saveUnavailable=true;$('intro-draft-status').textContent='Draft could not be saved. Copy your JSON to keep it.';
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  if(!workspace||saveBlocked)return;
  if(!saveUnavailable)$('intro-draft-status').textContent='Saving draft…';
  saveTimer=setTimeout(saveDraft,350);
}
function activateIntro(id) {
  if(id===workspace.active)return;
  try{
    const entry=workspace.get(id);P.readJson(JSON.stringify(entry.state.document));
    workspace.capture(historySnapshot(),history,historyIndex);workspace.select(id);
    history=entry.history;historyIndex=entry.historyIndex;history[historyIndex]=entry.state;
    restoreHistory(0);saveDraft();
  }catch(error){$('intro-drafts').value=workspace.active;$('copy-status').textContent='Could not open intro: '+error.message;}
}
function openIntro(raw=JSON.stringify({intro:{text:'A new journey begins.',subtitle:''}},null,2),name='My intro') {
  let parsed=P.readJson(JSON.stringify({intro:{text:'A new journey begins.',subtitle:''}})),error=null;
  try{parsed=P.readJson(raw);}catch(failure){error={message:failure.message};}
  const state={
    name,source:raw,document:parsed.document,validation:{error,fromJson:!!error},
    values:fields.map(field=>field.type==='checkbox'?parsed.config[field.dataset.field]:P.componentText(parsed.config[field.dataset.field])||String(parsed.config[field.dataset.field])),
    selection:[0,0],preview:historySnapshot().preview
  };
  activateIntro(workspace.add(state));if(!error)$('text-tab').click();
}
function loadDrafts() {
  const initial=historySnapshot();
  try{
    const raw=localStorage.getItem(storageKey),saved=raw===null?null:JSON.parse(raw);
    if(raw!==null&&(!saved||saved.version!==2||!Array.isArray(saved.intros)))throw new Error('Saved intros are invalid.');
    workspace=new HeritageDrafts(saved,initial,undefined,'intros');
    const entry=workspace.get();P.readJson(JSON.stringify(entry.state.document));
    history=entry.history;historyIndex=entry.historyIndex;restoreHistory(0);
    $('intro-draft-status').textContent=raw===null?'Draft ready':'Draft restored';
  }catch(error){
    saveBlocked=true;workspace=new HeritageDrafts(null,initial,undefined,'intros');
    history=[initial];historyIndex=0;restoreHistory(0);
    $('intro-draft-status').textContent='Saved intros unavailable. Copy your JSON to keep new edits.';
  }
}
function updateHistoryButtons() {
  $('undo').disabled=historyIndex<=0;
  $('redo').disabled=historyIndex>=history.length-1;
}
function historySnapshot() {
  return {
    name:$('intro-name').value,source:$('json').value,document:jsonState.document,
    validation:{...currentValidation,error:currentValidation.error?{message:currentValidation.error.message,field:currentValidation.error.field}:null},
    values:fields.map(field=>field.type==='checkbox'?field.checked:field.value),
    selection:[$('json').selectionStart,$('json').selectionEnd],
    preview:Object.fromEntries(previewFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))
  };
}
function recordHistory(event) {
  if(restoringHistory) return;
  const snapshot=historySnapshot(),previous=history[historyIndex];
  if(previous&&previous.name===snapshot.name&&previous.source===snapshot.source&&JSON.stringify(previous.values)===JSON.stringify(snapshot.values)) return;
  const group=event?.type==='input'&&['TEXTAREA','INPUT'].includes(event.target.tagName)&&!['checkbox','color'].includes(event.target.type)?event.target:null;
  const now=performance.now();
  history.splice(historyIndex+1);
  if(group&&group===historyGroup&&now-historyTime<700&&historyIndex>0) history[historyIndex]=snapshot;
  else { history.push(snapshot); historyIndex++; }
  if(history.length>200) {history.shift();historyIndex--;}
  historyGroup=group;historyTime=now;
  updateHistoryButtons();draftOptions();scheduleSave();
}
function restoreHistory(direction) {
  const next=historyIndex+direction;
  if(next<0||next>=history.length) return;
  restoringHistory=true;
  pause();
  historyIndex=next;
  const snapshot=history[next];
  jsonState=P.readJson(JSON.stringify(snapshot.document));config=jsonState.config;
  let restoredValidation=snapshot.validation,recovered=false;
  if(restoredValidation?.error&&restoredValidation.fromJson) {
    try{jsonState=P.readJson(snapshot.source);config=jsonState.config;restoredValidation={error:null,fromJson:false};recovered=true;}
    catch(error){restoredValidation={error:{message:error.message,field:error.field},fromJson:true};}
  }
  $('intro-name').value=typeof snapshot.name==='string'?snapshot.name:'Untitled intro';
  $('json').value=snapshot.source;
  fillFields();
  if(!recovered&&Array.isArray(snapshot.values)&&snapshot.values.length===fields.length)fields.forEach((field,i)=>{if(field.type==='checkbox')field.checked=snapshot.values[i];else field.value=snapshot.values[i];});
  for(const id of previewFields)if(snapshot.preview?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=snapshot.preview[id];else $(id).value=snapshot.preview[id];}
  $('json').setSelectionRange(...snapshot.selection);
  $('preset').value='custom';
  validation(restoredValidation.error,restoredValidation.fromJson);
  refreshPreview();
  historyGroup=null;
  restoringHistory=false;
  updateHistoryButtons();draftOptions();scheduleSave();
}
const sources=new Set();
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const fields=[...document.querySelectorAll('[data-field]')];
for(const [id,name] of Object.entries({'json-tab':'braces','text-tab':'type',copy:'copy','format-json':'text-align-start',undo:'undo-2',redo:'undo-2',restart:'rotate-ccw','restore-json':'undo-2','appearance-tab':'sliders-horizontal','timing-tab':'timer','bars-tab':'panel-top','locations-tab':'map-pin','new-angle':'shuffle','apply-effect':'wand-sparkles','apply-color':'palette','apply-gradient':'blend'})) $(id).prepend(HeritageIcons.create(name));
document.querySelector('[data-wrap="italic"]').prepend(HeritageIcons.create('italic'));
document.querySelector('[data-wrap="underline"]').prepend(HeritageIcons.create('underline'));
HeritageIcons.action('play','play','Play');
HeritageIcons.action('mute','volume-2','Mute');
const names=()=>Object.fromEntries(['biome','structure','dimension'].map(id=>[id,$(id).value]));
const code=new HeritageJsonEditor($('json'),$('line-count'));
const syncCode=()=>code.sync();
const syncCodeScroll=()=>code.syncScroll();
function setupTabs(attribute,panelSuffix) {
  const buttons=[...document.querySelectorAll('['+attribute+']')];
  function select(button) {
    for(const item of buttons) {
      const selected=item===button;
      item.setAttribute('aria-selected',String(selected));
      item.tabIndex=selected?0:-1;
      $(item.getAttribute(attribute)+panelSuffix).hidden=!selected;
    }
    syncCodeScroll();
  }
  buttons.forEach(button=>{
    button.addEventListener('click',()=>select(button));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const available=buttons.filter(item=>!item.disabled), index=available.indexOf(button);
      const next=event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
      select(available[next]);
      available[next].focus();
    });
  });
}
function random(seed) {
  let state=seed>>>0;
  return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
}
function fillFields() {
  for(const field of fields) {
    const value=config[field.dataset.field];
    if(field.type==='checkbox') field.checked=value;
    else {field.value=['text','subtitle'].includes(field.dataset.field)?P.componentText(value):value;field.readOnly=['text','subtitle'].includes(field.dataset.field)&&typeof value!=='string';}
    if(field.readOnly)field.title='Structured Minecraft text is preserved. Edit this field in JSON.';else field.removeAttribute('title');
  }
}
function stopSounds() { for(const source of sources) source.stop(); sources.clear(); }
function pause() { playing=false;if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0; HeritageIcons.action('play','play','Play'); stopSounds(); }
async function prepareAudio() {
  if(audioBuffer) { await audioContext.resume(); return; }
  audioContext ||= new AudioContext();
  await audioContext.resume();
  if(!gain) {
    gain=audioContext.createGain();
    gain.connect(audioContext.destination);
  }
  gain.gain.value=muted?0:.35;
  const bytes=Uint8Array.from(atob(HeritageAssets.blip.split(',')[1]),ch=>ch.charCodeAt(0));
  audioBuffer=await audioContext.decodeAudioData(bytes.buffer);
}
function blip(pitch) {
  if(muted || !audioBuffer) return;
  const source=audioContext.createBufferSource();
  source.buffer=audioBuffer;
  source.playbackRate.value=pitch;
  source.connect(gain);
  sources.add(source);
  source.onended=()=>sources.delete(source);
  source.start();
}
function buildCues() {
  const rng=random(3529), list=[];
  let last=0,next=3;
  const end=config.black_hold_ticks+(['word_by_word','letter_by_letter'].includes(config.animation)?config.reveal_ticks:1);
  for(let age=1;age<P.duration(config)&&age<=end;age++) {
    if(age<config.black_hold_ticks) continue;
    const count=P.visible(config,all,age-config.black_hold_ticks,revealEnds);
    if(count<next) continue;
    if(all.slice(Math.min(last,all.length),Math.min(count,all.length)).some(g=>/[\p{L}\p{N}]/u.test(g.ch))) list.push({tick:age,pitch:.9+rng()*.2});
    last=count;
    next=count+3+Math.floor(rng()*3);
  }
  return list;
}
function glyph(ch) { return font.get(ch)||font.get('?'); }
function advance(g) { return glyph(g.ch).advance+(g.effect.bold?1:0); }
function rebuild() {
  main=P.parse(config.text,names());
  sub=P.parse(config.subtitle,names(),main.length+1);
  all=[...main,{ch:'\n',index:main.length,effect:{}},...sub];
  revealEnds=config.animation==='word_by_word'?P.wordEnds(all):[];
  const w=Number($('viewport').value), h=w*9/16;
  canvas.width=w*2; canvas.height=h*2;
  blocks=P.layout(config,main,sub,w,h,config.bar_style==='random'?slant:0,advance);
  cues=buildCues();
  const missing=[...new Set(all.filter(g=>!font.has(g.ch)&&g.ch!=='\n').map(g=>g.ch))];
  $('font-warning').hidden=!missing.length;
  $('font-warning').textContent=missing.length?'The preview font is missing these characters: '+missing.join(' ')+'. Check them in Minecraft.':'';
  $('timeline').max=P.duration(config);
}
function validation(error=null,fromJson=false) {
  currentValidation={error,fromJson};
  for(const field of fields) {
    const invalid=!fromJson&&error?.field===field.dataset.field;
    field.setAttribute('aria-invalid',String(invalid));
    const id='field-error-'+field.dataset.field;
    let message=document.getElementById(id);
    const label=field.closest('label');
    field.setAttribute('aria-label',[...label.childNodes].filter(node=>node.nodeType===3||node.nodeName==='SPAN').map(node=>node.textContent).join('').trim());
    if(!message){message=document.createElement('p');message.id=id;message.className='field-error';label.append(message);}
    message.textContent=invalid?error.message:'';message.hidden=!invalid;
    field.setAttribute('aria-describedby',id);
    if(invalid) {
      const panel=field.closest('[role=tabpanel]');
      if(panel)document.querySelector('[aria-controls="'+panel.id+'"]')?.click();
    }
  }
  $('component-notice').hidden=!['text','subtitle'].some(key=>typeof config[key]!=='string');

  valid=!error;
  syncCode();
  $('json-state').textContent=error?'Check '+(fromJson?'JSON':'options'):'JSON ready';
  $('text-tab').disabled=!!error&&fromJson;
  if(error&&fromJson&&$('text-tab').getAttribute('aria-selected')==='true')$('json-tab').click();
  $('error').hidden=valid;
  $('error').textContent=error?error.message+' Showing the last valid preview.':'';
  $('json').setAttribute('aria-invalid',String(!!error&&fromJson));
  $('restore-json').hidden=valid;
  $('copy-status').textContent='';
  $('download-intro').disabled=!valid;
  for(const id of ['copy','format-json','play','restart']) $(id).disabled=!valid;
  for(const control of [...fields,...document.querySelectorAll('.text-editor button, .text-editor select')]) control.disabled=!!error&&fromJson;
}
function refreshPreview() {
  rebuild();
  time=Math.min(config.black_hold_ticks+config.reveal_ticks+10,P.duration(config)-config.fade_out_ticks-1);
  previewing=true;
  draw();
}
function applyJson(event) {
  pause();
  try {
    const next=P.readJson($('json').value);
    jsonState=next;
    config=next.config;
    fillFields();
    $('preset').value='custom';
    validation();
    refreshPreview();
  } catch(error) { validation(error,true); }
  recordHistory(event);
}
function editing(event) {
  pause();
  try {
    const changes={};
    for(const field of fields) {
      if(field.readOnly)continue;
      let value=field.value;
      if(field.type==='checkbox') value=field.checked;
      else if(field.type==='number') {
        if(!field.value.trim()) throw Object.assign(new Error(field.closest('label').firstChild.textContent.trim()+' is required.'),{field:field.dataset.field});
        value=Number(field.value);
      }
      if(value!==config[field.dataset.field]) changes[field.dataset.field]=value;
    }
    const next=P.updateJson(jsonState,changes);
    jsonState=next;
    config=next.config;
    $('json').value=JSON.stringify(jsonState.document,null,2);
    validation();
    refreshPreview();
  } catch(error) { validation(error); }
  recordHistory(event);
}
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
function drawBlock(block,visible,alpha,tick) {
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
    if(config.outline) {
      for(const decoration of [false,true]) for(const item of draws) for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) drawGlyph(item,dx,dy,0,decoration);
    }
    for(const decoration of [false,true]) for(const item of draws) drawGlyph(item,0,0,item.color,decoration);
  });
  ctx.restore();
}
function bars(w,h,ticks) {
  if(!config.cinematic_bars) return;
  const duration=P.presentation(config),transition=Math.min(config.bar_transition_ticks,duration/2);
  const entry=P.clamp(ticks/transition),exit=P.clamp((ticks-(duration-transition))/transition);
  const progress=(1-(1-entry)**3)*(1-exit**3), bar=Math.min(26,h/4);
  if(progress<=0) return;
  const angle=config.bar_style==='random'?slant:0,travel=bar+Math.abs(angle)+4;
  ctx.fillStyle='#000';ctx.globalAlpha=1;
  for(let x=0;x<w;x++) {
    const diagonal=angle*x/w;
    const top=Math.floor(-travel*(1-progress)+bar+diagonal+.5);
    const bottom=Math.floor(h-bar+travel*(1-progress)+diagonal+.5);
    if(top>0)ctx.fillRect(x,0,1,top);
    if(bottom<h)ctx.fillRect(x,bottom,1,h-bottom);
  }
}
function draw() {
  const w=canvas.width/2,h=canvas.height/2;
  ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
  ctx.fillStyle=$('background').value;ctx.fillRect(0,0,w,h);
  const elapsed=time-config.black_hold_ticks, total=P.duration(config);
  if(time<total) {
    const progress=P.clamp(elapsed/config.fade_from_black_ticks), reveal=progress*progress*(3-2*progress);
    ctx.globalAlpha=Math.round(255*(1-reveal))/255;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
    if(elapsed>=0) {
      bars(w,h,elapsed);
      let alpha=P.clamp((P.presentation(config)-elapsed)/config.fade_out_ticks);
      if(config.animation==='fade_in') alpha*=P.clamp(elapsed/config.reveal_ticks);
      alpha=Math.round(alpha*255);
      if(alpha>=4) {
        const visible=P.visible(config,all,elapsed,revealEnds);
        for(const block of blocks) drawBlock(block,visible,alpha,Math.floor(elapsed));
      }
    }
  }
  ctx.globalAlpha=1;
  $('timeline').value=time;
  const clock=(time/20).toFixed(1)+' / '+(total/20).toFixed(1)+' s';
  if($('clock').textContent!==clock){
    $('clock').textContent=clock;
    $('timeline').setAttribute('aria-valuetext',(time/20).toFixed(1)+' seconds of '+(total/20).toFixed(1));
  }
  const phase=time>=total?'Complete':elapsed<0?'Black screen':elapsed>=P.presentation(config)-config.fade_out_ticks?'Text fade out':config.animation!=='immediate'&&elapsed<config.reveal_ticks?'Text reveal':'Text hold';
  if($('phase').textContent!==phase)$('phase').textContent=phase;
}
function frame(now) {
  frameRequest=0;
  if(playing) {
    const before=time;
    time=Math.min(P.duration(config),time+Math.min(250,now-lastFrame)/50);
    if(config.blip) for(const cue of cues) if(cue.tick>before&&cue.tick<=time) blip(cue.pitch);
    if(time>=P.duration(config)) {
      if($('loop').checked) {time=0;stopSounds();}
      else pause();
    }
    draw();
  }
  lastFrame=now;
  if(playing)frameRequest=requestAnimationFrame(frame);
}
async function play(restart=false) {
  if(playing&&!restart) {pause();return;}
  if(!valid) return;
  if(config.blip&&!muted) {
    try {await prepareAudio();$('audio-status').textContent='';}
    catch(error) {$('audio-status').textContent='Preview audio could not load: '+error.message;}
  }
  if(restart||previewing||time>=P.duration(config)) time=0;
  previewing=false;
  playing=true;
  lastFrame=performance.now();
  HeritageIcons.action('play','pause','Pause');
  if(!frameRequest)frameRequest=requestAnimationFrame(frame);
}
function wrapSelection(open,close) {
  if(activeField.readOnly){$('copy-status').textContent='Edit structured text in JSON. Your component has been kept.';return;}
  const field=activeField,start=field.selectionStart,end=field.selectionEnd;
  const a=start===end?0:start,b=start===end?field.value.length:end;
  field.setRangeText(open+field.value.slice(a,b)+close,a,b,'select');
  field.focus();field.setSelectionRange(a+open.length,b+open.length);
  $('preset').value='custom';editing();
}
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
for(const [name,value] of Object.entries(P.colors)) {
  const option=document.createElement('option');option.value=hex(value);option.textContent=name.replaceAll('_',' ');$('named-color').append(option);
}
$('named-color').value='#ffaa00';
$('named-color').addEventListener('change',()=>{$('color').value=$('named-color').value;});
fillFields();
$('json').value=JSON.stringify(jsonState.document,null,2);
loadDrafts();
const linkedIntro=new URLSearchParams(location.search).get('intro');
if(linkedIntro!==null){
  openIntro(linkedIntro,'Imported intro');
  const url=new URL(location.href);url.searchParams.delete('intro');window.history.replaceState(null,'',url.pathname+url.search+url.hash);
}
document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey) return;
  const key=event.key.toLowerCase();
  if(key!=='z'&&key!=='y') return;
  const target=event.target;
  if(target instanceof HTMLInputElement&&!target.hasAttribute('data-field')&&target.id!=='intro-name') return;
  event.preventDefault();
  restoreHistory(key==='y'||event.shiftKey?1:-1);
});
$('timeline').disabled=false;
$('intro-drafts').addEventListener('change',()=>activateIntro($('intro-drafts').value));
$('intro-name').addEventListener('input',event=>recordHistory(event));
$('new-intro').addEventListener('click',()=>{openIntro();$('intro-name').focus();$('intro-name').select();});
for(const field of fields) {
  field.addEventListener('input',event=>{$('preset').value='custom';editing(event);});
  if(field.tagName==='TEXTAREA') field.addEventListener('focus',()=>{activeField=field;});
}
$('settings').addEventListener('submit',event=>event.preventDefault());
$('play').addEventListener('click',()=>play());
$('restart').addEventListener('click',()=>play(true));
$('timeline').addEventListener('input',()=>{
  const requested=Number($('timeline').value);pause();previewing=false;time=requested;draw();
});
$('mute').addEventListener('click',()=>{
  muted=!muted;
  if(gain) gain.gain.value=muted?0:.35;
  if(muted)stopSounds();
  HeritageIcons.action('mute',muted?'volume-x':'volume-2',muted?'Unmute':'Mute');
  $('mute').setAttribute('aria-label',muted?'Unmute preview sound':'Mute preview sound');
  if(!muted&&playing&&config.blip) prepareAudio().catch(error=>{$('audio-status').textContent=error.message;});
});
$('background').addEventListener('input',()=>{draw();scheduleSave();});
$('viewport').addEventListener('change',()=>{rebuild();draw();scheduleSave();});
$('loop').addEventListener('change',scheduleSave);
for(const id of ['biome','structure','dimension']) $(id).addEventListener('input',()=>{pause();refreshPreview();scheduleSave();});
$('json').addEventListener('input',applyJson);
setupTabs('data-editor-tab','-panel');
setupTabs('data-options-tab','-panel');
$('undo').addEventListener('click',()=>restoreHistory(-1));
$('redo').addEventListener('click',()=>restoreHistory(1));
$('format-json').addEventListener('click',()=>{
  if(!valid) return;
  $('json').value=JSON.stringify(jsonState.document,null,2);
  syncCode();
  recordHistory();
});
$('restore-json').addEventListener('click',()=>{
  $('json').value=JSON.stringify(jsonState.document,null,2);
  applyJson();
});
$('new-angle').addEventListener('click',()=>{slant=Math.random()*24-12;rebuild();draw();});
document.querySelectorAll('[data-wrap]').forEach(button=>button.addEventListener('click',()=>wrapSelection('<'+button.dataset.wrap+'>','</'+button.dataset.wrap+'>')));
$('apply-effect').addEventListener('click',()=>wrapSelection('<'+$('effect').value+'>','</'+$('effect').value+'>'));
$('apply-color').addEventListener('click',()=>wrapSelection('<color:'+$('color').value+'>','</color>'));
$('apply-gradient').addEventListener('click',()=>wrapSelection('<gradient:'+$('color').value+':'+$('gradient-end').value+'>','</gradient>'));
document.querySelectorAll('[data-token]').forEach(button=>button.addEventListener('click',()=>{
  if(activeField.readOnly){$('copy-status').textContent='Edit structured text in JSON. Your component has been kept.';return;}
  activeField.setRangeText('<'+button.dataset.token+'>',activeField.selectionStart,activeField.selectionEnd,'end');
  activeField.focus();editing();
}));
$('preset').addEventListener('change',()=>{
  const value=$('preset').value;if(value==='custom')return;
  const name=$('preset').selectedOptions[0].textContent;
  let example={...P.defaults};
  if(value!=='default'){
    example={...example,text:'A new journey begins.',subtitle:'',title:true,animation:'immediate',title_position:'mid_center'};
    if(['wave','rainbow'].includes(value))example.text='<'+value+'>'+example.text+'</'+value+'>';
    if(value==='gradient')example.text='<gradient:#ffcc55:#55aaff>'+example.text+'</gradient>';
    if(value==='letter'||value==='word'){
      example.text='You woke up in <gold><biome></gold>...';example.animation=value==='letter'?'letter_by_letter':'word_by_word';
    }
  }
  openIntro(JSON.stringify({intro:example},null,2),name);$('preset').value='custom';
});
$('copy').addEventListener('click',async()=>{
  if(!valid) return;
  const text=JSON.stringify(jsonState.document,null,2);
  try {
    await navigator.clipboard.writeText(text);
    $('copy-status').textContent='';HeritageIcons.copied($('copy'));
  } catch {
    $('json-tab').click();
    $('json').focus();$('json').select();
    $('copy-status').textContent='Copy the selected JSON with Ctrl+C.';
  }
});
HeritageSession.library({workspace:()=>workspace,snapshot:historySnapshot,activate:activateIntro,blank:()=>openIntro(),kind:'intro',status:message=>{$('copy-status').textContent=message;},persist:()=>{draftOptions();saveDraft();}});
$('import-intro').addEventListener('change',async()=>{
  const file=$('import-intro').files[0];if(!file)return;
  try{openIntro(await file.text(),file.name.replace(/\.json$/i,''));$('json-tab').click();}
  catch(error){$('copy-status').textContent='Could not read intro: '+error.message;}
  $('import-intro').value='';
});
$('download-intro').addEventListener('click',()=>{
  if(!valid)return;
  HeritageSession.download(jsonState.document,($('intro-name').value.replace(/[^a-z0-9_-]+/gi,'_')||'intro')+'.json');
});
const requested=new URLSearchParams(location.search).get('draft');
if(requested&&workspace.entries.has(requested))activateIntro(requested);
validation(currentValidation.error,currentValidation.fromJson);
if(requested&&!workspace.entries.has(requested))$('copy-status').textContent='This intro is missing. Choose another saved intro.';
if(valid)$('text-tab').click();
HeritageTooltips.setup({font,sprite});
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();saveDraft();}});
})().catch(error=>{
  document.getElementById('phase').textContent='Preview could not load: '+error.message;
});
