(async () => {
'use strict';
const P=HeritagePreview, $=id=>document.getElementById(id),storageKey='heritage.introEditor.v1';
if(!await HeritageSession.acquire(storageKey))return;
const editorRoute=new URLSearchParams(location.search),requested=editorRoute.get('draft');
const previewFields=['resolution','viewport','background',...Object.keys(P.contextDefaults),'preview-variables','preview-facts','preview-keys','loop','show-text-boxes'];
const canvas=$('preview'), ctx=canvas.getContext('2d'), renderer=new HeritageCanvas(ctx),font=renderer.font,sprite=renderer.sprite;
let jsonState=P.readJson(JSON.stringify({intro:P.defaults}));
let config=jsonState.config, main=[], sub=[], all=[], blocks=[], cues=[], revealEnds=[];
let time=0, playing=false, previewing=true, muted=false, lastFrame=0, frameRequest=0, slant=P.sampleSlant(crypto.randomUUID()), activeField=$('text'), valid=true;
const speech=HeritageDialogueAudio.create({muted:()=>muted});
let playRequest=0;
let history=[], historyIndex=-1, restoringHistory=false, historyGroup=null, historyTime=0, currentValidation={error:null,fromJson:false};
let workspace,saveTimer,saveUnavailable=false,saveBlocked=false,restoredLibrary=false,author,packContext;
let selectedBlock=null,drag=null,timelineEditor,richEditors=new Map(),visualText=true;
let preview=P.guiViewport(1920,1080,4);
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
  packContext=HeritageWorkflow.editor('intro',workspace.active);author?.refresh();
}
function saveDraft() {
  clearTimeout(saveTimer);
  if(!workspace||saveBlocked)return;
  try{
    workspace.update(historySnapshot());localStorage.setItem(storageKey,JSON.stringify(workspace.serialize()));
    $('intro-draft-status').textContent='Draft saved';saveUnavailable=false;author?.saved();
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
  try{parsed=P.readJson(raw);}catch(failure){error={message:failure.message,field:failure.field,path:failure.path};}
  const state={
    name,source:raw,document:parsed.document,validation:{error,fromJson:!!error},
    values:fields.map(field=>{const value=configValue(parsed.config,field.dataset.field);return field.type==='checkbox'?value:P.componentText(value)||String(value);}),
    selection:[0,0],preview:historySnapshot().preview
  };
  activateIntro(workspace.add(state));if(!error)$('text-tab').click();
}
function loadDrafts() {
  const initial=historySnapshot();
  try{
    const raw=localStorage.getItem(storageKey),saved=raw===null?null:JSON.parse(raw);
    if(raw!==null&&(!saved||saved.version!==2||!Array.isArray(saved.intros)))throw new Error('Saved intros are invalid.');
    restoredLibrary=!!saved?.intros?.length;workspace=new HeritageDrafts(saved,initial,undefined,'intros');
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
    validation:{...currentValidation,error:currentValidation.error?{message:currentValidation.error.message,field:currentValidation.error.field,path:currentValidation.error.path}:null},
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
    catch(error){restoredValidation={error:{message:error.message,field:error.field,path:error.path},fromJson:true};}
  }
  $('intro-name').value=typeof snapshot.name==='string'?snapshot.name:'Untitled intro';
  $('json').value=snapshot.source;
  fillFields();
  if(!recovered&&Array.isArray(snapshot.values)&&snapshot.values.length===fields.length)fields.forEach((field,i)=>{if(field.type==='checkbox')field.checked=snapshot.values[i];else field.value=snapshot.values[i];});
  $('resolution').value=snapshot.preview?.resolution??'1920x1080';
  if(!$('resolution').value)$('resolution').value='1920x1080';
  for(const id of previewFields)if(id!=='resolution'&&id!=='viewport'&&snapshot.preview?.[id]!==undefined){if($(id).type==='checkbox')$(id).checked=snapshot.preview[id];else $(id).value=snapshot.preview[id];}
  restoreSamples();
  updateGuiScale(Number(snapshot.preview?.viewport??4));
  $('json').setSelectionRange(...snapshot.selection);
  $('preset').value='custom';
  validation(restoredValidation.error,restoredValidation.fromJson);
  refreshPreview();
  historyGroup=null;
  restoringHistory=false;
  updateHistoryButtons();draftOptions();scheduleSave();
}
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const fields=[...document.querySelectorAll('[data-field]')];
for(const field of fields)if(!field.id)field.id='intro-field-'+field.dataset.field.replaceAll('.','-');
for(const [id,name] of Object.entries({'json-tab':'braces','text-tab':'type',copy:'copy','format-json':'text-align-start',undo:'undo-2',redo:'undo-2',restart:'rotate-ccw','restore-json':'undo-2','new-angle':'shuffle','apply-effect':'wand-sparkles','apply-color':'palette','apply-gradient':'blend'})) $(id).prepend(HeritageIcons.create(name));
document.querySelector('[data-wrap="italic"]').prepend(HeritageIcons.create('italic'));
document.querySelector('[data-wrap="underline"]').prepend(HeritageIcons.create('underline'));
HeritageIcons.action('play','play','Play');
HeritageIcons.action('mute','volume-2','Mute');
let sampleData={variables:{},facts:{},keys:{}};
function restoreSamples(){for(const kind of ['variables','facts','keys']){try{const value=JSON.parse($('preview-'+kind).value);if(value&&typeof value==='object'&&!Array.isArray(value))sampleData[kind]=value;}catch(error){$('preview-'+kind).setCustomValidity(error.message);}}}
const names=()=>({...Object.fromEntries(Object.keys(P.contextDefaults).map(id=>[id,$(id).value])),...sampleData});
for(const kind of ['variables','facts','keys']){
  $('preview-'+kind).addEventListener('input',()=>{
    try{
      const value=JSON.parse($('preview-'+kind).value);
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Use a JSON object.');
      sampleData={...sampleData,[kind]:value};$('preview-'+kind).setCustomValidity('');refreshPreview();
    }catch(error){$('preview-'+kind).setCustomValidity(error.message);$('dialogue-warning').hidden=false;$('dialogue-warning').textContent='Sample '+kind+': '+error.message;}
  });
}
const code=new HeritageJsonEditor($('json'),$('line-count'));
const syncCode=()=>code.sync();
const syncCodeScroll=()=>code.syncScroll();
function random(seed) {
  let state=seed>>>0;
  return ()=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
}
function configValue(config,field) {
  const [key,part]=field.split('.');
  return key==='timeline'?P.trackTiming(config)[part]:part?(config[key]?.[part]??({x:50,y:50,width:50})[part]):config[key];
}
function fillFields() {
  for(const field of fields) {
    const value=configValue(config,field.dataset.field);
    if(field.type==='checkbox') field.checked=value;
    else {field.value=field.dataset.json!==undefined?JSON.stringify(value,null,2):['text','subtitle'].includes(field.dataset.field)?P.componentText(value):value;field.readOnly=['text','subtitle'].includes(field.dataset.field)&&typeof value!=='string';}
    if(field.readOnly)field.title='Structured Minecraft text is preserved. Edit this field in JSON.';else field.removeAttribute('title');
  }
  updateCoordinateControls();
}
function updateCoordinateControls() {
  for(const kind of ['title','subtitle']) {
    const custom=!!config[kind+'_coordinates'];
    $(kind+'-custom').checked=custom;
    $(kind+'-coordinates').hidden=!custom;
    $(kind+'-position-label').textContent=(kind==='title'?'Title':'Subtitle')+(custom?' anchor':' position');
  }
}
function stopSounds(){speech.stop();}
function pause(){playRequest++;playing=false;if(frameRequest)cancelAnimationFrame(frameRequest);frameRequest=0;HeritageIcons.action('play','play','Play');stopSounds();if(blocks.length)draw();}

const advance=renderer.advance;
function updateGuiScale(requested=Number($('viewport').value)) {
  if(packContext?.guiScale)requested=packContext.guiScale;
  const [width,height]=$('resolution').value.split('x').map(Number);
  if([320,480,640].includes(requested))requested=Math.round(width/requested);
  preview=P.guiViewport(width,height,requested);
  const field=$('viewport');
  field.replaceChildren(...Array.from({length:preview.maxScale+1},(_,scale)=>{
    const size=P.guiViewport(width,height,scale),option=document.createElement('option');
    option.value=scale;option.textContent=(scale===0?'Auto':scale)+' ('+size.guiWidth+' × '+size.guiHeight+')';
    return option;
  }));
  field.value=requested===0?'0':String(preview.scale);field.disabled=!!packContext?.guiScale;
  $('pack-preview-scale').hidden=!packContext?.guiScale;$('pack-preview-scale').textContent='Using this pack’s GUI scale '+packContext?.guiScale+'.';
}
function rebuild() {
  const resolved=P.dialogue(config,names());
  main=P.parse(resolved.text,resolved.names);
  sub=P.parse(resolved.subtitle,resolved.names,main.length+1);
  const warnings=P.diagnostics(config,names());$('dialogue-warning').hidden=!warnings.length;$('dialogue-warning').textContent=warnings.join(' ');
  all=[...main,{ch:'\n',index:main.length,effect:{}},...sub];
  revealEnds=config.animation==='word_by_word'?P.wordEnds(all):[];
  updateGuiScale();
  const w=preview.guiWidth,h=preview.guiHeight;
  canvas.width=preview.width;canvas.height=preview.height;
  canvas.style.aspectRatio=preview.width+' / '+preview.height;canvas.style.setProperty('--preview-aspect',preview.width/preview.height);
  blocks=P.layout(config,main,sub,w,h,advance);
  cues=P.blipCues(config,names(),random(3529));
  const missing=[...new Set(all.filter(g=>!font.has(g.ch)&&g.ch!=='\n').map(g=>g.ch))];
  $('font-warning').hidden=!missing.length;
  $('font-warning').textContent=missing.length?'The preview font is missing these characters: '+missing.join(' ')+'. Check them in Minecraft.':'';
  $('timeline').max=P.duration(config);
  $('bar-height-range').max=Math.max(config.bar_height,Math.trunc(h/4));$('bar-height-range').value=config.bar_height;
  const barHeight=P.barHeight(h,config.bar_height);$('bar-height-effective').textContent=!config.cinematic_bars?'Bars off':barHeight<config.bar_height?'Limited to '+barHeight+' px':(barHeight/h*100).toFixed(1)+'% per bar';
  syncConditionalControls();timelineEditor?.update(time,valid);for(const editor of richEditors.values())editor.refresh();
}
function syncConditionalControls(){
  for(const field of document.querySelectorAll('[data-field=hide_hud_during_bars],[data-field=bar_height],[data-field=bar_style],[data-field^="timeline.bar_"],#bar-height-range'))field.disabled=!config.cinematic_bars&&field.getAttribute('aria-invalid')!=='true';
  $('new-angle').disabled=!config.cinematic_bars||config.bar_style!=='random';
  const reveal=document.querySelector('[data-field=reveal_ticks]');reveal.disabled=config.animation==='immediate'&&reveal.getAttribute('aria-invalid')!=='true';reveal.closest('label').dataset.tooltip=JSON.stringify(['Text reveal',config.animation==='immediate'?'Immediate text does not use a reveal duration.':'Time for all text to appear. 20 ticks = 1 second.']);
}
function validation(error=null,fromJson=false) {
  currentValidation={error,fromJson};
  for(const field of fields) {
    const invalid=error?.field===field.dataset.field;
    field.setAttribute('aria-invalid',String(invalid));
    const id='field-error-'+field.dataset.field;
    let message=document.getElementById(id);
    const label=field.closest('label');
    field.setAttribute('aria-label',[...label.childNodes].filter(node=>node.nodeType===3||node.nodeName==='SPAN').map(node=>node.textContent).join('').trim());
    if(!message){message=document.createElement('p');message.id=id;message.className='field-error';label.append(message);}
    message.textContent=invalid?error.message:'';message.hidden=!invalid;
    field.setAttribute('aria-describedby',id);
    if(invalid&&!fromJson) {
      const panel=field.closest('[data-author-panel]');
      if(panel?.dataset.authorPanel)author?.show(panel.dataset.authorPanel,{focus:false});
    }
  }
  $('component-notice').hidden=!['text','subtitle'].some(key=>typeof config[key]!=='string');

  valid=!error;
  syncCode();
  $('json-state').textContent=error?'Check '+(fromJson?'JSON':'options'):'JSON ready';
  $('text-tab').disabled=false;
  $('error').hidden=valid;
  const location=code.setError(error&&fromJson?error:null);
  $('error').textContent=error?(location?'Line '+location.line+', column '+location.column+': ':'')+error.message+' Showing the last valid preview.':'';
  $('json').setAttribute('aria-invalid',String(!!error&&fromJson));author?.refresh();
  $('restore-json').hidden=valid;
  $('copy-status').textContent='';
  $('download-intro').disabled=!valid;$('use-in-pack').setAttribute('aria-disabled',String(!valid||saveBlocked||saveUnavailable));
  $('copy').disabled=false;$('format-json').disabled=!!error&&fromJson&&error.message.startsWith('Invalid JSON:');
  for(const id of ['play','restart'])$(id).disabled=!font.size;
  for(const control of [...fields,$('title-custom'),$('subtitle-custom'),...document.querySelectorAll('.text-editor button, .text-editor select')]) control.disabled=false;
  syncConditionalControls();
}
function refreshPreview() {
  rebuild();
  time=Math.min(P.textStart(config)+config.reveal_ticks+10,P.textStart(config)+P.textDuration(config)-config.fade_out_ticks-1);
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
function editing(event,{record=true}={}) {
  pause();
  const invalidSource=!!currentValidation.error&&currentValidation.fromJson;
  let sourceUpdated=false;
  try {
    const base=invalidSource?P.readJson($('json').value,{validate:false}):jsonState;
    const changes={},changedFields=invalidSource?(event?.target?.dataset.field?[event.target]:[]):fields;
    for(const field of changedFields) {
      if(field.readOnly)continue;
      const [key,part]=field.dataset.field.split('.');
      if(part&&key!=='timeline'&&!$(key.replace('_coordinates','')+'-custom').checked)continue;
      let value=field.value;
      if(field.type==='checkbox') value=field.checked;
      else if(field.dataset.field==='outline')value=field.value==='true';
      else if(field.dataset.json!==undefined){try{value=JSON.parse(field.value);}catch(error){throw Object.assign(new Error('Invalid '+field.dataset.field+' JSON: '+error.message),{field:field.dataset.field});}}
      else if(field.type==='number') {
        if(!field.value.trim()) throw Object.assign(new Error(field.closest('label').firstChild.textContent.trim()+' is required.'),{field:field.dataset.field});
        value=Number(field.value);
      }
      if(part) {
        if(key==='timeline'){if(value===configValue(base.config,field.dataset.field))continue;const next=HeritageTimeline.changes(base.config,field.dataset.field,value);changes.timeline={...next.timeline,...changes.timeline,[part]:value};if(!base.config.timeline)changes.hold_ticks??=next.hold_ticks;}
        else{changes[key]??={...base.config[key]};changes[key][part]=value;}
      } else if(field.dataset.json!==undefined?JSON.stringify(value)!==JSON.stringify(base.config[key]):value!==base.config[key]) changes[key]=value;
    }
    for(const kind of ['title','subtitle'])if(!$(kind+'-custom').checked&&(!invalidSource||event?.target?.id===kind+'-custom'))changes[kind+'_coordinates']=undefined;
    const timingField=event?.target?.dataset.field;
    if(!base.config.timeline&&['black_hold_ticks','fade_from_black_ticks','reveal_ticks','hold_ticks','fade_out_ticks'].includes(timingField))Object.assign(changes,HeritageTimeline.changes(base.config,timingField,changes[timingField]??base.config[timingField]));
    const draft=P.updateJson(base,changes,{validate:false});
    $('json').value=JSON.stringify(draft.document,null,2);sourceUpdated=true;
    const next=P.readJson($('json').value);
    jsonState=next;
    config=next.config;
    $('json').value=JSON.stringify(jsonState.document,null,2);
    updateCoordinateControls();
    validation();
    refreshPreview();
  } catch(error) { validation(error,invalidSource||sourceUpdated); }
  if(record)recordHistory(event);
}
function coordinatesFor(kind) {
  if(config[kind+'_coordinates'])return {...config[kind+'_coordinates']};
  const block=blocks[kind==='title'?0:1],w=preview.guiWidth,h=preview.guiHeight;
  const height=block.lines.length*block.lineHeight*block.scale;
  const width=Math.max(0,...block.lines.map(line=>line.width))*block.scale;
  const position=P.positions[config[kind+'_position']];
  const percent=(value,size)=>Math.round(P.clamp(value/size*100,0,100)*100)/100;
  return {x:percent(block.x,w),y:percent(block.y+height*position[1]/2,h),width:P.clamp(Math.ceil(width/w*1000)/10,1,100)};
}
function setCoordinates(kind,coordinates) {
  pause();
  try {
    const base=currentValidation.error&&currentValidation.fromJson?P.readJson($('json').value,{validate:false}):jsonState;
    const draft=P.updateJson(base,{[kind+'_coordinates']:coordinates},{validate:false});
    $('json').value=JSON.stringify(draft.document,null,2);
    jsonState=P.readJson($('json').value);config=jsonState.config;
    $('preset').value='custom';
    fillFields();validation();refreshPreview();
  }catch(error){validation(error,true);}
}
function selectBlock(kind) {
  pause();
  selectedBlock=kind;
  $('show-text-boxes').checked=true;
  for(const name of ['title','subtitle'])$('move-'+name).setAttribute('aria-pressed',String(name===kind));
  draw();canvas.focus();
}
function point(event) {
  const rect=canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)/rect.width*preview.width/preview.scale,y:(event.clientY-rect.top)/rect.height*preview.height/preview.scale};
}
function blockAt(point) {
  const order=selectedBlock===null?[1,0]:[selectedBlock==='title'?0:1,selectedBlock==='title'?1:0];
  for(const index of order) {
    const block=blocks[index];if(!block?.lines.length)continue;
    const box=P.bounds(block);
    if(point.x>=box.x-3&&point.x<=box.x+box.width+3&&point.y>=box.y-3&&point.y<=box.y+box.height+3)return index===0?'title':'subtitle';
  }
  return null;
}
function drawBounds() {
  if(!$('show-text-boxes').checked||playing||document.body.dataset.authorStage!=='layout')return;
  ctx.save();ctx.lineWidth=.5;
  blocks.forEach((block,index)=>{
    if(!block.lines.length)return;
    const kind=index===0?'title':'subtitle',box=P.bounds(block);
    ctx.strokeStyle=selectedBlock===kind?'#ffaa00':'#999';
    ctx.strokeRect(box.x-2,box.y-2,box.width+4,box.height+4);
    const position=P.positions[config[kind+'_position']];
    const anchorY=block.y+box.height*position[1]/2;
    ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(block.x-1,anchorY-1,2,2);
  });
  ctx.restore();
}
function finishDrag(cancel=false) {
  if(!drag)return;
  const previous=drag;drag=null;
  if(canvas.hasPointerCapture(previous.pointerId))canvas.releasePointerCapture(previous.pointerId);
  canvas.style.cursor='grab';
  if(cancel) {
    jsonState=previous.state;config=jsonState.config;$('json').value=previous.source;
    fillFields();validation();refreshPreview();
  } else if(previous.moved)recordHistory();
}
function setupPositionControls() {
  for(const kind of ['title','subtitle']) {
    $(kind+'-custom').addEventListener('change',event=>{
      if(event.target.checked) {
        setCoordinates(kind,coordinatesFor(kind));recordHistory(event);
      }else editing(event);
    });
    $('move-'+kind).addEventListener('click',()=>selectBlock(kind));
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||!valid||playing||!$('show-text-boxes').checked||author?.current!=='layout')return;
    const position=point(event),kind=blockAt(position);if(!kind)return;
    event.preventDefault();selectBlock(kind);
    drag={kind,start:position,coordinates:coordinatesFor(kind),pointerId:event.pointerId,state:jsonState,source:$('json').value,moved:false};
    canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag) {
      canvas.style.cursor=author?.current==='layout'&&valid&&!playing&&$('show-text-boxes').checked&&blockAt(point(event))?'grab':'default';return;
    }
    if(event.pointerId!==drag.pointerId)return;
    const position=point(event),dx=position.x-drag.start.x,dy=position.y-drag.start.y;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<1)return;
    drag.moved=true;
    const round=value=>Math.round(P.clamp(value,0,100)*10)/10;
    setCoordinates(drag.kind,{...drag.coordinates,x:round(drag.coordinates.x+dx/preview.guiWidth*100),y:round(drag.coordinates.y+dy/preview.guiHeight*100)});
  });
  canvas.addEventListener('pointerup',event=>{if(event.pointerId===drag?.pointerId)finishDrag();});
  canvas.addEventListener('pointercancel',()=>finishDrag(true));
  canvas.addEventListener('lostpointercapture',()=>finishDrag());
  canvas.addEventListener('keydown',event=>{
    if(event.key==='Escape'){finishDrag(true);selectedBlock=null;for(const kind of ['title','subtitle'])$('move-'+kind).setAttribute('aria-pressed','false');draw();return;}
    if(author?.current!=='layout'||!selectedBlock||!valid||playing||event.ctrlKey||event.metaKey||event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();
    const coordinates=coordinatesFor(selectedBlock),step=event.shiftKey?1:.1;
    const key=event.key==='ArrowLeft'||event.key==='ArrowRight'?'x':'y';
    const direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    coordinates[key]=Math.round(P.clamp(coordinates[key]+direction*step,0,100)*10)/10;
    setCoordinates(selectedBlock,coordinates);recordHistory({type:'input',target:$(selectedBlock+'-'+key)});
  });
  $('show-text-boxes').addEventListener('change',()=>{draw();scheduleSave();});
}

const drawBlock=(...args)=>renderer.block(...args,config.outline,!config.outline);
const bars=(...args)=>renderer.bars(...args,config,slant);
function draw() {
  const w=preview.guiWidth,h=preview.guiHeight;
  ctx.setTransform(preview.scale,0,0,preview.scale,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;
  ctx.fillStyle=$('background').value;ctx.fillRect(0,0,w,h);
  const elapsed=time-P.textStart(config),worldElapsed=time-config.black_hold_ticks,total=P.duration(config);
  if(time<total) {
    const progress=P.clamp(worldElapsed/config.fade_from_black_ticks), reveal=progress*progress*(3-2*progress);
    ctx.globalAlpha=Math.round(255*(1-reveal))/255;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
    bars(w,h,worldElapsed);
    if(elapsed>=0) {
      let alpha=P.clamp((P.textDuration(config)-elapsed)/config.fade_out_ticks);
      if(config.animation==='fade_in') alpha*=P.clamp(elapsed/config.reveal_ticks);
      alpha=Math.round(alpha*255);
      if(alpha>=4) {
        const visible=P.visible(config,all,elapsed,revealEnds);
        for(const block of blocks) drawBlock(block,visible,alpha,Math.floor(elapsed));
      }
    }
  }
  ctx.globalAlpha=1;
  drawBounds();
  $('move-subtitle').disabled=!sub.length;
  $('timeline').value=time;timelineEditor?.tick(time);
  const clock=(time/20).toFixed(1)+' / '+(total/20).toFixed(1)+' s';
  if($('clock').textContent!==clock){
    $('clock').textContent=clock;
    $('timeline').setAttribute('aria-valuetext',(time/20).toFixed(1)+' seconds of '+(total/20).toFixed(1));
  }
  const phase=time>=total?'Complete':elapsed<0?'Black screen':elapsed>=P.textDuration(config)-config.fade_out_ticks?'Text fade out':config.animation!=='immediate'&&elapsed<config.reveal_ticks?'Text reveal':'Text hold';
  if($('phase').textContent!==phase)$('phase').textContent=phase;
}
function frame(now) {
  frameRequest=0;
  if(playing) {
    time=Math.min(P.duration(config),time+Math.max(0,now-lastFrame)/50);
    if(time>=P.duration(config)) {
      if($('loop').checked){time=0;stopSounds();speech.start(cues,0).catch(error=>{$('audio-status').textContent=error.message;});}
      else pause();
    }
    draw();
  }
  lastFrame=now;
  if(playing)frameRequest=requestAnimationFrame(frame);
}
async function play(restart=false) {
  if(playing&&!restart) {pause();return;}
  if(!font.size)return;const request=++playRequest;
  if(config.blip&&!muted) {
    try {await speech.prepare();$('audio-status').textContent='';}
    catch(error) {$('audio-status').textContent='Preview audio could not load: '+error.message;}
  }
  if(request!==playRequest)return;
  if(restart||previewing||time>=P.duration(config))time=0;
  if(config.blip&&!muted){await speech.start(cues,()=>time).catch(error=>{$('audio-status').textContent='Preview audio could not load: '+error.message;});if(request!==playRequest){stopSounds();return;}}
  previewing=false;
  playing=true;
  lastFrame=performance.now();
  HeritageIcons.action('play','pause','Pause');
  if(!frameRequest)frameRequest=requestAnimationFrame(frame);
}
function wrapSelection(open,close) {
  if(activeField.readOnly){$('copy-status').textContent='Edit structured text in JSON. Your component has been kept.';return;}
  if(visualText&&richEditors.has(activeField.id)){richEditors.get(activeField.id).format(open,close);return;}
  const field=activeField,start=field.selectionStart,end=field.selectionEnd;
  const a=start===end?0:start,b=start===end?field.value.length:end;
  field.setRangeText(open+field.value.slice(a,b)+close,a,b,'select');
  field.focus();field.setSelectionRange(a+open.length,b+open.length);
  $('preset').value='custom';editing({target:field});
}
await renderer.load();
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
  if(target instanceof HTMLInputElement&&!target.hasAttribute('data-field')&&!target.hasAttribute('data-position-custom')&&target.id!=='intro-name'&&target.id!=='bar-height-range') return;
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
$('bar-height-range').addEventListener('input',event=>{$('bar-height').value=event.target.value;$('bar-height').dispatchEvent(new Event('input',{bubbles:true}));});
setupPositionControls();
$('settings').addEventListener('submit',event=>event.preventDefault());
$('play').addEventListener('click',()=>play());
$('restart').addEventListener('click',()=>play(true));
$('timeline').addEventListener('input',()=>{
  const requested=Number($('timeline').value);pause();previewing=false;time=requested;draw();
});
$('mute').addEventListener('click',()=>{
  muted=!muted;
  speech.syncMute();
  if(muted)stopSounds();
  HeritageIcons.action('mute',muted?'volume-x':'volume-2',muted?'Unmute':'Mute');
  $('mute').setAttribute('aria-label',muted?'Unmute preview sound':'Mute preview sound');
  if(!muted&&playing&&config.blip)speech.start(cues,()=>time).catch(error=>{$('audio-status').textContent=error.message;});
});
$('background').addEventListener('input',()=>{draw();scheduleSave();});
for(const id of ['resolution','viewport'])$(id).addEventListener('change',()=>{rebuild();draw();scheduleSave();});
$('loop').addEventListener('change',scheduleSave);
for(const id of ['biome','structure','dimension']) $(id).addEventListener('input',()=>{pause();refreshPreview();scheduleSave();});
$('json').addEventListener('input',applyJson);
$('undo').addEventListener('click',()=>restoreHistory(-1));
$('redo').addEventListener('click',()=>restoreHistory(1));
$('format-json').addEventListener('click',event=>{
  const source=$('json').value;
  try{
    $('json').value=JSON.stringify(JSON.parse(/^\s*"intro"\s*:/.test(source)?'{'+source+'}':source),null,2);
    applyJson(event);
  }catch(error){validation(new Error('Invalid JSON: '+error.message),true);}
});
$('restore-json').addEventListener('click',()=>{
  $('json').value=JSON.stringify(jsonState.document,null,2);
  applyJson();
});
$('new-angle').addEventListener('click',()=>{slant=P.sampleSlant(crypto.randomUUID());rebuild();draw();});
document.querySelectorAll('[data-wrap]').forEach(button=>button.addEventListener('click',()=>wrapSelection('<'+button.dataset.wrap+'>','</'+button.dataset.wrap+'>')));
$('apply-effect').addEventListener('click',()=>wrapSelection('<'+$('effect').value+'>','</'+$('effect').value+'>'));
$('apply-color').addEventListener('click',()=>wrapSelection('<color:'+$('color').value+'>','</color>'));
$('apply-gradient').addEventListener('click',()=>wrapSelection('<gradient:'+$('color').value+':'+$('gradient-end').value+'>','</gradient>'));
function insertTag(tag){
  if(activeField.readOnly){$('copy-status').textContent='Edit structured text in JSON. Your component has been kept.';return;}
  if(visualText&&richEditors.has(activeField.id)){richEditors.get(activeField.id).insert('<'+tag+'>');return;}
  activeField.setRangeText('<'+tag+'>',activeField.selectionStart,activeField.selectionEnd,'end');
  activeField.focus();editing({target:activeField});
}
document.querySelectorAll('[data-token]').forEach(button=>button.addEventListener('click',()=>insertTag(button.dataset.token)));
$('insert-context-tag').addEventListener('click',()=>insertTag($('context-tag').value));
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
  const text=$('json').value;
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
if(requested&&workspace.entries.has(requested))activateIntro(requested);
if(editorRoute.get('create')==='1'){if(restoredLibrary&&!saveBlocked)openIntro();if(editorRoute.has('name')&&!saveBlocked){$('intro-name').value=editorRoute.get('name');$('intro-name').dispatchEvent(new Event('input',{bubbles:true}));}editorRoute.delete('name');editorRoute.delete('create');editorRoute.set('draft',workspace.active);window.history.replaceState(null,'',location.pathname+(editorRoute.size?'?'+editorRoute:'')+location.hash);}
validation(currentValidation.error,currentValidation.fromJson);
if(requested&&!workspace.entries.has(requested))$('copy-status').textContent='This intro is missing. Choose another saved intro.';
function authorIssue(){
  if(!valid){const field=currentValidation.error?.field,node=fields.find(input=>input.dataset.field===field);return {stage:node?.closest('[data-author-panel]')?.dataset.authorPanel??'json',field:node?.id||'json',message:currentValidation.error?.message||'Resolve the highlighted fields before using this intro.'};}
  if(saveBlocked||saveUnavailable)return {stage:'json',field:'json',message:'Browser storage is unavailable. Copy your JSON before leaving.'};
  return null;
}
HeritageIntroLayout.create({textFocus:()=>{if(visualText)richEditors.get(activeField.id)?.focus();else activeField.focus();}});
for(const id of ['text','subtitle']){
  const field=$(id);richEditors.set(id,HeritageRichText.create(field,{label:id==='text'?'Main text':'Subtitle',names:()=>P.dialogue(config,names()).names,focus:field=>{activeField=field;},change:field=>{$('preset').value='custom';editing({type:'input',target:field});}}));field.hidden=true;
}
function textMode(visual){
  visualText=visual;for(const [id,editor] of richEditors){$(id).hidden=visual;editor.element.hidden=!visual;editor.refresh();}
  $('text-mode-visual').setAttribute('aria-pressed',String(visual));$('text-mode-markup').setAttribute('aria-pressed',String(!visual));
}
$('text-mode-visual').addEventListener('click',()=>textMode(true));$('text-mode-markup').addEventListener('click',()=>textMode(false));
const timelineHost=document.createElement('div');timelineHost.className='intro-timeline-host';document.querySelector('.playback').after(timelineHost);
timelineEditor=HeritageTimeline.create(timelineHost,{get:()=>config,snapshot:()=>JSON.parse(JSON.stringify(jsonState.document)),seek:value=>{pause();previewing=false;time=value;draw();},
  change:(changes,record,key)=>{pause();jsonState=P.updateJson(jsonState,changes);config=jsonState.config;$('json').value=JSON.stringify(jsonState.document,null,2);$('preset').value='custom';fillFields();validation();rebuild();previewing=false;const segment=HeritageTimeline.layout(config).tracks.flatMap(track=>track.segments).find(segment=>segment.key===key);time=Math.min(P.duration(config),key.endsWith('start_ticks')?configValue(config,key):segment?.to??time);draw();if(record)recordHistory({type:'change',target:fields.find(field=>field.dataset.field===key)});},
  commit:key=>recordHistory({type:'change',target:fields.find(field=>field.dataset.field===key)}),
  cancel:original=>{pause();jsonState=P.readJson(JSON.stringify(original));config=jsonState.config;$('json').value=JSON.stringify(jsonState.document,null,2);fillFields();validation();rebuild();time=Math.min(time,P.duration(config));draw();scheduleSave();}
});
author=HeritageAuthoring.create({kind:'intro',active:()=>workspace.active,
  stages:[{id:'text',label:'text',heading:'Write the arrival intro',help:'Name the intro, then write the text players see when they arrive.'},{id:'layout',label:'layout & style',heading:'Place and style the text',help:'Choose positions or drag the text boxes in the live preview.'},{id:'cinematic',label:'timing & bars',heading:'Set the cinematic pacing',help:'Adjust the timing and bars while checking the live preview.'},{id:'review',label:'review',heading:'Review this intro',help:'Play the full intro, then use it in your pack or create another.'}],
  entries:()=>[...workspace.entries].map(([id,entry])=>{const value=id===workspace.active?historySnapshot():entry.state;return {id,name:value.name||'Untitled intro',detail:P.parse(value.document.intro?.text??value.document.text,names()).map(glyph=>glyph.ch).join('')||'Arrival intro'};}),
  adopt:entry=>{const state=JSON.parse(JSON.stringify(entry.state));workspace.entries.set(entry.id,{state,history:[state],historyIndex:0});activateIntro(entry.id);},
  select:activateIntro,newEntry:()=>openIntro(),issue:authorIssue,persist:()=>{saveDraft();return !saveBlocked&&!saveUnavailable;},
  prepare:()=>{if(!valid||saveBlocked)return false;saveDraft();return !saveBlocked&&!saveUnavailable;},
  summary:()=>({title:$('intro-name').value||'Untitled intro',description:P.parse(config.text,names()).map(glyph=>glyph.ch).join(''),lines:[(P.duration(config)/20).toFixed(1)+' seconds',config.animation.replaceAll('_',' '),config.cinematic_bars?'Cinematic bars: '+config.bar_style.replaceAll('_',' ')+' · '+config.bar_height+' GUI px':'Cinematic bars off',packContext?.guiScale?'Pack GUI scale: '+packContext.guiScale:'Preview GUI scale: '+$('viewport').value]}),
  stageChanged:()=>{finishDrag();timelineEditor?.cancel();pause();draw();syncCodeScroll();}
});
if(packContext&&!packContext.missing){const human=value=>{const text=String(value).split(':').at(-1).replaceAll('_',' ');return text.charAt(0).toUpperCase()+text.slice(1);};for(const kind of ['biome','structure'])if(packContext.fields.type===kind&&packContext.fields.target&&!packContext.fields.target.startsWith('#'))$(kind).value=human(packContext.fields.target);if(packContext.fields.dimension)$('dimension').value=human(packContext.fields.dimension);}
updateGuiScale();refreshPreview();author.refresh();
HeritageTooltips.setup({font,sprite});
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();saveDraft();}});
})().catch(error=>{
  document.getElementById('phase').textContent='Preview could not load: '+error.message;
});
