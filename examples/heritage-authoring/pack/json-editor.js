(() => {
'use strict';
function create(config){
  const $=id=>document.getElementById(id),dialog=$('pack-json-dialog'),picker=$('pack-json-file'),field=$('pack-json-source'),status=$('pack-json-status'),apply=$('apply-pack-json'),cancel=$('cancel-pack-json');
  const code=new HeritageJsonEditor(field,$('pack-json-lines'));
  let expected,files=[],selected='',busy=false;
  const pending=new Map(),key=file=>file.group+':'+file.path;
  const current=()=>files.find(file=>key(file)===selected);
  function feedback(clear=true){
    const file=current();field.readOnly=busy||!!file?.reason;picker.disabled=busy;cancel.disabled=busy;
    apply.disabled=busy||!pending.size;$('format-pack-json').disabled=busy||!!file?.reason;
    $('pack-json-help').textContent=file?.reason||'Edits update the visual editor. Shared kit edits apply wherever that kit is used. Changed inline intros stay local to this location.';
    if(clear){field.setAttribute('aria-invalid','false');code.setError(null);}
  }
  function show(){
    const file=current();field.value=pending.get(selected)??file?.content??'';field.scrollTop=0;status.textContent='';feedback();
  }
  $('edit-pack-json').addEventListener('click',()=>{
    try{
      if(!config.prepare())return;
      config.observe();expected=HeritagePack.copy(config.read());files=HeritagePackJson.files(expected);
      if(!files.length)throw new Error('There are no JSON files available to edit.');
      pending.clear();picker.replaceChildren(...files.map(file=>new Option((file.group==='resources'?'Resource pack / ':'Datapack / ')+file.path,key(file))));
      selected=files.some(file=>key(file)===selected)?selected:key(files[0]);picker.value=selected;show();dialog.showModal();field.focus();
    }catch(error){config.report('Could not open pack JSON: '+error.message);}
  });
  picker.addEventListener('change',()=>{selected=picker.value;show();});
  field.addEventListener('input',()=>{
    if(field.value===current().content)pending.delete(selected);else pending.set(selected,field.value);
    status.textContent=pending.size?pending.size+' file'+(pending.size===1?' has':'s have')+' unapplied edits.':'';feedback();
  });
  function errorMessage(error){const location=code.setError(error);field.setAttribute('aria-invalid','true');status.textContent=(location?'Line '+location.line+', column '+location.column+': ':'')+error.message;}
  $('format-pack-json').addEventListener('click',()=>{try{field.value=JSON.stringify(JSON.parse(field.value),null,2)+'\n';field.dispatchEvent(new Event('input'));}catch(error){errorMessage(error);}});
  cancel.addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  apply.addEventListener('click',async()=>{
    if(busy||!pending.size)return;busy=true;feedback();status.textContent='Applying JSON edits...';
    let failed=selected;
    try{
      let next=HeritageEditing.workspace(expected.pack,expected.libraries);const drafts=[];
      for(const [id,source] of pending){failed=id;const file=files.find(file=>key(file)===id);next=HeritagePackJson.apply(next,file.group,file.path,source);for(const draft of next.drafts)if(!drafts.some(entry=>entry.kind===draft.kind&&entry.id===draft.id))drafts.push(draft);}
      await config.write(next,expected);config.capture({drafts,label:'Edit pack JSON'});dialog.close();config.report('Pack JSON updated. You can undo this change.');
    }catch(error){selected=failed;picker.value=selected;show();errorMessage(error);}
    finally{busy=false;feedback(false);}
  });
}
globalThis.HeritagePackJsonEditor={create};
})();
