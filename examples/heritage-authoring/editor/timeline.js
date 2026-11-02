(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePreview;
const seconds=ticks=>(ticks/20).toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+' s';
const limits=key=>({minimum:key==='black_hold_ticks'||key.endsWith('start_ticks')||key.endsWith('hold_ticks')&&key.startsWith('timeline.')?0:1,maximum:key==='timeline.bar_hold_ticks'?3600:1200});
function changes(config,key,value){
  const timing=P.trackTiming(config),reveal=config.animation==='immediate'?0:config.reveal_ticks,result={};
  if(!config.timeline){
    const enter=Math.floor(timing.bar_enter_ticks),exit=Math.floor(timing.bar_exit_ticks);
    result.hold_ticks=P.textDuration(config)-reveal-config.fade_out_ticks;
    result.timeline={...timing,bar_enter_ticks:enter,bar_hold_ticks:P.presentation(config)-enter-exit,bar_exit_ticks:exit};
  }
  if(key.startsWith('timeline.'))result.timeline={...(result.timeline??timing),[key.split('.')[1]]:value};else result[key]=value;
  return result;
}
function layout(config){
  const timing=P.trackTiming(config),textStart=P.textStart(config),textEnd=textStart+P.textDuration(config),reveal=config.animation==='immediate'?0:config.reveal_ticks,barStart=timing.bar_start_ticks,barEnter=barStart+timing.bar_enter_ticks,barExit=barEnter+timing.bar_hold_ticks,total=P.duration(config);
  const segment=(id,label,from,to,key,disabled=false)=>({id,label,from,to,key,disabled,value:to-from,...limits(key)});
  return {total,start:config.black_hold_ticks,extended:!config.timeline&&config.fade_from_black_ticks>reveal+config.hold_ticks+config.fade_out_ticks,tracks:[
    {id:'world',label:'World',startKey:'black_hold_ticks',segments:[segment('black','Black',0,config.black_hold_ticks,'black_hold_ticks'),segment('world','Fade in',config.black_hold_ticks,config.black_hold_ticks+config.fade_from_black_ticks,'fade_from_black_ticks')]},
    {id:'text',label:'Text',startKey:'timeline.text_start_ticks',segments:[segment('reveal',config.animation==='immediate'?'Immediate':'Reveal',textStart,textStart+reveal,'reveal_ticks',config.animation==='immediate'),segment('hold','Hold',textStart+reveal,textEnd-config.fade_out_ticks,'hold_ticks'),segment('text-fade','Fade out',textEnd-config.fade_out_ticks,textEnd,'fade_out_ticks')]},
    {id:'bars',label:'Bars',startKey:'timeline.bar_start_ticks',disabled:!config.cinematic_bars,segments:[segment('bar-in','Enter',barStart,barEnter,'timeline.bar_enter_ticks'),segment('bar-hold','Hold',barEnter,barExit,'timeline.bar_hold_ticks'),segment('bar-out','Exit',barExit,barExit+timing.bar_exit_ticks,'timeline.bar_exit_ticks')]}
  ]};
}
function create(host,config){
  const node=(tag,className,text='')=>{const value=document.createElement(tag);if(className)value.className=className;value.textContent=text;return value;};
  const root=node('section','intro-track-editor');root.setAttribute('aria-label','Intro timing tracks');
  const heading=node('div','timeline-heading'),title=node('h3','','Timeline'),duration=node('output');
  const zoomLabel=node('label','timeline-zoom','Zoom'),zoomSelect=node('select');zoomSelect.setAttribute('aria-label','Timeline zoom');
  for(const value of [1,2,4,8]){const option=node('option','',value===1?'Fit':value+'×');option.value=value;zoomSelect.append(option);}zoomLabel.append(zoomSelect);heading.append(title,duration,zoomLabel);
  const ruler=node('div','timeline-ruler');ruler.setAttribute('aria-hidden','true');
  const rows=node('div','timeline-rows'),viewport=node('div','timeline-scroll'),content=node('div','timeline-content');content.append(ruler,rows);viewport.append(content);
  const status=node('p','hint timeline-status');status.setAttribute('role','status');root.append(heading,viewport,status);host.append(root);
  const menu=node('div','timeline-context-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');
  const editor=node('form','timeline-value-editor');editor.setAttribute('popover','auto');editor.setAttribute('aria-label','Edit timeline timing');
  const editorHeading=node('strong'),valueLabel=node('label','stack'),valueInput=node('input'),unitLabel=node('label','stack','Unit'),unit=node('select'),error=node('p','field-error'),actions=node('div','field-actions'),apply=node('button','','Apply'),cancel=node('button','quiet','Cancel');
  valueInput.type='number';valueInput.required=true;unit.setAttribute('aria-label','Timing unit');for(const [value,label] of [['seconds','Seconds'],['ticks','Ticks']]){const option=node('option','',label);option.value=value;unit.append(option);}valueLabel.append(node('span','','Duration'),valueInput);unitLabel.append(unit);error.hidden=true;error.setAttribute('role','status');apply.type='submit';cancel.type='button';actions.append(cancel,apply);const editorFields=node('div','timeline-value-fields');editorFields.append(valueLabel,unitLabel);editor.append(editorHeading,editorFields,error,actions);root.append(menu,editor);
  const controls=new Map(),lanes=[];let drag=null,model,zoom=1,valid=true,editing=null,contextSegment=null;
  const selected=id=>model.tracks.flatMap(track=>track.segments.map(segment=>({...segment,track}))).find(segment=>segment.id===id);
  const valueOf=key=>key.startsWith('timeline.')?P.trackTiming(config.get())[key.split('.')[1]]:config.get()[key];
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
  valueInput.addEventListener('input',()=>{if(!editing)return;const value=inputValue();if(value===null)return;editing.value=value;editing.changed=true;config.change(changes(config.get(),editing.key,value),false,editing.key);});
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
    action('Reset duration',()=>{const defaults=layout(P.defaults).tracks.flatMap(track=>track.segments).find(item=>item.id===segment.id);config.change(changes(config.get(),segment.key,defaults.value),true,segment.key);},!valid||segment.disabled||segment.track.disabled);
    if(segment.track.id==='bars')action(config.get().cinematic_bars?'Disable bars':'Enable bars',()=>config.change({cinematic_bars:!config.get().cinematic_bars},true,'cinematic_bars'),!valid);
    position(menu,anchor);menu.querySelector('button:not(:disabled)')?.focus();
  }
  menu.addEventListener('keydown',event=>{const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}if(event.key==='Escape'){event.preventDefault();menu.hidePopover();controls.get(contextSegment)?.block.focus();}});
  for(const track of layout(config.get()).tracks){
    const row=node('div','timeline-row'),label=node('span','',track.label),lane=node('div','timeline-lane'),cursor=node('div','timeline-cursor');row.dataset.track=track.id;cursor.setAttribute('aria-hidden','true');
    for(const segment of track.segments){
      const block=node('div','timeline-segment'),text=node('span'),handle=node('button','timeline-handle');block.dataset.segment=segment.id;block.setAttribute('role','button');block.append(text);handle.type='button';handle.dataset.timingHandle=segment.id;handle.setAttribute('role','slider');handle.setAttribute('aria-label',track.label+' '+segment.label.toLowerCase()+' duration');lane.append(block,handle);controls.set(segment.id,{block,text,handle});
      block.addEventListener('dblclick',event=>{event.preventDefault();const current=selected(segment.id);if(valid&&!current.disabled&&!current.track.disabled)edit(current);});
    }
    const off=node('span','timeline-off','Cinematic bars off');off.hidden=true;lane.append(off,cursor);row.append(label,lane);rows.append(row);lanes.push({row,lane,cursor,off});
    row.addEventListener('contextmenu',event=>{event.preventDefault();const id=event.target.closest('[data-segment],[data-timing-handle]')?.dataset,current=selected(id?.segment??id?.timingHandle??track.segments[0].id);context(current,event);});
  }
  function fitLabels(){for(const {block,text,labels} of controls.values())if(labels&&!block.hidden){text.textContent=labels[0];for(const label of labels.slice(1))if(text.scrollWidth>text.clientWidth)text.textContent=label;}}
  function scale(){
    content.style.width='calc('+zoom*100+'% - '+(zoom-1)*64+'px)';ruler.replaceChildren(...Array.from({length:zoom*4+1},(_,index)=>{const position=index/(zoom*4),label=node('span','',seconds(Math.round(model.total*position)));label.style.left=position*100+'%';return label;}));fitLabels();
  }
  zoomSelect.addEventListener('change',()=>{finish(true);closeEditor();const width=viewport.clientWidth-64,center=(viewport.scrollLeft+width/2)/(width*zoom);zoom=Number(zoomSelect.value);scale();viewport.scrollLeft=center*width*zoom-width/2;});new ResizeObserver(fitLabels).observe(content);
  function update(time=0,isValid=true){
    valid=isValid;model=layout(config.get());duration.textContent=seconds(model.total)+' · '+model.total+' ticks';
    for(const [index,track] of model.tracks.entries()){
      lanes[index].lane.classList.toggle('disabled-track',!!track.disabled);lanes[index].off.hidden=!track.disabled;
      for(const segment of track.segments){
        const control=controls.get(segment.id),{block,text,handle}=control;block.hidden=!!track.disabled||segment.to===segment.from;control.labels=[segment.label+' '+seconds(segment.value),segment.label,seconds(segment.value),''];block.style.left=segment.from/model.total*100+'%';block.style.width=Math.max(0,segment.value/model.total*100)+'%';text.textContent=control.labels[0];block.setAttribute('aria-label',track.label+' '+segment.label+', '+seconds(segment.value)+'. Double-click or press Enter to edit.');block.tabIndex=valid&&!segment.disabled?0:-1;block.setAttribute('aria-disabled',String(!valid||segment.disabled));
        handle.hidden=!!track.disabled||segment.disabled||segment.value===0;handle.style.left='clamp(8px,'+segment.to/model.total*100+'%,calc(100% - 8px))';handle.disabled=!valid||segment.disabled;handle.dataset.key=segment.key;handle.dataset.value=segment.value;handle.dataset.maximum=segment.maximum;handle.setAttribute('aria-valuemin',segment.minimum);handle.setAttribute('aria-valuemax',segment.maximum);handle.setAttribute('aria-valuenow',Math.min(segment.maximum,segment.value));handle.setAttribute('aria-valuetext',seconds(segment.value)+' ('+segment.value+' ticks)');
      }
    }
    status.textContent='Double-click a segment to edit. Drag edges to resize or segments to move. Right-click for actions.';scale();tick(time);
  }
  function tick(time){for(const {cursor} of lanes)cursor.style.left=P.clamp(time/model.total)*100+'%';}
  function change(key,value,commit){const {minimum,maximum}=limits(key);config.change(changes(config.get(),key,Math.round(P.clamp(value,minimum,maximum))),commit,key);}
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
  update();return {update,tick,cancel:()=>{finish(true);closeEditor();menu.hidePopover();},element:root};
}
const api={layout,changes,limits,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageTimeline=api;
})();
