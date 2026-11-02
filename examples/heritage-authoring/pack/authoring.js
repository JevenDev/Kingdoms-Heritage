(() => {
'use strict';
function create(config){
  const $=id=>document.getElementById(id),E=HeritageEditing,histories=new Map(),selected=new Set(),checkpointKey='heritage.packCheckpoints.v1';
  let selecting=false,busy=false,dragged='',bulkKind='kits';
  const current=()=>{const value=config.read();if(!histories.has(value.id))histories.set(value.id,new E.History(value.pack,value.libraries));return {value,history:histories.get(value.id)};};
  const report=message=>{$('project-status').textContent=message;};
  function refresh(){
    let history;try{({history}=current());}catch(error){for(const id of ['pack-undo','pack-redo','pack-checkpoints','select-locations'])$(id).disabled=true;report('Pack tools are unavailable: '+error.message);return;}$('pack-undo').disabled=busy||!history.canUndo;$('pack-redo').disabled=busy||!history.canRedo;
    $('pack-undo').dataset.tooltip=JSON.stringify(['Undo pack edit',history.canUndo?'Ctrl+Z. Undo '+history.actions[history.index-1].label.toLowerCase()+'.':'No pack edits to undo.']);$('pack-redo').dataset.tooltip=JSON.stringify(['Redo pack edit',history.canRedo?'Ctrl+Y. Redo '+history.actions[history.index].label.toLowerCase()+'.':'No pack edits to redo.']);
    const ids=new Set(config.read().pack.locations.map(entry=>entry.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
    $('select-locations').textContent=selecting?'Done':'Select';$('select-locations').setAttribute('aria-pressed',String(selecting));
    $('location-selection-controls').hidden=!selecting;$('location-selection-status').hidden=!selecting;$('location-selection-status').textContent=selected.size+' selected';$('bulk-location-actions').hidden=selected.size<2;
  }
  function capture(options){try{const {value,history}=current();history.record(value.pack,value.libraries,options);refresh();}catch(error){report('Pack history could not record this change: '+error.message);}}
  async function restore(direction){
    if(busy)return;busy=true;refresh();
    try{
      if(!config.prepare())return;
      const {value,history}=current(),next=history.plan(direction,value.pack,value.libraries);if(!next)return;
      await config.write(next,value);history.accept(direction,next);selected.clear();config.render();report(direction<0?'Pack change undone.':'Pack change redone.');
    }catch(error){report('Could not restore pack change: '+error.message);}finally{busy=false;refresh();}
  }
  $('pack-undo').addEventListener('click',()=>restore(-1));$('pack-redo').addEventListener('click',()=>restore(1));
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest('input,textarea,[contenteditable=true],dialog'))return;
    if(event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?1:-1);}
    if(event.key.toLowerCase()==='y'){event.preventDefault();restore(1);}
  });
  const loadCheckpoints=()=>{
    const raw=JSON.parse(localStorage.getItem(checkpointKey)??'{"version":1,"packs":{}}');
    if(raw.version!==1||!raw.packs||typeof raw.packs!=='object'||Array.isArray(raw.packs))throw new Error('Saved checkpoints are invalid.');
    return raw;
  };
  function checkpointRows(){
    const data=loadCheckpoints(),entries=data.packs[config.read().id]??[];if(!Array.isArray(entries))throw new Error('Saved checkpoints are invalid.');
    const list=$('checkpoint-list');list.replaceChildren();
    for(const entry of entries){
      const row=document.createElement('li'),detail=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('span');name.textContent=entry.name;time.className='hint';time.textContent=new Date(entry.created).toLocaleString();detail.append(name,time);row.append(detail);
      for(const [action,label] of [['restore','Restore'],['delete','Delete']]){const button=document.createElement('button');button.type='button';button.dataset.checkpointAction=action;button.dataset.checkpointId=entry.id;button.textContent=label;button.setAttribute('aria-label',label+' '+entry.name);row.append(button);}list.append(row);
    }
    $('checkpoint-empty').hidden=entries.length>0;
  }
  $('pack-checkpoints').addEventListener('click',()=>{try{checkpointRows();$('checkpoint-status').textContent='';$('checkpoint-dialog').showModal();}catch(error){report('Could not open checkpoints: '+error.message);}});
  $('checkpoint-form').addEventListener('submit',event=>{
    event.preventDefault();if(!config.flush())return;
    try{
      const value=config.read(),data=loadCheckpoints(),entries=data.packs[value.id]??=[];if(entries.length>=10)throw new Error('Keep up to 10 checkpoints per pack. Delete one before adding another.');
      entries.unshift(E.checkpoint(value.pack,value.libraries,$('checkpoint-name').value,crypto.randomUUID()));
      HeritageProject.write(localStorage,{[checkpointKey]:data});$('checkpoint-name').value='';checkpointRows();$('checkpoint-status').textContent='Checkpoint saved in this browser.';
    }catch(error){$('checkpoint-status').textContent='Could not save checkpoint: '+error.message;}
  });
  $('checkpoint-list').addEventListener('click',async event=>{
    const button=event.target.closest('[data-checkpoint-action]');if(!button||busy)return;
    busy=true;refresh();
    try{
      const data=loadCheckpoints(),id=config.read().id,entries=data.packs[id]??[],saved=entries.find(entry=>entry.id===button.dataset.checkpointId);if(!saved)throw new Error('This checkpoint is unavailable.');
      if(button.dataset.checkpointAction==='delete'){data.packs[id]=entries.filter(entry=>entry.id!==saved.id);HeritageProject.write(localStorage,{[checkpointKey]:data});checkpointRows();return;}
      if(!config.prepare())return;
      const {value,history}=current(),next=E.restoreCheckpoint(saved,value.pack,value.libraries);HeritageProject.validatePack(next.pack);
      await config.write(next,value);history.record(next.pack,next.libraries,{drafts:next.drafts,label:'Restore '+saved.name});selected.clear();config.render();$('checkpoint-dialog').close();report('Restored '+saved.name+'. You can undo this pack change.');
    }catch(error){$('checkpoint-status').textContent='Could not restore checkpoint: '+error.message;}finally{busy=false;refresh();}
  });
  $('select-locations').addEventListener('click',()=>{selecting=!selecting;if(!selecting)selected.clear();config.locations();refresh();});
  $('clear-location-selection').addEventListener('click',()=>{selected.clear();config.locations();refresh();});
  $('select-all-locations').addEventListener('click',()=>{for(const entry of config.read().pack.locations)selected.add(entry.id);config.locations();refresh();});
  function decorate(row,entry){
    row.dataset.locationRow=entry.id;row.draggable=true;row.classList.toggle('selecting',selecting);
    if(selecting){const field=document.createElement('input');field.type='checkbox';field.checked=selected.has(entry.id);field.dataset.selectLocation=entry.id;field.setAttribute('aria-label','Select '+(entry.fields.title||'Untitled location'));row.prepend(field);}
    row.querySelector('img').draggable=false;
  }
  $('locations').addEventListener('change',event=>{const id=event.target.dataset.selectLocation;if(!id)return;if(event.target.checked)selected.add(id);else selected.delete(id);refresh();});
  $('locations').addEventListener('dragstart',event=>{
    if(event.target.closest('input')){event.preventDefault();return;}
    const row=event.target.closest('[data-location-row]');if(!row)return;dragged=row.dataset.locationRow;event.dataTransfer.setData('text/x-heritage-location',dragged);event.dataTransfer.effectAllowed='move';row.classList.add('dragging');
  });
  $('locations').addEventListener('dragover',event=>{if(!dragged)return;const row=event.target.closest('[data-location-row]');if(!row)return;event.preventDefault();event.dataTransfer.dropEffect='move';for(const node of $('locations').children)node.classList.remove('drop-before','drop-after');const rect=row.getBoundingClientRect();row.classList.add(event.clientY<rect.top+rect.height/2?'drop-before':'drop-after');});
  const clearDrag=()=>{dragged='';for(const row of $('locations').children)row.classList.remove('dragging','drop-before','drop-after');};
  $('locations').addEventListener('dragend',clearDrag);
  $('locations').addEventListener('drop',event=>{
    if(!dragged)return;event.preventDefault();const row=event.target.closest('[data-location-row]'),ids=config.ordered(),from=dragged;
    if(row&&row.dataset.locationRow!==from){const after=row.classList.contains('drop-after'),rest=ids.filter(id=>id!==from),index=rest.indexOf(row.dataset.locationRow);rest.splice(index+Number(after),0,from);config.reorder(rest);}clearDrag();
  });
  $('locations').addEventListener('keydown',event=>{
    const button=event.target.closest('[data-open-location]');if(!button||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const ids=config.ordered(),index=ids.indexOf(button.dataset.openLocation),next=index+(event.key==='ArrowUp'?-1:1);if(next<0||next>=ids.length)return;
    [ids[index],ids[next]]=[ids[next],ids[index]];config.reorder(ids);$('locations').querySelector('[data-open-location="'+CSS.escape(button.dataset.openLocation)+'"]').focus();
  });
  function openBulk(kind){
    bulkKind=kind;$('bulk-kits').hidden=kind!=='kits';$('bulk-intro-field').hidden=kind!=='intro';$('bulk-heading').textContent=(kind==='kits'?'Assign kits':'Assign intro')+' to '+selected.size+' locations';$('bulk-status').textContent='';
    $('bulk-help').textContent=kind==='kits'?'Replaces kit choices for the selected locations.':'Changes the default intro. Pool destination overrides are kept.';
    if(kind==='kits'){
      const list=$('bulk-kits');list.replaceChildren();for(const kit of config.kits()){
        const label=document.createElement('label'),field=document.createElement('input');label.className='check';field.type='checkbox';field.value=kit.id;field.checked=config.read().pack.locations.filter(entry=>selected.has(entry.id)).every(entry=>config.kitIds(entry).includes(kit.id));label.append(field,document.createTextNode(kit.name));list.append(label);
      }
    }else{
      const select=$('bulk-intro');select.replaceChildren(new Option('Choose an intro…',':choose'),new Option('No intro',''),...config.intros().map(entry=>new Option(entry.name,entry.id)));select.options[0].disabled=true;select.value=':choose';
    }
    bulkReady();$('bulk-dialog').showModal();
  }
  function bulkReady(){$('apply-bulk').disabled=bulkKind==='kits'?!$('bulk-kits').querySelector('input:checked'):$('bulk-intro').value===':choose';}
  $('bulk-assign-kits').addEventListener('click',()=>openBulk('kits'));$('bulk-assign-intro').addEventListener('click',()=>openBulk('intro'));
  $('bulk-form').addEventListener('change',bulkReady);
  $('bulk-form').addEventListener('submit',event=>{event.preventDefault();try{const changes=bulkKind==='kits'?{kitIds:[...$('bulk-kits').querySelectorAll('input:checked')].map(field=>field.value)}:{intro:$('bulk-intro').value};if(config.bulk([...selected],changes))$('bulk-dialog').close();}catch(error){$('bulk-status').textContent=error.message;}});
  async function localCopy(){
    const context=config.shared();if(!context||busy)return;busy=true;refresh();
    try{
      if(!config.prepare())return;
      const {value,history}=current(),id=crypto.randomUUID(),next=E.privateCopy(value.pack,value.libraries,context.kind,context.id,context.locationId,id);
      await config.write(next,value);history.record(next.pack,next.libraries,{drafts:[{kind:context.kind==='kit'?'kits':'intros',id}],label:'Make a local '+context.kind+' copy'});config.render();config.open(context.kind,id);
    }catch(error){report('Could not make a local copy: '+error.message);}finally{busy=false;refresh();}
  }
  $('make-local-copy').addEventListener('click',localCopy);
  for(const button of document.querySelectorAll('[data-close-dialog]'))button.addEventListener('click',()=>button.closest('dialog').close());
  refresh();
  return {capture,refresh,decorate,observe:()=>{try{const {value,history}=current();history.observe(value.libraries);}catch(error){report('Pack history could not read the libraries: '+error.message);}},get selecting(){return selecting;}};
}
globalThis.HeritagePackAuthoring={create};
})();
