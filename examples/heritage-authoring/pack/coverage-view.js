(() => {
'use strict';
function create(config){
  const $=id=>document.getElementById(id),C=HeritageCoverage,key='heritage.previewCoverage.v1',pending=new Map();
  let ledger,blocked=false,message='',revision=0,filter='',offset=0,lastPack='',snapshot=null,opening=false,rows=[];
  try{ledger=new C.Ledger(localStorage.getItem(key));}catch(error){ledger=new C.Ledger();blocked=true;message='Saved preview coverage could not load and was kept. New results are available for this session. '+error.message;}
  const report=text=>{$('coverage-status').textContent=text;};
  const name=(value,kind,translations)=>HeritageFlow.label(value,kind,translations);
  function resumeState(){const value=config.get();$('resume-preview').hidden=!pending.has(value.id);$('resume-preview').disabled=opening||!!value.output?.errors.length;}
  function refresh(){
    resumeState();const request=++revision,value=config.get();if(!config.visible())return;
    if(value.id!==lastPack){lastPack=value.id;filter='';offset=0;}
    if(value.output.errors.length){$('coverage-summary').textContent='Resolve the pack issues to inspect preview paths.';config.summary?.('Unavailable until file issues are resolved.');$('coverage-rows').replaceChildren();$('coverage-pagination').hidden=true;return;}
    HeritageFlowPreview.catalog(value.output).then(data=>{
      if(request!==revision||value.id!==config.get().id)return;const choices=data.choices,images=C.pictures(value.output),summary=ledger.summary(value.id,choices,images),select=$('coverage-location');
      select.replaceChildren(new Option('All locations',''),...choices.spawns.map(spawn=>new Option(name(spawn,'title',data.translations),spawn.id)));if(!choices.spawns.some(spawn=>spawn.id===filter))filter='';select.value=filter;
      const total=C.count(choices,filter);offset=Math.max(0,Math.min(offset,Math.floor(Math.max(0,total-1)/25)*25));rows=C.page(choices,images,{filter,offset});
      const text=summary.tested+' of '+summary.total+' paths previewed in the browser'+(summary.changed?' · '+summary.changed+' changed since preview':'')+(summary.partial?' · '+summary.partial+' partly previewed':'');
      $('coverage-summary').textContent=text;config.summary?.(text);
      const body=$('coverage-rows');body.replaceChildren();
      for(const [index,route] of rows.entries()){
        const row=document.createElement('tr'),status=ledger.status(value.id,route),destination=route.arrival.type==='fixed'?'Coordinates '+[route.arrival.x,route.arrival.y,route.arrival.z].join(', '):HeritageFlow.place(route.arrival.target)||HeritageFlow.place(route.arrival.type),labels=[name(route.spawn,'title',data.translations),name(route.kit,'title',data.translations),(route.poolIndex===null?'':(route.poolIndex+1)+'. ')+destination,{tested:'Previewed',changed:'Changed since preview',partial:'Partly previewed',untested:'Not previewed'}[status.state]];
        for(const [column,text] of labels.entries()){const cell=document.createElement('td');cell.textContent=text;if(column===3){cell.className='coverage-state-'+status.state;if(status.record)cell.title='Last previewed '+new Date(status.record.updatedAt).toLocaleString()+' · '+(status.record.settings?.resolution??'')+' · GUI '+(status.record.settings?.guiScale??'')+' · '+(status.record.settings?.inventory??'');}row.append(cell);}
        const actions=document.createElement('td'),tryPath=document.createElement('button');tryPath.type='button';tryPath.dataset.tryPath=index;tryPath.textContent='Preview path';actions.append(tryPath);
        if(config.editable(route)){const edit=document.createElement('button');edit.type='button';edit.dataset.editPath=index;edit.textContent='Edit location';actions.append(edit);}row.append(actions);body.append(row);
      }
      $('coverage-pagination').hidden=total<=25;$('coverage-page').textContent=total?'Paths '+(offset+1)+'–'+Math.min(offset+25,total)+' of '+total:'No playable paths';$('coverage-previous').disabled=offset===0;$('coverage-next').disabled=offset+25>=total;report(message);
    }).catch(error=>{if(request===revision){report('Preview paths could not load: '+error.message);config.summary?.('Preview coverage unavailable: '+error.message);}});
  }
  async function open(options={}){
    if(opening||$('flow-dialog').open)return;opening=true;resumeState();
    try{
      if(!config.prepare())return;const value=config.get();if(value.output.errors.length){report('Resolve the highlighted pack issues before previewing.');return;}
      const data=await HeritageFlowPreview.catalog(value.output);if(value.id!==config.get().id||value.output!==config.get().output){report('The pack changed while the preview was loading. Start it again to use the latest version.');return;}
      let target=options.route??(options.resume?pending.get(value.id):null);
      if(options.spawnId){const first=C.page(data.choices,C.pictures(value.output),{filter:options.spawnId,limit:1})[0];if(!first){report('This location has no playable path. Check its kits and destinations.');return;}target={spawnId:first.spawnId,kitId:first.kitId,poolIndex:first.poolIndex};}
      if(options.route&&!C.scene(data.choices,C.pictures(value.output),target.spawnId,target.kitId,target.poolIndex)){report('That path changed. Choose an available path.');return;}
      snapshot={id:value.id,choices:data.choices,images:C.pictures(value.output)};config.started();await HeritageFlowPreview.open(value.output,value.state,options.resume?{resume:target}:target?{route:target}:{});
    }catch(error){report('Preview could not open: '+error.message);}finally{opening=false;resumeState();}
  }
  function complete(detail){
    if(!snapshot||!detail)return;const spawn=snapshot.choices.spawns.find(entry=>entry.id===detail.spawnId),indices=spawn?.type==='pool'&&detail.poolIndex===null?spawn.pool.map((entry,index)=>index):[detail.poolIndex];let done=false;
    for(const index of indices){const route=C.scene(snapshot.choices,snapshot.images,detail.spawnId,detail.kitId,index);if(route)done=ledger.record(snapshot.id,route,detail.parts??[],detail.settings??{})||done;}
    if(!blocked){try{HeritageProject.write(localStorage,{[key]:ledger.serialize()});message='';}catch(error){message='Preview completed. Preview results could not be saved: '+error.message;}}
    if(done&&detail.phase==='complete')config.completed();refresh();
  }
  $('coverage-location').addEventListener('change',event=>{filter=event.target.value;offset=0;refresh();});
  $('coverage-previous').addEventListener('click',()=>{offset=Math.max(0,offset-25);refresh();});$('coverage-next').addEventListener('click',()=>{offset+=25;refresh();});
  $('coverage-rows').addEventListener('click',event=>{
    const run=event.target.closest('[data-try-path]'),edit=event.target.closest('[data-edit-path]');if(run){const route=rows[Number(run.dataset.tryPath)];if(route)open({route:{spawnId:route.spawnId,kitId:route.kitId,poolIndex:route.poolIndex}});}else if(edit){const route=rows[Number(edit.dataset.editPath)];if(route)config.editRoute(route);}
  });
  $('resume-preview').addEventListener('click',()=>open({resume:true}));
  $('flow-dialog').addEventListener('heritage:flow-complete',event=>complete(event.detail));
  $('flow-dialog').addEventListener('heritage:flow-edit',event=>{
    if(!snapshot)return;complete(event.detail.progress);pending.set(snapshot.id,event.detail.resume);resumeState();if(snapshot.id!==config.get().id){report('Return to the original pack to edit this preview choice.');return;}config.edit(event.detail);
  });
  refresh();return {refresh,open};
}
globalThis.HeritageCoverageView={create};
})();
