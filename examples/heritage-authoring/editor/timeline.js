(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePreview;
const Scenes=typeof module!=='undefined'?require('./scenes.js'):HeritageScenes;
const seconds=ticks=>(ticks/20).toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+' s';
const limits=key=>({minimum:key==='black_hold_ticks'||key.endsWith('start_ticks')||key.endsWith('hold_ticks')&&key.startsWith('timeline.')?0:1,maximum:key==='timeline.bar_hold_ticks'?3600:1200});
function changes(config,key,value,names={}){
  const timing=P.trackTiming(config,names),reveal=P.revealDuration(config,names),result={};
  if(!config.timeline){
    const enter=Math.floor(timing.bar_enter_ticks),exit=Math.floor(timing.bar_exit_ticks);
    result.hold_ticks=P.textDuration(config,names)-reveal-config.fade_out_ticks;
    result.timeline={...timing,bar_enter_ticks:enter,bar_hold_ticks:P.presentation(config,names)-enter-exit,bar_exit_ticks:exit};
  }
  if(key.startsWith('timeline.'))result.timeline={...(result.timeline??timing),[key.split('.')[1]]:value};else result[key]=value;
  return result;
}
function layout(config,names={},inherited=false){
  const timing=P.trackTiming(config,names),textStart=P.textStart(config),textEnd=textStart+P.textDuration(config,names),reveal=P.revealDuration(config,names),barStart=timing.bar_start_ticks,barEnter=barStart+timing.bar_enter_ticks,barExit=barEnter+timing.bar_hold_ticks,preview=Scenes.timing(config,names),total=preview.total;
  const segment=(id,label,from,to,key,disabled=false)=>({id,label,from,to,key,disabled,value:to-from,...limits(key)});
  return {total,preview,scene:config.scene,start:config.black_hold_ticks,extended:!config.timeline&&config.fade_from_black_ticks>reveal+config.hold_ticks+config.fade_out_ticks,tracks:[
    {id:'world',label:'World',startKey:'black_hold_ticks',segments:[segment('black','Black',0,config.black_hold_ticks,'black_hold_ticks',inherited),segment('world','Fade in',config.black_hold_ticks,config.black_hold_ticks+config.fade_from_black_ticks,'fade_from_black_ticks',inherited)]},
    {id:'text',label:'Text',startKey:'timeline.text_start_ticks',segments:[segment('reveal',config.animation==='immediate'?'Immediate':'Reveal',textStart,textStart+reveal,'reveal_ticks',config.animation==='immediate'||!!P.playback(config,names).timing),segment('hold','Hold',textStart+reveal,textEnd-config.fade_out_ticks,'hold_ticks'),segment('text-fade','Fade out',textEnd-config.fade_out_ticks,textEnd,'fade_out_ticks')]},
    {id:'bars',label:'Bars',startKey:'timeline.bar_start_ticks',disabled:!config.cinematic_bars,segments:[segment('bar-in','Enter',barStart,barEnter,'timeline.bar_enter_ticks'),segment('bar-hold','Hold',barEnter,barExit,'timeline.bar_hold_ticks'),segment('bar-out','Exit',barExit,barExit+timing.bar_exit_ticks,'timeline.bar_exit_ticks')]}
  ]};
}

function sceneControls(config,node) {
  const row=node('div','timeline-row'), label=node('span','','Scene'), lane=node('div','timeline-lane');
  row.dataset.track='scene';
  const clip=node('div','timeline-segment'), clipLabel=node('span');
  const cursor=node('div','timeline-cursor'),pins=node('div','timeline-pause-pins'),ranges=node('div','timeline-prompt-ranges');
  ranges.setAttribute('aria-hidden','true');
  cursor.setAttribute('aria-hidden','true');
  clip.append(clipLabel);lane.append(clip,ranges,pins,cursor);row.append(label,lane);

  function button(label,run,type='button'){
    const control=node('button','',label);control.type=type;
    if(run)control.addEventListener('click',run);
    return control;
  }
  function field(form,label,input){
    const wrapper=node('label','stack',label);wrapper.append(input);form.append(wrapper);
    return input;
  }
  function input(type='text'){
    const element=node('input');element.type=type;return element;
  }
  function option(select,value,label){
    const entry=node('option','',label);entry.value=value;select.append(entry);
  }
  const toolbar=node('div','timeline-scene-controls');
  const editScene=button('Add scene…',()=>openScene());
  const addPause=button('Add pause…',()=>openPause(null));
  const pausePicker=node('select');pausePicker.setAttribute('aria-label','Choose a pause');
  pausePicker.addEventListener('change',()=>{
    const pause=P.scenePauses(config.preview().scene).find(item=>String(item.tick)===pausePicker.value);
    if(pause){seekPause(pause.tick);openPause(pause);}
  });
  toolbar.append(editScene,addPause,pausePicker);
  const dialog=node('dialog','timeline-scene-dialog');
  const heading=node('h2','','Scene settings');
  heading.id='timeline-scene-heading';dialog.setAttribute('aria-labelledby',heading.id);
  const settings=node('form','timeline-scene-form'), pauseForm=node('form','timeline-scene-form');
  settings.hidden=pauseForm.hidden=true;
  const mode=field(settings,'Intro animation',node('select'));
  mode.setAttribute('aria-label','Intro animation');
  function sceneChoices(){
    const cinematics=config.cinematics();
    return [...Scenes.presets.filter(choice=>cinematics.some(definition=>definition.id===choice.id)),...Scenes.cinematicChoices(cinematics)];
  }
  const drop=node('div','scene-animation-drop'),file=input('file'),browse=button('Browse…');
  file.accept='.json,application/json';file.hidden=true;
  drop.append(node('span','','Drop a Blockbench .animation.json here'),browse,file);
  settings.append(drop);
  const uploadClip=field(settings,'Imported clip',node('select'));
  uploadClip.setAttribute('aria-label','Imported clip');
  const uploadInfo=node('p','hint scene-upload-status');uploadInfo.setAttribute('role','status');uploadInfo.hidden=true;
  settings.append(uploadInfo);
  const asset=field(settings,'Animation resource ID',input()), clipName=field(settings,'Clip name',input());
  const length=field(settings,'Length in ticks',input('number'));
  length.min=1;length.max=1200;length.required=asset.required=clipName.required=true;
  const views=node('div','timeline-scene-fields');
  settings.append(views);
  const perspective=field(views,'Playback view',node('select')), exit=field(views,'Exit view',node('select'));
  for(const [value,text] of [['first_person','First person'],['third_person_front','Third person front'],['third_person_back','Third person back'],['previous','Previous view']]){
    option(perspective,value,text);option(exit,value,text);
  }
  const smooth=input('checkbox'), smoothLabel=node('label','timeline-scene-check');
  smoothLabel.append(smooth,document.createTextNode('Smooth camera return'));settings.append(smoothLabel);
  const pauseFields=node('div','timeline-scene-fields');
  pauseForm.append(pauseFields);
  const tick=field(pauseFields,'Pause tick',input('number'));tick.min=1;tick.required=true;
  const key=field(pauseFields,'Key binding',node('select'));
  for(const [name,text] of [['key.inventory','Inventory'],['key.jump','Jump'],['key.sneak','Sneak'],['key.sprint','Sprint'],
    ['key.forward','Move forward'],['key.left','Move left'],['key.back','Move back'],['key.right','Move right'],
    ['key.use','Use item'],['key.attack','Attack'],['key.drop','Drop item'],['key.swapOffhand','Swap hands'],
    ['key.pickItem','Pick block'],['key.chat','Chat'],['key.playerlist','Player list'],['key.spectatorOutlines','Spectator outlines']]){
    option(key,name,text+(Scenes.keyDefaults[name]?' ('+Scenes.keyDefaults[name]+')':''));
  }
  option(key,'custom','Other binding…');
  const otherKey=field(pauseForm,'Binding name',input());otherKey.maxLength=128;otherKey.placeholder='key.example';
  const prompt=field(pauseForm,'Prompt',input());prompt.maxLength=256;prompt.placeholder='Press {key} to continue';
  const error=node('p','field-error');error.hidden=true;error.setAttribute('role','alert');
  const removePause=button('Remove pause',()=>apply({scene:withPause(config.get().scene,selectedTick,null)}));
  const footers=new Map();
  for(const [form,remove] of [[settings,null],[pauseForm,removePause]]){
    const actions=node('div','timeline-scene-actions'),cancel=button('Cancel',close),save=button('Apply',null,'submit');
    cancel.className='quiet';save.className='primary';
    if(remove){remove.className='quiet';actions.append(remove);}
    actions.append(cancel,save);form.append(actions);
    footers.set(form,actions);
  }
  dialog.append(heading,settings,pauseForm);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  let selectedTick=null,currentTime=0,sceneTime=0,valid=true,editingScene,upload,uploadRequest=0;
  const presetScene=id=>config.cinematics().find(definition=>definition.id===id)?.scene;
  function seekPause(tick){
    const wait=Scenes.timing(config.preview(),config.names?.()).waits.find(pause=>pause.tick===tick);
    if(wait)config.seek(wait.at);
  }
  function close(){
    if(dialog.open)dialog.close();
    settings.hidden=pauseForm.hidden=error.hidden=uploadInfo.hidden=true;
    upload=null;uploadRequest++;drop.classList.remove('drag-over');
    selectedTick=null;pausePicker.value='';
  }
  function open(form,title,focus){
    config.seek(currentTime);
    heading.textContent=title;
    form.hidden=false;
    footers.get(form).before(error);
    dialog.showModal();
    focus.focus();
  }
  function showError(message){error.textContent=message;error.hidden=false;}
  function apply(changes,focusTick=null,attachment){
    if(!valid)return;
    try{
      if(changes.scene)P.validateScene(changes.scene,changes.control??config.get().control);
      const editing=dialog.open,focusAfter=pauseForm.hidden?editScene:addPause;
      config.change(changes,true,'scene',attachment);
      close();
      const marker=focusTick===null?null:pins.querySelector('[data-pause-tick="'+focusTick+'"]');
      if(focusTick!==null)seekPause(focusTick);
      if(editing)(marker??focusAfter).focus({preventScroll:true});
    }catch(error){showError(error.message);}
  }
  function fillScene(scene){
    editingScene=scene;
    asset.value=scene?.animation_file??'';
    clipName.value=scene?.clip??'';
    length.value=scene?.duration_ticks??'';
    perspective.value=scene?.perspective??'first_person';
    exit.value=scene?.exit_perspective??'first_person';
    smooth.checked=scene?.smooth_camera_return??true;
  }
  function showSceneFields(){
    const custom=mode.value==='custom';
    for(const control of [asset,clipName,length]){
      control.closest('label').hidden=!custom;
      control.disabled=!custom;
    }
    uploadClip.closest('label').hidden=mode.value!=='upload';
    views.hidden=smoothLabel.hidden=!custom&&mode.value!=='upload'&&mode.value!=='attached';
  }
  function updateUploadInfo(){
    const selected=upload?.source.clips.find(clip=>clip.name===uploadClip.value);
    uploadInfo.hidden=!selected;
    if(selected)uploadInfo.textContent=selected.duration+' ticks · '+seconds(selected.duration);
  }
  HeritageAnimations.bindDrop(drop,file,browse,async files=>{
    if(files.length!==1){showError('Choose one Blockbench animation export at a time.');return;}
    const request=++uploadRequest;
    error.hidden=true;uploadInfo.hidden=false;uploadInfo.textContent='Reading '+files[0].name+'…';
    try{
      const source=await HeritageAnimations.readFile(files[0]);
      if(request!==uploadRequest)return;
      upload={source,name:files[0].name};
      mode.querySelector('option[value="upload"]')?.remove();
      option(mode,'upload',upload.name);
      mode.value='upload';
      uploadClip.replaceChildren();
      for(const clip of source.clips){
        option(uploadClip,clip.name,clip.error?clip.name+' · '+clip.error:clip.name);
        uploadClip.lastElementChild.disabled=!!clip.error;
      }
      uploadClip.value=source.clips.find(clip=>clip.duration).name;
      showSceneFields();updateUploadInfo();uploadClip.focus();
    }catch(failure){
      if(request!==uploadRequest)return;
      updateUploadInfo();showError(failure.message);
    }
  });
  uploadClip.addEventListener('change',updateUploadInfo);
  mode.addEventListener('change',()=>{
    const preset=presetScene(mode.value);
    if(preset)fillScene(preset);
    if(mode.value==='attached')fillScene(config.get().scene);
    showSceneFields();
    if(mode.value==='upload')updateUploadInfo();else uploadInfo.hidden=true;
  });
  function openScene(){
    if(!valid)return;
    close();
    const scene=config.get().scene,choices=sceneChoices(),attachment=config.attachment();
    mode.replaceChildren();
    for(const choice of [{id:'inherit',label:'Use pack or kit setting'},{id:'none',label:'None'},...choices,{id:'custom',label:'Custom animation…'}]){
      option(mode,choice.id,choice.label);
    }
    if(attachment)option(mode,'attached',attachment.name||scene.clip);
    const preset=choices.find(choice=>Scenes.sameClip(scene,presetScene(choice.id)));
    mode.value=scene===null?'none':scene===undefined?'inherit':attachment?'attached':preset?.id??'custom';
    fillScene(scene??config.preview().scene);
    showSceneFields();
    open(settings,scene?'Edit scene':'Add scene',mode);
  }
  settings.addEventListener('submit',event=>{
    event.preventDefault();
    if(mode.value==='inherit'){apply({scene:undefined});return;}
    if(mode.value==='none'){apply({scene:null});return;}
    const view={perspective:perspective.value,exit_perspective:exit.value,smooth_camera_return:smooth.checked};
    if(mode.value==='upload'){
      const clip=upload.source.clips.find(clip=>clip.name===uploadClip.value);
      const animation_file='heritage_cinematics:intro/'+crypto.randomUUID().replaceAll('-','');
      const attachment=HeritageAnimations.resource(upload.source,clip.name,animation_file,upload.name);
      apply({control:'after_title',scene:{animation_file,clip:clip.name,duration_ticks:clip.duration,...view}},null,attachment);return;
    }
    if(mode.value==='attached'){apply({control:'after_title',scene:{...editingScene,...view}});return;}
    const preset=presetScene(mode.value);
    if(preset){apply({control:'after_title',scene:editingScene??preset});return;}
    const animation_file=asset.value.trim(),clip=clipName.value.trim();
    const previous=editingScene?.animation_file===animation_file&&editingScene.clip===clip?editingScene:undefined;
    apply({control:'after_title',scene:{...previous,animation_file,clip,duration_ticks:Number(length.value),...view}});
  });
  function updateKey(){
    otherKey.closest('label').hidden=key.value!=='custom';
    otherKey.required=key.value==='custom';
  }
  key.addEventListener('change',updateKey);
  function openPause(pause){
    if(!valid||!config.get().scene)return;
    close();
    const scene=config.get().scene;
    const ticks=new Set(P.scenePauses(scene).map(item=>item.tick));
    selectedTick=pause?.tick??null;
    tick.max=scene.duration_ticks-1;
    const proposed=Math.max(1,Math.min(Number(tick.max),Math.round(sceneTime)));
    if(selectedTick===null&&ticks.has(proposed)){
      const available=Array.from({length:Number(tick.max)},(_,i)=>i+1).filter(t=>!ticks.has(t));
      tick.value=available.reduce((nearest,t)=>Math.abs(t-proposed)<Math.abs(nearest-proposed)?t:nearest,available[0])??'';
    }else tick.value=selectedTick??proposed;
    const binding=pause?.key??'key.inventory';
    const known=[...key.options].some(option=>option.value===binding&&option.value!=='custom');
    key.value=known?binding:'custom';otherKey.value=known?'':binding;updateKey();
    prompt.value=pause?.prompt??'';
    pausePicker.value=selectedTick===null?'':String(selectedTick);
    removePause.hidden=selectedTick===null;open(pauseForm,pause?'Edit pause':'Add pause',tick);
  }
  pauseForm.addEventListener('submit',event=>{
    event.preventDefault();
    const binding=key.value==='custom'?otherKey.value.trim():key.value;
    const text=prompt.value.trim();
    const original=P.scenePauses(config.get().scene).find(pause=>pause.tick===selectedTick);
    const pause={...original,tick:Number(tick.value),key:binding};
    if(text)pause.prompt=text;
    else delete pause.prompt;
    apply({scene:withPause(config.get().scene,selectedTick,pause)},pause.tick);
  });
  function update(scene,{total,waits},canEdit){
    valid=canEdit;editScene.disabled=!valid;editScene.textContent=scene?'Edit scene…':'Add scene…';
    row.hidden=!scene;
    clip.hidden=!(scene?.duration_ticks>0);
    const sceneLength=scene?.duration_ticks??0,pauses=P.scenePauses(scene);
    addPause.hidden=!config.get().scene;addPause.disabled=!valid||pauses.length>=16||sceneLength<=pauses.length+1;
    clip.style.width=(Math.max(0,Math.min(total,sceneLength))/total*100)+'%';
    clipLabel.textContent=seconds(sceneLength)+(scene?.smooth_camera_return?' + camera return':'');
    pins.replaceChildren();
    ranges.replaceChildren(...waits.map(wait=>{
      const range=node('span');
      range.style.left=(wait.at/total*100)+'%';range.style.width=((wait.end-wait.at)/total*100)+'%';
      range.title=Scenes.prompt(wait,config.names?.()).text;return range;
    }));
    pausePicker.replaceChildren();
    pausePicker.hidden=pauses.length===0;
    pausePicker.disabled=!valid;
    option(pausePicker,'','Choose a pause');
    if(!valid){close();return;}
    for(const [index,pause] of pauses.entries()){
      const name=pause.key??'key.inventory';
      option(pausePicker,String(pause.tick),'Tick '+pause.tick+' · '+(Scenes.keyDefaults[name]??name));
      let drag=null,moved=false;
      const marker=button(Scenes.keyDefaults[name]??name,()=>{
        if(!moved){seekPause(pause.tick);openPause(pause);}
        moved=false;
      });
      marker.className='timeline-pause-pin';marker.dataset.pauseTick=pause.tick;
      marker.style.left=(pause.tick/total*100)+'%';
      marker.title='Pause at tick '+pause.tick+' · '+name;
      marker.setAttribute('aria-label',marker.title+' · Edit pause');
      marker.addEventListener('pointerdown',event=>{
        event.stopPropagation();
        if(event.button!==0||!config.get().scene)return;
        moved=false;
        drag={pointer:event.pointerId,start:event.clientX,tick:pause.tick};
        marker.setPointerCapture(drag.pointer);
      });
      marker.addEventListener('pointermove',event=>{
        if(drag?.pointer!==event.pointerId||!moved&&Math.abs(event.clientX-drag.start)<3)return;
        moved=true;
        const tick=Math.round(pause.tick+(event.clientX-drag.start)*total/lane.getBoundingClientRect().width);
        drag.tick=P.clamp(tick,(pauses[index-1]?.tick??0)+1,(pauses[index+1]?.tick??sceneLength)-1);
        marker.style.left=(drag.tick/total*100)+'%';
      });
      marker.addEventListener('pointerup',event=>{
        if(drag?.pointer!==event.pointerId)return;
        const tick=drag.tick;drag=null;
        if(tick===pause.tick)return;
        apply({scene:withPause(scene,pause.tick,{...pause,tick})});
        seekPause(tick);
      });
      marker.addEventListener('pointercancel',()=>{
        drag=null;moved=false;marker.style.left=(pause.tick/total*100)+'%';
      });
      pins.append(marker);
    }
  }
  return {row,toolbar,dialog,update,close,tick:(time,{waits,delay,total})=>{
    currentTime=time;
    sceneTime=Scenes.clipTime(time,{waits,delay});
    cursor.style.left=P.clamp(sceneTime/total)*100+'%';
  }};
}
function withPause(scene,remove,add){
  const {wait_at_ticks,...config}=scene;
  const pauses=P.scenePauses(scene).filter(pause=>pause.tick!==remove);
  if(add)pauses.push(add);
  return {...config,pauses:pauses.sort((a,b)=>a.tick-b.tick)};
}
function create(host,config){
  const node=(tag,className,text='')=>{const value=document.createElement(tag);if(className)value.className=className;value.textContent=text;return value;};
  const root=node('section','intro-track-editor');root.setAttribute('aria-label','Intro timing tracks');
  const heading=node('div','timeline-heading'),title=node('h3','','Timeline'),duration=node('output');
  const zoomLabel=node('label','timeline-zoom','Zoom'),zoomSelect=node('select');zoomSelect.setAttribute('aria-label','Timeline zoom');
  for(const value of [1,2,4,8]){const option=node('option','',value===1?'Fit':value+'×');option.value=value;zoomSelect.append(option);}zoomLabel.append(zoomSelect);heading.append(title,duration,zoomLabel);
  const ruler=node('div','timeline-ruler'),rulerCursor=node('span','timeline-ruler-playhead');
  ruler.tabIndex=0;ruler.title='Click or drag to scrub. Use the arrow keys to step.';ruler.setAttribute('role','slider');ruler.setAttribute('aria-label','Timeline playhead');ruler.setAttribute('aria-valuemin','0');
  rulerCursor.setAttribute('aria-hidden','true');
  const rows=node('div','timeline-rows'),viewport=node('div','timeline-scroll'),content=node('div','timeline-content');content.append(ruler,rows);viewport.append(content);
  const status=node('p','sr-only','Double-click to edit a segment. Drag its edges to resize or right-click for actions.');
  status.id='intro-track-help';root.setAttribute('aria-describedby',status.id);root.append(heading,viewport,status);host.append(root);
  const menu=node('div','timeline-context-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');
  const editor=node('form','timeline-value-editor');editor.setAttribute('popover','auto');editor.setAttribute('aria-label','Edit timeline timing');
  const editorHeading=node('strong'),valueLabel=node('label','stack'),valueInput=node('input'),unitLabel=node('label','stack','Unit'),unit=node('select'),error=node('p','field-error'),actions=node('div','field-actions'),apply=node('button','','Apply'),cancel=node('button','quiet','Cancel');
  valueInput.type='number';valueInput.required=true;unit.setAttribute('aria-label','Timing unit');for(const [value,label] of [['seconds','Seconds'],['ticks','Ticks']]){const option=node('option','',label);option.value=value;unit.append(option);}valueLabel.append(node('span','','Duration'),valueInput);unitLabel.append(unit);error.hidden=true;error.setAttribute('role','status');apply.type='submit';cancel.type='button';actions.append(cancel,apply);const editorFields=node('div','timeline-value-fields');editorFields.append(valueLabel,unitLabel);editor.append(editorHeading,editorFields,error,actions);root.append(menu,editor);
  const controls=new Map(),lanes=[];let drag=null,model,zoom=1,valid=true,editing=null,contextSegment=null;
  const selected=id=>model.tracks.flatMap(track=>track.segments.map(segment=>({...segment,track}))).find(segment=>segment.id===id);
  const valueOf=key=>key.startsWith('timeline.')?P.trackTiming(config.get(),config.names?.())[key.split('.')[1]]:config.get()[key];
  function position(popover,anchor){
    const box=anchor?.getBoundingClientRect?.(),x=box?.left??anchor?.clientX??0,y=box?.bottom??anchor?.clientY??0;popover.style.left='0px';popover.style.top='0px';popover.showPopover();const size=popover.getBoundingClientRect(),above=(box?.top??anchor?.clientY??0)-size.height-6,top=y+6+size.height<=innerHeight-8?y+6:above;popover.style.left=Math.max(8,Math.min(x,innerWidth-size.width-8))+'px';popover.style.top=Math.max(8,Math.min(top,innerHeight-size.height-8))+'px';
  }
  function closeEditor(restore=true){
    if(!editing)return;const previous=editing;editing=null;if(restore&&previous.changed)config.cancel(previous.original);editor.hidePopover();previous.focus?.focus({preventScroll:true});
  }
  function edit(segment,start=false,anchor=controls.get(segment.id).block){
    finish(true);closeEditor();menu.hidePopover();const key=start?segment.track.startKey:segment.key,{minimum,maximum}=limits(key);editing={key,minimum,maximum,value:start?valueOf(key):segment.value,original:config.snapshot(),focus:anchor instanceof Element?anchor:controls.get(segment.id).block,changed:false};editorHeading.textContent=segment.track.label+' · '+(start?'Start':segment.label);valueLabel.firstChild.textContent=start?'Start time':'Duration';unit.value='seconds';error.hidden=true;updateInput();position(editor,anchor);valueInput.focus();valueInput.select();
  }
  function updateInput(){if(!editing)return;const factor=unit.value==='seconds'?20:1;valueInput.value=String(Math.round(editing.value/factor*100)/100);valueInput.min=String(editing.minimum/factor);valueInput.max=String(editing.maximum/factor);valueInput.step=String(1/factor);}
  function inputValue(){
    const value=Number(valueInput.value)*(unit.value==='seconds'?20:1),rounded=Math.round(value);
    if(!valueInput.value.trim()||!Number.isFinite(value)||Math.abs(value-rounded)>.00001||rounded<editing.minimum||rounded>editing.maximum){error.textContent='Enter '+editing.minimum+' to '+editing.maximum+' whole ticks (20 ticks = 1 second).';error.hidden=false;valueInput.setAttribute('aria-invalid','true');return null;}
    error.hidden=true;valueInput.setAttribute('aria-invalid','false');return rounded;
  }
  valueInput.addEventListener('input',()=>{if(!editing)return;const value=inputValue();if(value===null)return;editing.value=value;editing.changed=true;config.change(changes(config.get(),editing.key,value,config.names?.()),false,editing.key);});
  unit.addEventListener('change',updateInput);
  editor.addEventListener('submit',event=>{event.preventDefault();if(!editing||inputValue()===null)return;const previous=editing;editing=null;if(previous.changed)config.commit(previous.key);editor.hidePopover();previous.focus?.focus({preventScroll:true});});
  cancel.addEventListener('click',()=>closeEditor());editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeEditor();}});editor.addEventListener('toggle',event=>{if(event.newState==='closed'&&editing)closeEditor();});
  function action(label,run,disabled=false){const button=node('button','',label);button.type='button';button.setAttribute('role','menuitem');button.disabled=disabled;button.addEventListener('click',()=>{menu.hidePopover();run();});menu.append(button);return button;}
  function context(segment,anchor){
    finish(true);closeEditor();contextSegment=segment.id;menu.replaceChildren(node('div','timeline-context-heading',segment.track.label+' · '+segment.label));
    action('Edit duration…',()=>edit(segment,false,anchor),!valid||segment.disabled||segment.track.disabled);
    if(segment.id!=='black')action('Move track start…',()=>edit(segment,true,anchor),!valid||segment.track.disabled);
    action('Playhead to start',()=>config.seek(segment.from));action('Playhead to end',()=>config.seek(segment.to));
    for(const other of segment.track.segments)if(other.id!==segment.id)action('Edit '+other.label.toLowerCase()+'…',()=>edit({...other,track:segment.track},false,anchor),!valid||other.disabled||segment.track.disabled);
    action('Reset duration',()=>{const defaults=layout(P.defaults).tracks.flatMap(track=>track.segments).find(item=>item.id===segment.id);config.change(changes(config.get(),segment.key,defaults.value,config.names?.()),true,segment.key);},!valid||segment.disabled||segment.track.disabled);
    if(segment.track.id==='bars')action(config.get().cinematic_bars?'Disable bars':'Enable bars',()=>config.change({cinematic_bars:!config.get().cinematic_bars},true,'cinematic_bars'),!valid);
    position(menu,anchor);menu.querySelector('button:not(:disabled)')?.focus();
  }
  menu.addEventListener('keydown',event=>{const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}if(event.key==='Escape'){event.preventDefault();menu.hidePopover();controls.get(contextSegment)?.block.focus();}});
  for(const track of layout(config.get(),config.names?.()).tracks){
    const row=node('div','timeline-row'),label=node('span','',track.label),lane=node('div','timeline-lane'),cursor=node('div','timeline-cursor');row.dataset.track=track.id;cursor.setAttribute('aria-hidden','true');
    for(const segment of track.segments){
      const block=node('div','timeline-segment'),text=node('span'),handle=node('button','timeline-handle');block.dataset.segment=segment.id;block.setAttribute('role','button');block.append(text);handle.type='button';handle.dataset.timingHandle=segment.id;handle.setAttribute('role','slider');handle.setAttribute('aria-label',track.label+' '+segment.label.toLowerCase()+' duration');lane.append(block,handle);controls.set(segment.id,{block,text,handle});
      block.addEventListener('dblclick',event=>{event.preventDefault();const current=selected(segment.id);if(valid&&!current.disabled&&!current.track.disabled)edit(current);});
    }
    const off=node('span','timeline-off','Cinematic bars off');off.hidden=true;lane.append(off,cursor);row.append(label,lane);rows.append(row);lanes.push({row,lane,cursor,off});
    row.addEventListener('contextmenu',event=>{event.preventDefault();const id=event.target.closest('[data-segment],[data-timing-handle]')?.dataset,current=selected(id?.segment??id?.timingHandle??track.segments[0].id);context(current,event);});
  }
  const sceneTrack=sceneControls(config,node);
  if(config.transport){
    config.transport.querySelector('input[type="range"]').hidden=true;
    title.after(config.transport);
  }
  (config.transport??title).after(sceneTrack.toolbar);rows.append(sceneTrack.row);root.append(sceneTrack.dialog);
  function fitLabels(){for(const {block,text,labels} of controls.values())if(labels&&!block.hidden){text.textContent=labels[0];for(const label of labels.slice(1))if(text.scrollWidth>text.clientWidth)text.textContent=label;}}
  function scale(){
    content.style.width='calc('+zoom*100+'% - '+(zoom-1)*64+'px)';ruler.replaceChildren(...Array.from({length:zoom*4+1},(_,index)=>{const position=index/(zoom*4),label=node('span','',seconds(Math.round(model.total*position)));label.style.left=position*100+'%';label.setAttribute('aria-hidden','true');return label;}),rulerCursor);fitLabels();
  }
  zoomSelect.addEventListener('change',()=>{finish(true);closeEditor();const width=viewport.clientWidth-64,center=(viewport.scrollLeft+width/2)/(width*zoom);zoom=Number(zoomSelect.value);scale();viewport.scrollLeft=center*width*zoom-width/2;});new ResizeObserver(fitLabels).observe(content);
  function update(time=0,isValid=true){
    valid=isValid;const authored=config.get(),preview=config.preview();
    model=layout(preview,config.names?.(),preview!==authored);duration.textContent=config.transport?model.total+' ticks':seconds(model.total)+' · '+model.total+' ticks';
    ruler.setAttribute('aria-valuemax',model.total);
    for(const [index,track] of model.tracks.entries()){
      lanes[index].lane.classList.toggle('disabled-track',!!track.disabled);lanes[index].off.hidden=!track.disabled;
      for(const segment of track.segments){
        const control=controls.get(segment.id),{block,text,handle}=control;block.hidden=!!track.disabled||segment.to===segment.from;control.labels=[segment.label+' '+seconds(segment.value),segment.label,seconds(segment.value),''];block.style.left=segment.from/model.total*100+'%';block.style.width=Math.max(0,segment.value/model.total*100)+'%';text.textContent=control.labels[0];block.title=track.label+' '+segment.label+' · '+seconds(segment.value)+' · Double-click to edit';
        block.setAttribute('aria-label',track.label+' '+segment.label+', '+seconds(segment.value)+'. Double-click or press Enter to edit.');block.tabIndex=valid&&!segment.disabled?0:-1;block.setAttribute('aria-disabled',String(!valid||segment.disabled));
        handle.hidden=!!track.disabled||segment.disabled||segment.value===0;handle.style.left='clamp(8px,'+segment.to/model.total*100+'%,calc(100% - 8px))';handle.disabled=!valid||segment.disabled;handle.dataset.key=segment.key;handle.dataset.value=segment.value;handle.dataset.maximum=segment.maximum;handle.setAttribute('aria-valuemin',segment.minimum);handle.setAttribute('aria-valuemax',segment.maximum);handle.setAttribute('aria-valuenow',Math.min(segment.maximum,segment.value));handle.setAttribute('aria-valuetext',seconds(segment.value)+' ('+segment.value+' ticks)');
      }
    }
    sceneTrack.update(model.scene,model.preview,valid);
    scale();tick(time);
  }
  let playhead=0;
  function tick(time){
    playhead=time;
    const position=P.clamp(time/model.total)*100+'%';
    rulerCursor.style.left=position;
    ruler.setAttribute('aria-valuenow',Math.round(time));
    ruler.setAttribute('aria-valuetext',seconds(time)+' of '+seconds(model.total));
    for(const {cursor} of lanes)cursor.style.left=position;
    sceneTrack.tick(time,model.preview);
  }
  function scrub(event){
    const bounds=ruler.getBoundingClientRect();
    config.seek(Math.round(P.clamp((event.clientX-bounds.left)/bounds.width)*model.total));
  }
  ruler.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();ruler.focus({preventScroll:true});ruler.setPointerCapture(event.pointerId);scrub(event);
  });
  ruler.addEventListener('pointermove',event=>{if(ruler.hasPointerCapture(event.pointerId))scrub(event);});
  ruler.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const delta=(event.shiftKey?20:1)*(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1);
    config.seek(event.key==='Home'?0:event.key==='End'?model.total:P.clamp(Math.round(playhead)+delta,0,model.total));
  });
  function change(key,value,commit){const {minimum,maximum}=limits(key);config.change(changes(config.get(),key,Math.round(P.clamp(value,minimum,maximum)),config.names?.()),commit,key);}
  function finish(cancel=false){
    if(!drag)return;const previous=drag;drag=null;if(previous.moved){if(cancel)config.cancel(previous.original);else config.commit(previous.key);}if(previous.target.hasPointerCapture(previous.pointer))previous.target.releasePointerCapture(previous.pointer);
  }
  rows.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const handle=event.target.closest('[data-timing-handle]'),block=event.target.closest('[data-segment]'),lane=event.target.closest('.timeline-lane');if(!lane)return;
    if(!handle&&!block){config.seek(P.clamp((event.clientX-lane.getBoundingClientRect().left)/lane.getBoundingClientRect().width)*model.total);return;}
    const segment=selected(handle?.dataset.timingHandle??block.dataset.segment);if(!valid||segment.disabled||segment.track.disabled)return;
    event.preventDefault();closeEditor();menu.hidePopover();const target=handle??block,key=handle?segment.key:segment.id==='black'?null:segment.track.startKey;target.focus();
    drag={target,key,pointer:event.pointerId,start:event.clientX,value:key?(handle?segment.value:valueOf(key)):0,scale:model.total/lane.getBoundingClientRect().width,original:config.snapshot(),moved:false,lane};target.setPointerCapture(event.pointerId);
  });
  rows.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer||!drag.key||!drag.moved&&Math.abs(event.clientX-drag.start)<3)return;drag.moved=true;change(drag.key,drag.value+(event.clientX-drag.start)*drag.scale,false);});
  rows.addEventListener('pointerup',event=>{if(drag?.pointer!==event.pointerId)return;if(!drag.moved){const box=drag.lane.getBoundingClientRect();config.seek(P.clamp((event.clientX-box.left)/box.width)*model.total);}finish();});rows.addEventListener('pointercancel',()=>finish(true));rows.addEventListener('lostpointercapture',()=>finish());
  rows.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}const target=event.target.closest('[data-timing-handle],[data-segment]');if(!target)return;const segment=selected(target.dataset.timingHandle??target.dataset.segment);
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();context(segment,target);return;}
    if(!valid||segment.disabled||segment.track.disabled)return;
    if(event.key==='Enter'){event.preventDefault();edit(segment);return;}
    if(!target.matches('[data-timing-handle]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?20:1;change(segment.key,event.key==='Home'?segment.minimum:event.key==='End'?segment.maximum:segment.value+(['ArrowLeft','ArrowDown'].includes(event.key)?-step:step),true);
  });
  update();return {update,tick,cancel:()=>{finish(true);closeEditor();menu.hidePopover();sceneTrack.close();},element:root};
}
const api={layout,changes,limits,withPause,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageTimeline=api;
})();
