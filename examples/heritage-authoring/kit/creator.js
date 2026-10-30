(() => {
'use strict';
const K=HeritageKit,E=HeritageEquipment,M=HeritageKitMouse,V=HeritageInventory,T=HeritageItemText,$=id=>document.getElementById(id),storageKey='heritage.kitCreator.v1';
const searchIndex=HeritageItems.items.map(item=>({item,search:(item.name+' '+item.id).toLowerCase()})),itemButtons=new Map();
let documentState=K.copy(HeritageKitExamples[0].kit),selected=0,page=0,rawInvalid=false,errorState=null,drafts=new Map(),loreSources=new Map(),slotClipboard=null;
let kitWarnings=[],activeItemButton,carried=null,pendingDelete=null,selectedSlots=new Set(),selectionMode=false,selectionAnchor=null;
let pageSize=90,pageCount=1,wheelPageTime=-Infinity;
let history=[],historyIndex=-1,historyGroup=null,historyTime=0,saveTimer,saveUnavailable=false,saveBlocked=false,workspace;
const view=new V.Inventory($('inventory'),{
  editable:true,
  onSelect:(slot,event)=>{if(event&&!event.altKey&&selectedSlots.size)deselectSlots();selectSlot(slot);},
  onClick:(slot,event)=>clickSlot(slot,event),
  onCollect:slot=>collectSlot(slot),
  onClone:slot=>cloneSlot(slot),
  getCursor:()=>carried?.entry.item,
  isSelecting:event=>!carried&&(selectionMode||!!(event.ctrlKey||event.metaKey)),
  getSelection:()=>selectedSlots,
  onToggleSelection:(slot,event)=>toggleSelection(slot,event),
  onMove:(from,to,gesture)=>moveSlots(from,to,gesture),
  onMovePreview:(from,gesture)=>previewMove(from,gesture),
  onMovePreviewEnd:()=>feedback(),
  onDrop:(id,slot)=>place(id,slot),
  onControl:control=>preview.control(control)
});
const preview=new HeritageEquipmentEditor({getDocument:()=>documentState,getSelection:()=>selected,onSelect:selectSlot,onUpdate:(saveHistory=false)=>{display();if(saveHistory)record();else scheduleSave();},notice,canSwitch:()=>{if(errorState?.target==='count'){notice('Fix the count before changing inventory views.');return false;}return true;}});
const fingerprint=stack=>JSON.stringify(stack?[K.normalize(stack.id),stack.components??{}]:null);
const source=()=>$('kit-json').value,code=new HeritageJsonEditor($('kit-json'),$('line-count'));
const snapshot=()=>({source:source(),document:K.copy(documentState),cursor:K.copy(carried),selected,selection:[...selectedSlots],selectionMode,drafts:K.copy([...drafts]),loreSources:K.copy([...loreSources]),error:errorState?K.copy(errorState):null,preview:preview.snapshot()});
function saveDraft() {
  clearTimeout(saveTimer);
  if(saveBlocked)return;
  try{workspace.update(snapshot());localStorage.setItem(storageKey,JSON.stringify(workspace.serialize()));$('draft-status').textContent='Draft saved';saveUnavailable=false;}
  catch(failure){saveUnavailable=true;$('draft-status').textContent='Draft could not be saved. Download a copy.';}
}
function scheduleSave() {
  clearTimeout(saveTimer);
  if(!saveUnavailable)$('draft-status').textContent='Saving draft…';
  saveTimer=setTimeout(saveDraft,350);
}
function record(key=null) {
  const next=snapshot(),previous=history[historyIndex],signature=state=>JSON.stringify([state.source,state.cursor,state.drafts,state.loreSources,state.error,state.preview?.profiles]);
  if(previous&&signature(previous)===signature(next)){feedback();return;}
  history.splice(historyIndex+1);
  const now=performance.now();
  if(key&&historyGroup===key&&now-historyTime<700&&historyIndex>0)history[historyIndex]=next;
  else{history.push(next);historyIndex++;}
  if(history.length>200){history.shift();historyIndex--;}
  historyGroup=key;historyTime=now;scheduleSave();feedback();
}
function restore(direction) {
  const next=historyIndex+direction;if(next<0||next>=history.length)return;
  historyIndex=next;const state=history[next];documentState=K.copy(state.document);carried=M.cursor(state.cursor);kitWarnings=K.read(JSON.stringify(documentState)).warnings;selected=state.selected;drafts=new Map(K.copy(state.drafts));loreSources=readLoreSources(state.loreSources);errorState=state.error;rawInvalid=false;preview.restore(state.preview);
  selectedSlots=new Set((state.selection??[]).filter(E.valid));selectionMode=state.selectionMode===true;selectionAnchor=null;
  $('kit-json').value=state.source;
  try{K.read(state.source);}catch(failure){rawInvalid=true;}
  historyGroup=null;display();if(errorState?.target&&$(errorState.target))$(errorState.target).value=errorState.value;
  scheduleSave();feedback();V.hideTooltip();
}
function draftOptions() {
  if(!workspace)return;
  const field=$('kit-drafts'),ids=[...workspace.entries.keys()];
  if(field.options.length!==ids.length||ids.some((id,index)=>field.options[index]?.value!==id)){
    field.replaceChildren(...ids.map(id=>{const option=document.createElement('option');option.value=id;return option;}));
  }
  const names=new Map();
  for(const option of field.options){
    const kit=option.value===workspace.active?documentState:workspace.entries.get(option.value).state.document;
    const name=typeof kit.title==='string'?kit.title:kit.title_key||'Untitled kit',count=(names.get(name)||0)+1;names.set(name,count);
    option.textContent=name+(count>1?' ('+count+')':'');
  }
  field.value=workspace.active;
}
function activateKit(id) {
  if(id===workspace.active)return;
  attempt(()=>{
    const entry=workspace.get(id);K.read(JSON.stringify(entry.state.document));M.cursor(entry.state.cursor);
    workspace.capture(snapshot(),history,historyIndex);workspace.select(id);
    history=entry.history;historyIndex=entry.historyIndex;history[historyIndex]=entry.state;
    restore(0);notice('');saveDraft();draftOptions();
  });
}
function openKit(raw=JSON.stringify({title:'My kit',items:[]},null,2)) {
  let kit={title:'My kit',items:[]},error=null;
  try{kit=K.read(raw).document;}catch(failure){error={message:failure.message,target:'kit-json',value:raw};}
  const first=(Array.isArray(kit.items)?kit.items:[]).find(entry=>['curios','accessories'].includes(entry.inventory));
  const state={source:raw,document:kit,cursor:null,selected:first?E.id(first):0,selection:[],selectionMode:false,drafts:[],loreSources:[],error,preview:null};
  activateKit(workspace.add(state));
}
function notice(message){$('status').textContent=message;}
function fail(message,target='') {
  if(!target){notice(message);return;}
  errorState={message,target,value:$(target)?.value??'',...(['count','item-id','components'].includes(target)?{slot:selected}:{})};feedback();record('invalid:'+target);
}
function attempt(action,target='') {
  try{return action();}catch(failure){fail(failure.message,target);return false;}
}
function canEdit(target='') {
  if(rawInvalid){notice('Fix the JSON or restore the last valid version.');return false;}
  if(documentState.enabled===false){notice('This kit is disabled. Set enabled to true in JSON to edit it.');return false;}
  if(errorState&&errorState.target!==target){notice('Fix the highlighted field or restore the last valid JSON.');return false;}
  return true;
}
function heldLabel(stack) {return stack?'Holding '+(stack.count??1)+' × '+T.name(stack):'';}
function feedback() {
  const pending=drafts.size,blocked=rawInvalid||!!errorState||pending>0||!!carried;
  $('copy').disabled=$('download').disabled=blocked;
  $('format').disabled=rawInvalid||!!errorState;
  $('kit-json').readOnly=!!carried;
  $('carried-stack').hidden=!carried;
  $('return-carried').textContent=carried?.source==='library'?'Cancel pickup':'Return';
  $('carried-label').textContent=heldLabel(carried?.entry.item);
  V.setCursor(carried?.entry.item);
  $('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;
  $('error').hidden=!errorState;$('error').textContent=errorState?.message||'';
  $('restore').hidden=!rawInvalid&&!errorState;
  $('kit-json').setAttribute('aria-invalid',String(rawInvalid));
  for(const id of ['count','title','order','tags','description','item-id','components'])$(id).setAttribute('aria-invalid',String(errorState?.target===id));
  $('json-state').textContent=rawInvalid?'Fix JSON to update the preview.':errorState?'Fix the field error':pending?'Apply slot edits':carried?'Place or return the held item before exporting':'JSON ready';
  code.sync();
  $('pending-edits').hidden=!pending;
  $('pending-message').textContent=pending?pending+' slot'+(pending===1?' has':'s have')+' edits to apply. ':'';
  const locked=rawInvalid||documentState.enabled===false;
  for(const id of ['title','description','order','tags','selected-slot','add-equipment','item-id','apply-id','components','apply-components','count','fill-stack','clear-slot','set-start','paste-slot'])$(id).disabled=locked;
  $('count').disabled=locked||!view.entry(selected);
  $('fill-stack').disabled=locked||!view.entry(selected)||(view.entry(selected).item.count??1)>=K.maxCount(view.entry(selected).item)||(!K.items.has(K.normalize(view.entry(selected).item.id))&&view.entry(selected).item.components?.['minecraft:max_stack_size']===undefined);
  $('set-start').disabled=locked||typeof selected!=='number'||selected>8;
  $('copy-slot').disabled=!view.entry(selected);
  $('paste-slot').disabled=locked||!slotClipboard;
  $('clear-slot').disabled=locked||(!view.entry(selected)&&!drafts.has(selected));
  $('apply-components').disabled=locked||!view.entry(selected);
  const lore=view.entry(selected)?.item.components?.['minecraft:lore'],invalidLore=lore!==undefined&&!Array.isArray(lore);
  const loreLocked=locked||!view.entry(selected)||!!errorState||!!carried||drafts.has(selected)||invalidLore;
  $('add-lore-line').disabled=loreLocked;
  for(const control of $('lore-lines').querySelectorAll('input,textarea,select,button'))control.disabled=loreLocked;
  $('lore-status').textContent=invalidLore?'Lore must be a list. Fix it in Item components.':drafts.has(selected)?"Apply or revert this item's pending edits to edit lore.":!view.entry(selected)?'Choose an item to add lore.':'';
  $('select-slots').disabled=locked||!!carried;
  $('select-slots').setAttribute('aria-pressed',String(selectionMode));
  $('selection-count').textContent=selectedSlots.size?selectedSlots.size+' selected':selectionMode?'Click slots to select':'';
  $('select-all-slots').disabled=locked||!!carried||!(documentState.items?.length||drafts.size);
  $('delete-selected').disabled=locked||![...selectedSlots].some(slot=>E.entryAt(documentState,slot)||drafts.has(slot));
  $('deselect-slots').disabled=!selectedSlots.size&&!selectionMode;
  $('delete-selected').hidden=$('deselect-slots').hidden=!selectedSlots.size&&!selectionMode;
  $('clear-inventory').disabled=locked||!(documentState.items?.length||drafts.size||carried);
  draftOptions();
}
function slotFields() {
  const stack=view.entry(selected)?.item,draft=drafts.get(selected);
  $('slot-name').textContent=E.name(selected);
  $('selected-name').textContent=stack?T.name(stack):'Empty slot';
  $('selected-icon').replaceChildren(...(stack?[V.icon(stack.id)]:[]));
  $('count').value=stack?.count??1;$('count').max=stack?K.maxCount(stack):99;
  $('item-id').value=draft?.id??stack?.id??'';
  $('components').value=draft?.components??JSON.stringify(stack?.components||{},null,2);
  $('component-state').textContent=draft?'Not applied':'';
  $('revert-slot').hidden=!draft;
  const starting=typeof selected==='number'&&selected===(documentState.selected_slot??0);
  $('set-start').setAttribute('aria-pressed',String(starting));$('set-start').textContent=starting?'Starting slot':'Start here';
  loreFields(stack);markSelectedItem();feedback();
}
function loreFields(stack) {
  const lines=stack?.components?.['minecraft:lore'],values=Array.isArray(lines)?lines:[],container=$('lore-lines'),previous=loreSources.get(selected)??[];
  const sources=values.map((line,index)=>previous[index]?.value===JSON.stringify(line)&&typeof previous[index].text==='string'?previous[index]:{value:JSON.stringify(line),text:T.loreMarkup(line)});
  if(stack)loreSources.set(selected,sources);else loreSources.delete(selected);
  while(container.children.length>values.length)container.lastElementChild.remove();
  for(let index=0;index<values.length;index++){
    let row=container.children[index];
    if(!row){
      row=document.createElement('div');row.className='lore-line';
      const input=document.createElement('textarea'),remove=document.createElement('button');
      input.rows=2;input.dataset.loreLine=index;input.setAttribute('aria-label','Lore line '+(index+1));input.setAttribute('aria-describedby','lore-hint');input.spellcheck=false;
      remove.type='button';remove.dataset.removeLore=index;remove.textContent='Remove';remove.setAttribute('aria-label','Remove lore line '+(index+1));
      const toolbar=document.createElement('div'),preset=document.createElement('select'),tint=document.createElement('input'),apply=document.createElement('button');
      toolbar.className='lore-format';toolbar.role='group';toolbar.setAttribute('aria-label','Lore line '+(index+1)+' formatting');
      preset.dataset.loreColor=index;preset.setAttribute('aria-label','Lore line '+(index+1)+' color preset');
      for(const [name,value] of Object.entries(T.colors)){
        const option=document.createElement('option');option.value=value;option.textContent=name.replaceAll('_',' ');preset.append(option);
      }
      const custom=document.createElement('option');custom.value='custom';custom.textContent='Custom color';custom.disabled=true;preset.append(custom);preset.value='#ffaa00';
      tint.type='color';tint.value='#ffaa00';tint.dataset.loreTint=index;tint.setAttribute('aria-label','Lore line '+(index+1)+' custom color');
      apply.type='button';apply.textContent='Apply color';apply.dataset.loreApplyColor=index;apply.setAttribute('aria-label','Lore line '+(index+1)+' apply color');
      toolbar.append(preset,tint,apply);
      for(const [key,label] of Object.entries({bold:'Bold',italic:'Italic',underline:'Underline',strike:'Strike',obfuscated:'Obfuscated'})){
        const button=document.createElement('button');button.type='button';button.dataset.loreFormat=key;button.dataset.loreIndex=index;button.textContent=label;
        button.setAttribute('aria-label','Lore line '+(index+1)+' '+label.toLowerCase());toolbar.append(button);
      }
      row.append(input,remove,toolbar);container.append(row);
    }
    const input=row.querySelector('textarea');
    if(input.value!==sources[index].text)input.value=sources[index].text;
  }
}
function readLoreSources(value) {
  return new Map(Array.isArray(value)?value.filter(entry=>Array.isArray(entry)&&E.valid(entry[0])&&Array.isArray(entry[1])):[]);
}
function setLoreMarkup(index,text,key=null) {
  return editLore(lines=>{
    const value=T.parseLoreMarkup(text,lines[index]),sources=loreSources.get(selected)??[];
    lines[index]=value;sources[index]={value:JSON.stringify(value),text};loreSources.set(selected,sources);
  },key);
}
function wrapLoreSelection(index,tag) {
  const input=$('lore-lines').children[index].querySelector('textarea'),wrapped=T.wrapLoreMarkup(input.value,input.selectionStart,input.selectionEnd,tag);
  if(setLoreMarkup(index,wrapped.text)){input.focus();input.setSelectionRange(wrapped.start,wrapped.end);}
}
function editLore(update,key=null) {
  return attempt(()=>{
    if(!canEdit()||carried)return false;
    const stack=view.entry(selected)?.item;if(!stack)return false;
    checkDraft(selected);
    const next=K.copy(stack);next.components??={};
    const lines=next.components['minecraft:lore']??[];
    if(!Array.isArray(lines))throw new Error('Lore must be a list. Fix it in Item components.');
    update(lines);
    if(lines.length)next.components['minecraft:lore']=lines;else delete next.components['minecraft:lore'];
    if(!Object.keys(next.components).length)delete next.components;
    return commit(E.setSlot(documentState,selected,next),key);
  });
}
function display() {
  preview.reveal(selected);view.selected=selected;view.set(documentState,preview.sync());
  $('title').value=documentState.title??'';$('description').value=documentState.description??'';
  $('order').value=documentState.order??0;$('selected-slot').value=documentState.selected_slot??0;
  $('tags').value=Array.isArray(documentState.tags)?documentState.tags.join(', '):'';
  const stacks=documentState.enabled===false?0:documentState.items?.length??0;
  $('stack-count').textContent=stacks+' stack'+(stacks===1?'':'s');
  $('warnings').textContent=documentState.enabled===false?'Kit disabled. Set enabled to true in JSON to enable it.':kitWarnings.join(' ');
  equipment();slotFields();
  if($('item-category').value==='used')browser();
}
function selectSlot(slot) {
  if(errorState?.target==='count'&&errorState.slot!==slot){view.select(selected);notice('Fix the count or restore valid JSON before switching slots.');return;}
  if(errorState?.slot!==undefined&&errorState.slot!==slot)errorState=null;
  selected=slot;preview.reveal(slot);view.selected=slot;view.set(documentState,preview.sync());slotFields();historyGroup=null;scheduleSave();
}
function syncSelection() {view.select(selected);feedback();scheduleSave();}
function deselectSlots() {selectedSlots.clear();selectionMode=false;selectionAnchor=null;syncSelection();}
function toggleSelection(slot,event={}) {
  if(!canEdit())return;
  if(carried){notice('Place or return the held stack before selecting slots.');return;}
  if(event.shiftKey&&selectionAnchor!==null){
    const slots=view.layout.slots.slice().sort((a,b)=>a.y-b.y||a.x-b.x).map(position=>position.id),from=slots.indexOf(selectionAnchor),to=slots.indexOf(slot);
    if(from>=0&&to>=0)for(const value of slots.slice(Math.min(from,to),Math.max(from,to)+1))selectedSlots.add(value);
    else selectedSlots.add(slot);
  }else if(selectedSlots.has(slot))selectedSlots.delete(slot);else selectedSlots.add(slot);
  selectionAnchor=slot;selectSlot(slot);syncSelection();
}
function selectAllSlots() {
  if(!canEdit()||carried)return;
  selectedSlots=new Set([...(documentState.items??[]).map(E.id),...drafts.keys()]);selectionMode=true;selectionAnchor=null;syncSelection();
}
function parse(replace=false,save=true) {
  if(carried){$('kit-json').value=JSON.stringify(documentState,null,2);notice('Place the held stack or press Escape before editing JSON.');return;}
  try {
    const parsed=K.read(source());documentState=parsed.document;kitWarnings=parsed.warnings;rawInvalid=false;errorState=null;
    if(replace){selectedSlots.clear();selectionMode=false;selectionAnchor=null;drafts.clear();const first=(Array.isArray(documentState.items)?documentState.items:[]).find(entry=>entry&&['curios','accessories'].includes(entry.inventory));selected=first?E.id(first):0;preview.state.mode=first?.inventory??'player';}display();
  }catch(failure){rawInvalid=true;errorState={message:failure.message,target:'kit-json',value:source()};feedback();}
  if(save)record('json');
}
function commit(next,key=null,{replace=false,selected:nextSlot=selected,discard=[],pendingDraft=null,cursor:nextCursor=carried,selection:nextSelection=selectedSlots}={}) {
  if(!replace&&!canEdit(key?.split(':')[0]||''))return false;
  if(replace&&carried){notice('Place the held stack or press Escape before replacing this kit.');return false;}
  try {
    const parsed=K.read(JSON.stringify(next));documentState=parsed.document;kitWarnings=parsed.warnings;rawInvalid=false;errorState=null;selected=nextSlot;carried=M.cursor(nextCursor);selectedSlots=new Set(nextSelection);
    if(replace){selectedSlots.clear();selectionMode=false;selectionAnchor=null;drafts.clear();const first=(Array.isArray(documentState.items)?documentState.items:[]).find(entry=>entry&&['curios','accessories'].includes(entry.inventory));selected=first?E.id(first):0;preview.state.mode=first?.inventory??'player';}else for(const slot of discard)drafts.delete(slot);
    if(pendingDraft)drafts.set(selected,pendingDraft);
    const field=$('kit-json'),scroll=field.scrollTop,start=field.selectionStart,end=field.selectionEnd;
    field.value=JSON.stringify(documentState,null,2);field.setSelectionRange(Math.min(start,field.value.length),Math.min(end,field.value.length));field.scrollTop=scroll;
    notice('');display();record(key);return true;
  }catch(failure){const target=key?.split(':')[0]||'';fail(failure.message,target);if(target==='equipment'){errorState.pending=K.copy(next);record('invalid:equipment');}return false;}
}
function checkDraft(slot) {if(drafts.has(slot))throw new Error('Apply or revert the pending edits in '+E.name(slot)+' first.');}
function applyMouse(state,slot=selected) {
  if(state.cursor&&(selectedSlots.size||selectionMode))deselectSlots();
  return commit(state.document,null,{selected:slot,cursor:state.cursor});
}
function clickSlot(slot,event={}) {
  attempt(()=>{
    if(!canEdit())return;checkDraft(slot);
    if(selectedSlots.size)deselectSlots();
    if(event.shiftKey&&!carried){applyMouse(M.quickMove(documentState,slot),slot);return;}
    applyMouse(M.click(documentState,carried,slot,event.button===1?1:0),slot);
  });
}
function previewMove(from,gesture) {
  return attempt(()=>{
    if(!canEdit())return;checkDraft(from);for(const slot of gesture.slots)checkDraft(slot);
    const state=gesture.slots.length?M.drag(documentState,carried,from,gesture.slots,gesture.button===2?1:0):carried?{document:documentState,cursor:carried}:M.click(documentState,null,from,gesture.button===2?1:0);
    if(carried)$('carried-label').textContent=heldLabel(state.cursor?.entry.item)||'Release to place the held stack';
    return state;
  });
}
function moveSlots(from,to,gesture={}) {
  attempt(()=>{
    if(!canEdit())return;checkDraft(from);
    const slots=gesture.slots?.length?gesture.slots:[to];for(const slot of slots)checkDraft(slot);
    applyMouse(M.drag(documentState,carried,from,slots,gesture.button===2?1:0),to);
  });
}
function collectSlot(slot) {
  attempt(()=>{
    if(!canEdit())return;
    if(drafts.size)throw new Error('Apply or revert the pending slot edits before collecting stacks.');
    const state=carried?{document:documentState,cursor:carried}:M.click(documentState,null,slot);
    applyMouse(M.collect(state.document,state.cursor),slot);
  });
}
function cloneSlot(slot) {
  attempt(()=>{if(!canEdit()||carried)return;checkDraft(slot);const entry=E.entryAt(documentState,slot);if(!entry)return;const next=K.copy(entry);next.item.count=K.maxCount(next.item);commit(documentState,null,{selected:slot,cursor:{entry:next,origin:slot,source:'library'}});});
}
function returnHeld() {
  attempt(()=>{
    if(!carried||!canEdit())return;
    if(drafts.size)throw new Error('Apply or revert the pending slot edits before returning the held stack.');
    const state=M.returnCursor(documentState,carried);applyMouse(state);
    if(state.cursor)notice('No room to return the remaining stack. Place it in a free slot.');
  });
}
function deletionSignature(held,slot){return JSON.stringify(held?carried:[E.entryAt(documentState,slot),drafts.get(slot)]);}
function deleteTarget(held,slot) {
  if(!canEdit())return;
  if(held)commit(documentState,null,{cursor:null});
  else commit(E.removeSlot(documentState,slot),null,{selected:slot,discard:[slot]});
  V.hideTooltip();
}
function clearSlot(slot=selected,held=false) {
  if(!canEdit())return;
  const entry=held?carried?.entry:E.entryAt(documentState,slot),pending=!held&&drafts.has(slot);
  if(!entry&&!pending)return;
  if(M.confirmDelete(entry,held?null:drafts.get(slot))){
    pendingDelete={held,slot,signature:deletionSignature(held,slot)};
    $('delete-item-heading').textContent='Delete this item?';$('confirm-delete').textContent='Delete item';
    const stack=entry?.item,name=stack?T.name(stack):'Unapplied slot edits';
    $('delete-item-message').textContent=(stack?(stack.count??1)+' × ':'')+name+'. You can undo this.';
    V.hideTooltip();$('delete-item-dialog').showModal();
  }else deleteTarget(held,slot);
}
function bulkSignature(target) {
  return JSON.stringify([target.all?documentState.items:target.slots.map(slot=>E.entryAt(documentState,slot)),target.slots.map(slot=>drafts.get(slot)),target.all?carried:null]);
}
function deleteSlots(target) {
  if(!canEdit())return;
  history[historyIndex].selection=[...selectedSlots];history[historyIndex].selectionMode=selectionMode;
  if(commit(E.removeSlots(documentState,target.slots),null,{discard:target.slots,cursor:target.all?null:carried,selection:target.all?[]:[...selectedSlots].filter(slot=>!target.slots.includes(slot))}))notice(target.all?'Kit inventory cleared. You can undo this.':'Selected slots cleared. You can undo this.');
  V.hideTooltip();
}
function clearSlots(all=false) {
  if(!canEdit())return;
  const slots=[...new Set(all?[...(documentState.items??[]).map(E.id),...drafts.keys()]:selectedSlots)],entries=slots.map(slot=>E.entryAt(documentState,slot)),held=all?carried?.entry:null;
  if(!entries.some(Boolean)&&!slots.some(slot=>drafts.has(slot))&&!held)return;
  const target={slots,all};target.signature=bulkSignature(target);
  if(all||entries.some((entry,index)=>M.confirmDelete(entry,drafts.get(slots[index])))||M.confirmDelete(held)){
    pendingDelete=target;const count=entries.filter(Boolean).length+(held?1:0);
    $('delete-item-heading').textContent=all?'Clear kit inventory?':'Delete selected items?';$('confirm-delete').textContent=all?'Clear inventory':'Delete items';
    $('delete-item-message').textContent='Remove '+count+' stack'+(count===1?'':'s')+(all?' from all inventories, including cosmetic slots and the held item':' from the selected slots')+'. Pending edits will be cleared too. You can undo this.';
    V.hideTooltip();$('delete-item-dialog').showModal();
  }else deleteSlots(target);
}
function libraryClick(id,event={}) {
  attempt(()=>{
    if(!canEdit())return;
    if(carried&&event.middle){notice('Place or return the held stack before picking up another stack.');return;}
    if(carried&&!event.shiftKey){clearSlot(selected,true);return;}
    if(event.shiftKey){
      if(E.entryAt(documentState,selected)){notice('Choose an empty slot for this shortcut.');return;}
      checkDraft(selected);
    }
    applyMouse(M.fromLibrary(documentState,carried,id,selected,{shift:!!event.shiftKey,button:event.button===1?1:0,fill:!!(event.middle||event.ctrlKey||event.metaKey)}));
  });
}
function place(id,slot=selected,fill=false) {
  attempt(()=>{
    if(!canEdit())return;
    if(carried)throw new Error('Place the held stack or press Escape before adding another item.');
    checkDraft(slot);const item={id:K.normalize(id)};item.count=fill?K.maxCount(item):1;
    applyMouse(M.click(documentState,{entry:{index:0,item},origin:slot},slot),slot);
  });
}
function updateDraft() {
  const stack=view.entry(selected)?.item;
  const existing=drafts.get(selected),draft={id:$('item-id').value,components:$('components').value,base:existing?.base??fingerprint(stack)};
  let equalComponents=false;
  try{equalComponents=JSON.stringify(JSON.parse(draft.components))===JSON.stringify(stack?.components||{});}catch(failure){equalComponents=false;}
  if(draft.id===(stack?.id??'')&&equalComponents)drafts.delete(selected);else drafts.set(selected,draft);
  $('component-state').textContent=drafts.has(selected)?'Not applied':'';$('revert-slot').hidden=!drafts.has(selected);
  record('draft:'+selected);
}
function applySlotDraft(componentsOnly=false) {
  attempt(()=>{
    const target=componentsOnly?'components':'item-id';if(!canEdit(target))return;
    const stack=view.entry(selected)?.item,draft=drafts.get(selected);
    if(draft&&draft.base!==fingerprint(stack))throw new Error('This slot changed in JSON. Revert these edits before trying again.');
    if(componentsOnly&&!stack)throw new Error('Choose an item in this slot first.');
    let next;
    if(componentsOnly){next=K.copy(stack);next.components=JSON.parse($('components').value);}
    else {
      const id=$('item-id').value.trim(),same=stack&&K.normalize(stack.id)===K.normalize(id);
      next=same?K.copy(stack):{id:K.normalize(id)};
      next.count=Math.min(stack?.count??1,K.maxCount(next));next.components=JSON.parse($('components').value);
    }
    const pendingDraft=componentsOnly&&draft&&draft.id!==next.id?{id:draft.id,components:JSON.stringify(next.components||{},null,2),base:fingerprint(next)}:null;
    if(commit(E.setSlot(documentState,selected,next),target,{discard:[selected],pendingDraft}))notice('Slot updated.');
  },componentsOnly?'components':'item-id');
}
function copySlot() {
  const stack=view.entry(selected)?.item;if(!stack)return;
  slotClipboard=K.copy(stack);$('slot-clipboard').textContent=T.name(stack);
  HeritageIcons.copied($('copy-slot'));feedback();
}
function pasteSlot() {
  attempt(()=>{if(!canEdit()||!slotClipboard)return;if(carried)throw new Error('Place the held stack or press Escape before pasting another item.');checkDraft(selected);applyMouse(M.click(documentState,{entry:{index:0,item:K.copy(slotClipboard)},origin:selected},selected));});
}
function equipment() {
  const host=$('equipment'),focused=document.activeElement,entryIndex=focused?.closest('[data-entry]')?.dataset.entry,property=focused?.dataset.property,selection=focused?.selectionStart;
  host.replaceChildren();if(documentState.enabled===false)return;
  const equipmentDocument=errorState?.target==='equipment'&&errorState.pending?errorState.pending:documentState;
  equipmentDocument.items.forEach((entry,n)=>{
    if((entry.inventory??'player')==='player')return;
    const row=document.createElement('div');row.className='equipment-entry';row.dataset.entry=n;
    row.innerHTML='<label>Inventory<select data-property="inventory"><option value="curios">Curios</option><option value="accessories">Accessories</option></select></label><label>Slot name<input data-property="slot"></label><label>Index<input data-property="index" type="number" min="0" max="255"></label><label class="equipment-id">Item ID<input data-property="id" spellcheck="false"></label><label>Count<input data-property="count" type="number" min="1" max="99"></label><label class="check"><input data-property="cosmetic" type="checkbox"> Cosmetic</label><button type="button" aria-label="Remove equipment slot">Remove</button>';
    for(const field of row.querySelectorAll('[data-property]')) {
      const name=field.dataset.property;
      if(name==='cosmetic')field.checked=entry.cosmetic??false;
      else field.value=name==='id'?entry.item.id:name==='count'?entry.item.count??1:entry[name]??'';
      field.addEventListener(field.matches('input:not([type=checkbox])')?'input':'change',()=>{
        if(!canEdit('equipment'))return;
        const next=K.copy(errorState?.target==='equipment'&&errorState.pending?errorState.pending:documentState),value=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;
        if(name==='id'||name==='count')next.items[n].item[name]=value;else next.items[n][name]=value;
        const previousId=JSON.stringify([entry.inventory,entry.slot,entry.index,entry.cosmetic??false]),updated=next.items[n],updatedId=JSON.stringify([updated.inventory,updated.slot,updated.index,updated.cosmetic??false]);
        commit(next,'equipment',{selected:selected===previousId&&E.valid(updatedId)?updatedId:selected});
      });
    }
    row.querySelector('button').addEventListener('click',()=>clearSlot(E.id(entry)));
    const edit=document.createElement('button');edit.type='button';edit.className='equipment-edit';edit.textContent='Edit in preview';edit.setAttribute('aria-label','Edit '+entry.slot+' slot in preview');edit.disabled=!!errorState;
    edit.addEventListener('click',()=>{selectSlot(E.id(entry));$('inventory').scrollIntoView({block:'nearest'});});row.append(edit);host.append(row);
  });
  if(entryIndex!==undefined&&property){const replacement=host.querySelector('[data-entry="'+entryIndex+'"] [data-property="'+property+'"]');replacement?.focus({preventScroll:true});if(typeof selection==='number')replacement?.setSelectionRange(selection,selection);}
}
function markSelectedItem() {
  activeItemButton?.setAttribute('aria-pressed','false');
  const id=view.entry(selected)?.item.id;activeItemButton=id?itemButtons.get(K.normalize(id)):null;
  if(activeItemButton?.isConnected)activeItemButton.setAttribute('aria-pressed','true');
}
function browser() {
  V.hideTooltip();
  const terms=$('search-items').value.toLowerCase().trim().split(/\s+/).filter(Boolean),category=$('item-category').value;
  const used=new Set((Array.isArray(documentState.items)?documentState.items:[]).filter(entry=>entry?.item?.id).map(entry=>K.normalize(entry.item.id)));
  const filtered=searchIndex.filter(({item,search})=>terms.every(term=>search.includes(term))&&(category==='all'||category==='blocks'&&item.block||category==='items'&&!item.block||category==='armor'&&item.armor||category==='used'&&used.has(item.id))).map(entry=>entry.item);
  const size=pageSize,total=Math.max(1,Math.ceil(filtered.length/size));pageCount=total;page=Math.max(0,Math.min(page,total-1));
  $('item-count').textContent=filtered.length.toLocaleString()+' item'+(filtered.length===1?'':'s');
  $('page-count').textContent=filtered.length?'Page '+(page+1)+' of '+total:'No matches';
  $('previous').disabled=page===0;$('next').disabled=page===total-1;$('clear-search').hidden=!$('search-items').value;
  const nodes=[];
  for(const item of filtered.slice(page*size,(page+1)*size)) {
    let button=itemButtons.get(item.id);
    if(!button) {
      button=document.createElement('button');button.type='button';button.className='item-choice';button.dataset.item=item.id;
      button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',item.name+' ('+item.id+')');button.append(V.icon(item.id));
      V.bindTooltip(button,[item.name,item.id,'Maximum stack: '+item.max]);itemButtons.set(item.id,button);
    }
    nodes.push(button);
  }
  $('item-browser').replaceChildren(...nodes);$('item-browser').scrollTop=0;
  if(!nodes.length) {
    const empty=document.createElement('div');empty.className='item-empty';
    const text=document.createElement('p');text.textContent=category==='used'?'No vanilla items in this kit match your search.':'No matching vanilla items. Add a modded item by its ID.';
    const button=document.createElement('button');button.type='button';button.textContent='Enter an item ID';button.addEventListener('click',()=>{$('item-id').focus();$('item-id').select();});empty.append(text,button);$('item-browser').append(empty);
  }
  markSelectedItem();
}
function fitBrowser() {
  const host=$('item-browser'),style=getComputedStyle(host),columns=style.gridTemplateColumns.split(' ').length;
  const height=host.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),gap=parseFloat(style.rowGap)||0,rowHeight=host.querySelector('.item-choice')?.offsetHeight||40;
  const size=columns*Math.max(1,Math.floor((height+gap)/(rowHeight+gap)));
  if(size===pageSize)return;
  page=Math.floor(page*pageSize/size);pageSize=size;browser();
}
new ResizeObserver(fitBrowser).observe($('item-browser'));
$('item-browser').addEventListener('wheel',event=>{
  if(event.ctrlKey||!event.deltaY||document.body.classList.contains('mc-dragging'))return;
  event.preventDefault();
  if(pageCount<2||performance.now()-wheelPageTime<160)return;
  wheelPageTime=performance.now();page=(page+Math.sign(event.deltaY)+pageCount)%pageCount;browser();
},{passive:false});
$('item-browser').addEventListener('click',event=>{
  const button=event.target.closest('[data-item]');if(button&&!event.detail)libraryClick(button.dataset.item,event);
});
document.querySelector('.kit-library').addEventListener('click',event=>{
  if(!carried||event.shiftKey||event.target.closest('[data-item],input,select,textarea,button,a,summary,details'))return;
  clearSlot(selected,true);
});
$('item-browser').addEventListener('contextmenu',event=>{if(event.target.closest('[data-item]'))event.preventDefault();});
$('item-browser').addEventListener('auxclick',event=>{if(event.button===1&&event.target.closest('[data-item]'))event.preventDefault();});
$('item-browser').addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-item]');if(!button)return;
  if(event.button===1){event.preventDefault();libraryClick(button.dataset.item,{middle:true});return;}
  V.dragStart(event,{item:{id:button.dataset.item}},destination=>place(button.dataset.item,destination),{buttons:[0,2],onTap:()=>libraryClick(button.dataset.item,{button:event.button===2?1:0,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey})});
});
for(const [id,name] of Object.entries({'json-tab':'braces','details-tab':'sliders-horizontal',copy:'copy',undo:'undo-2',redo:'undo-2',format:'text-align-start',download:'external-link', 'copy-slot':'copy'}))$(id).prepend(HeritageIcons.create(name));
$('redo').querySelector('svg').style.transform='scaleX(-1)';
for(let slot=0;slot<9;slot++){const option=document.createElement('option');option.value=slot;option.textContent='Hotbar '+(slot+1);$('selected-slot').append(option);}
for(const sample of HeritageKitExamples){const option=document.createElement('option');option.value=sample.id;option.textContent=sample.kit.title;$('example').append(option);}
function tab(which) {
  for(const name of ['json','details']){$(name+'-panel').hidden=name!==which;$(name+'-tab').setAttribute('aria-selected',String(name===which));$(name+'-tab').tabIndex=name===which?0:-1;}
}
for(const name of ['json','details']){
  $(name+'-tab').addEventListener('click',()=>tab(name));
  $(name+'-tab').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=name==='json'?'details':'json';tab(next);$(next+'-tab').focus();}});
}
$('kit-json').addEventListener('input',()=>parse());
$('undo').addEventListener('click',()=>restore(-1));$('redo').addEventListener('click',()=>restore(1));
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  const modifier=event.ctrlKey||event.metaKey,field=event.target.closest('input,textarea,select,[contenteditable=true]'),slot=event.target.closest('.mc-slot');
  if(modifier&&event.key.toLowerCase()==='f'){event.preventDefault();$('search-items').focus();$('search-items').select();return;}
  if(modifier&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())&&(!field||field.closest('#lore-lines')||['kit-json','title','description','order','tags','count'].includes(field.id))){
    event.preventDefault();restore(event.key.toLowerCase()==='y'||event.shiftKey?1:-1);return;
  }
  if(slot&&modifier&&event.key.toLowerCase()==='c'){event.preventDefault();copySlot();}
  if(slot&&modifier&&event.key.toLowerCase()==='v'){event.preventDefault();pasteSlot();}
  if(!field&&modifier&&event.key.toLowerCase()==='a'&&(slot||$('inventory').contains(event.target))){event.preventDefault();selectAllSlots();return;}
  if(!field&&['Delete','Backspace'].includes(event.key)){event.preventDefault();if(selectedSlots.size&&!carried)clearSlots();else clearSlot(view.hover??selected,!!carried);return;}
  if(!field&&(slot||view.hover!==null)&&!modifier&&(/^[1-9]$/.test(event.key)||event.key.toLowerCase()==='f')){
    event.preventDefault();attempt(()=>{if(!canEdit()||carried)return;const from=view.hover??selected,to=event.key.toLowerCase()==='f'?40:Number(event.key)-1;checkDraft(from);checkDraft(to);commit(E.moveSlot(documentState,from,to),null,{selected:from});});return;
  }
  if(event.key==='Escape'&&carried){event.preventDefault();returnHeld();return;}
  if(event.key==='Escape'&&(selectedSlots.size||selectionMode)){event.preventDefault();deselectSlots();return;}
  if(event.key==='Escape'){V.hideTooltip();$('search-items').value='';page=0;browser();$('component-details').open=false;document.querySelector('.kit-help').open=false;}
});
$('format').addEventListener('click',()=>{
  const field=$('kit-json'),scroll=field.scrollTop;field.value=JSON.stringify(documentState,null,2);field.scrollTop=scroll;record();notice('JSON formatted.');
});
$('restore').addEventListener('click',()=>commit(documentState,null,{replace:true}));
for(const id of ['title','description','order','selected-slot','tags'])$(id).addEventListener('input',()=>{
  if(!canEdit(id))return;
  const next=K.copy(documentState);
  if(id==='order')next.order=Number($(id).value);
  else if(id==='selected-slot')next.selected_slot=Number($(id).value);
  else if(id==='tags')next.tags=$(id).value.split(',').map(value=>value.trim()).filter(Boolean);
  else next[id]=$(id).value;
  const active=document.activeElement,selection=active.selectionStart;
  commit(next,id);
  if(typeof selection==='number'&&active.isConnected){active.focus();active.setSelectionRange(selection,selection);}
});
$('item-id').addEventListener('input',updateDraft);$('components').addEventListener('input',updateDraft);
$('apply-id').addEventListener('click',()=>applySlotDraft());
$('item-id').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applySlotDraft();}});
$('apply-components').addEventListener('click',()=>applySlotDraft(true));
$('lore-lines').addEventListener('input',event=>{
  const field=event.target.closest('textarea[data-lore-line]');
  if(field){const index=Number(field.dataset.loreLine);setLoreMarkup(index,field.value,'lore:'+selected+':'+index);return;}
  const tint=event.target.closest('input[data-lore-tint]');
  if(tint)tint.closest('.lore-line').querySelector('select').value=Object.values(T.colors).includes(tint.value)?tint.value:'custom';
});
$('lore-lines').addEventListener('change',event=>{
  const preset=event.target.closest('select[data-lore-color]');if(!preset||preset.value==='custom')return;
  preset.closest('.lore-line').querySelector('input[type=color]').value=preset.value;
});
$('lore-lines').addEventListener('click',event=>{
  const format=event.target.closest('button[data-lore-format]');
  if(format){wrapLoreSelection(Number(format.dataset.loreIndex),format.dataset.loreFormat);return;}
  const color=event.target.closest('button[data-lore-apply-color]');
  if(color){wrapLoreSelection(Number(color.dataset.loreApplyColor),'color:'+color.closest('.lore-line').querySelector('input[type=color]').value);return;}
  const button=event.target.closest('button[data-remove-lore]');if(!button)return;
  const index=Number(button.dataset.removeLore);
  if(editLore(lines=>{lines.splice(index,1);loreSources.get(selected)?.splice(index,1);})){
    const inputs=$('lore-lines').querySelectorAll('textarea[data-lore-line]');
    (inputs[Math.min(index,inputs.length-1)]||$('add-lore-line')).focus();
  }
});
$('add-lore-line').addEventListener('click',()=>{
  if(editLore(lines=>lines.push(T.parseLoreMarkup(''))))$('lore-lines').lastElementChild.querySelector('textarea').focus();
});
$('revert-slot').addEventListener('click',()=>{drafts.delete(selected);if(['item-id','components'].includes(errorState?.target))errorState=null;slotFields();record();});
$('discard-drafts').addEventListener('click',()=>{drafts.clear();if(['item-id','components'].includes(errorState?.target))errorState=null;slotFields();record();notice('Slot edits reverted. You can undo this.');});
$('go-to-draft').addEventListener('click',()=>{const slot=drafts.keys().next().value;if(slot!==undefined){selectSlot(slot);if($('item-id').value!==view.entry(selected)?.item.id)$('item-id').focus();else{$('component-details').open=true;$('components').focus();}}});
$('select-slots').addEventListener('click',()=>{if(!canEdit()||carried)return;selectionMode=!selectionMode;syncSelection();});
$('select-all-slots').addEventListener('click',selectAllSlots);
$('deselect-slots').addEventListener('click',deselectSlots);
$('delete-selected').addEventListener('click',()=>clearSlots());
$('clear-inventory').addEventListener('click',()=>clearSlots(true));
$('clear-slot').addEventListener('click',()=>clearSlot());
$('return-carried').addEventListener('click',returnHeld);$('delete-carried').addEventListener('click',()=>clearSlot(selected,true));
$('confirm-delete').addEventListener('click',()=>{
  const target=pendingDelete;if(!target)return;
  if(target.slots){if(target.signature===bulkSignature(target))deleteSlots(target);else notice('The selected items changed. Select them again before deleting.');}
  else if(target.signature===deletionSignature(target.held,target.slot))deleteTarget(target.held,target.slot);else notice('The item changed. Select it again before deleting.');
  $('delete-item-dialog').close();
});
$('delete-item-dialog').addEventListener('close',()=>{pendingDelete=null;});
$('copy-slot').addEventListener('click',copySlot);$('paste-slot').addEventListener('click',pasteSlot);
$('count').addEventListener('input',()=>attempt(()=>{
  if(!canEdit('count'))return;const stack=view.entry(selected)?.item;if(!stack)return;
  const next=K.copy(stack);next.count=Number($('count').value);commit(E.setSlot(documentState,selected,next),'count:'+selected);
},'count'));
$('fill-stack').addEventListener('click',()=>attempt(()=>{
  if(!canEdit())return;const stack=view.entry(selected)?.item;if(!stack)return;
  const next=K.copy(stack);next.count=K.maxCount(next);commit(E.setSlot(documentState,selected,next));
}));
$('set-start').addEventListener('click',()=>{if(typeof selected!=='number'||selected===(documentState.selected_slot??0))return;const next=K.copy(documentState);next.selected_slot=selected;commit(next);});
$('add-equipment').addEventListener('click',()=>{
  if(!canEdit('equipment'))return;
  const next=K.copy(documentState);let equipmentIndex=0;
  while(next.items.some(entry=>entry.inventory==='curios'&&entry.slot==='ring'&&entry.index===equipmentIndex))equipmentIndex++;
  next.items.push({inventory:'curios',slot:'ring',index:equipmentIndex,item:{id:'minecraft:compass'}});commit(next,'equipment');
});
$('search-items').addEventListener('input',()=>{page=0;browser();});$('item-category').addEventListener('change',()=>{page=0;browser();});
$('clear-search').addEventListener('click',()=>{$('search-items').value='';page=0;browser();$('search-items').focus();});
$('previous').addEventListener('click',()=>{page--;browser();});$('next').addEventListener('click',()=>{page++;browser();});
$('kit-drafts').addEventListener('change',()=>activateKit($('kit-drafts').value));
$('new-kit').addEventListener('click',()=>{openKit();tab('details');$('title').focus();$('title').select();});
$('example').addEventListener('change',()=>{const sample=HeritageKitExamples.find(sample=>sample.id===$('example').value);if(sample)openKit(JSON.stringify(sample.kit,null,2));$('example').value='';});
$('import').addEventListener('change',async()=>{
  const file=$('import').files[0];if(!file)return;
  try{openKit(await file.text());tab('json');notice(rawInvalid?'Fix the imported JSON to continue.':'Imported '+file.name+'.');}
  catch(failure){fail('Could not read kit file: '+failure.message);}
  $('import').value='';
});
$('copy').addEventListener('click',async()=>{
  if($('copy').disabled)return;
  try{await navigator.clipboard.writeText(JSON.stringify(documentState,null,2));HeritageIcons.copied($('copy'));}
  catch(failure){tab('json');$('kit-json').focus();$('kit-json').select();notice('Copy the selected JSON with Ctrl+C.');}
});
$('download').addEventListener('click',()=>{
  if($('download').disabled)return;
  const blob=new Blob([JSON.stringify(documentState,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  const title=typeof documentState.title==='string'?documentState.title:'kit';
  link.href=url;link.download=(title.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'kit')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Kit downloaded.');
});
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();});
let initialSource=JSON.stringify(documentState,null,2),saved,hadSavedDraft=false,loadFailure='';
try{
  const value=localStorage.getItem(storageKey);hadSavedDraft=!!value;
  workspace=new HeritageKitDrafts(value?JSON.parse(value):null,{...snapshot(),source:initialSource});
}catch(failure){
  saveBlocked=saveUnavailable=true;loadFailure='Saved drafts unavailable. Download a copy of new edits.';
  workspace=new HeritageKitDrafts(null,{...snapshot(),source:initialSource});
}
saved=workspace.get().state;
if(saved&&typeof saved.source==='string') {
  try {
    const parsed=K.read(JSON.stringify(saved.document));documentState=parsed.document;kitWarnings=parsed.warnings;
    initialSource=saved.source;selected=E.valid(saved.selected)?saved.selected:0;selectedSlots=new Set((Array.isArray(saved.selection)?saved.selection:[]).filter(E.valid));selectionMode=saved.selectionMode===true;preview.restore(saved.preview);carried=M.cursor(saved.cursor);
    drafts=new Map(Array.isArray(saved.drafts)?saved.drafts.filter(entry=>Array.isArray(entry)&&E.valid(entry[0])&&entry[1]&&typeof entry[1].id==='string'&&typeof entry[1].components==='string'):[]);
    loreSources=readLoreSources(saved.loreSources);
    $('draft-status').textContent=loadFailure||(hadSavedDraft?'Draft restored':'Draft ready');
  }catch(failure){$('draft-status').textContent='Draft could not be restored. Import it again.';}
}
$('kit-json').value=initialSource;const savedCursor=carried;carried=null;display();parse(false,false);carried=savedCursor;display();
if(saved?.error&&!rawInvalid&&typeof saved.error.message==='string'){errorState=saved.error;display();if($(errorState.target))$(errorState.target).value=errorState.value;}
history=[snapshot()];historyIndex=0;feedback();browser();
const linked=new URLSearchParams(location.search).get('kit');
if(linked!==null){
  openKit(linked);
  window.history.replaceState(null,'',location.pathname+location.hash);
}
V.assets().then(()=>{
  display();
  V.setupTooltips();
}).catch(failure=>notice('Preview unavailable: '+failure.message));
})();
