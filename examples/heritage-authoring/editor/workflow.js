(() => {
'use strict';
const steps=['pack','locations','preview','export'];
function step(value){return steps.includes(value)?value:'pack';}
function navigation(value,part='details',kind='',returning=false){
  const stage=step(value),parts=['details','kits','intro'],index=parts.indexOf(part);
  if(kind)return {back:'finish',next:'finish',backLabel:'Back to location',nextLabel:'Done editing'};
  if(returning&&['pack','locations'].includes(stage))return {back:stage==='pack'?'':index>0?parts[index-1]:'pack',next:'preview',backLabel:index>0?'Back to '+(index===1?'location':'kits'):'Back to pack',nextLabel:'Back to review'};
  if(stage==='locations')return {back:index>0?parts[index-1]:'pack',next:index>=0&&index<2?parts[index+1]:'preview',backLabel:index>0?'Back to '+(index===1?'location':'kits'):'Back to pack',nextLabel:index===0?'Choose kits':index===1?'Choose intro':'Review and preview'};
  const indexStep=steps.indexOf(stage);return {back:steps[indexStep-1]??'',next:steps[indexStep+1]??'',backLabel:stage==='preview'?'Back to locations':stage==='export'?'Back to preview':'Back',nextLabel:stage==='pack'?'Continue to locations':stage==='preview'?'Continue to export':''};
}
function entryName(title,kind,names=[]){const base=((String(title??'').trim()||'Location')+' '+kind).slice(0,110);let name=base,index=2;while(names.includes(name))name=base+' '+index++;return name;}
function context(search,raw){
  const params=new URLSearchParams(search),packId=params.get('pack');if(!packId)return null;
  const pack=JSON.parse(raw??'null')?.projects?.find(entry=>entry.id===packId);if(!pack)return {packId,packName:'Pack builder',locationId:params.get('location')??'',locationName:'',step:'locations',missing:true};
  const location=pack.state.locations.find(entry=>entry.id===params.get('location'));
  return {packId,packName:pack.state.name,locationId:location?.id??params.get('location')??'',locationName:location?.fields.title??'',guiScale:pack.state.guiScale??0,fields:location?.fields??{},introId:location?.intro??'',kitIds:location?.kitMode==='selected'?location.kits:pack.state.kits.filter(kit=>kit.included).map(kit=>kit.id),missing:!!params.get('location')&&!location,step:step(params.get('step')??'locations')};
}
function editorUrl(kind,{draft,create=false,packId,locationId}={}){
  if(!['kit','intro'].includes(kind))throw new Error('Unknown editor.');
  const params=new URLSearchParams();if(draft)params.set('draft',draft);if(create)params.set('create','1');if(packId)params.set('pack',packId);if(locationId)params.set('location',locationId);
  return (kind==='kit'?'kit-editor.html':'gallery.html')+(params.size?'?'+params:'');
}
function packUrl(kind,id,source){
  const params=new URLSearchParams({step:source?.step??'locations'});if(source?.packId)params.set('pack',source.packId);if(source?.locationId)params.set('location',source.locationId);if(kind&&id)params.set(kind,id);return 'pack-assembler.html?'+params;
}
function duplicate(entry,entries,id){
  const copy=JSON.parse(JSON.stringify(entry));copy.id=id;copy.fields.title=(copy.fields.title||'Location')+' copy';copy.fields.order=String(Math.min(2147483647,Math.max(-1,...entries.map(entry=>Number(entry.fields.order)||0))+1));
  const base=entry.path+'_copy';let file=base,index=2;while(entries.some(entry=>entry.path===file))file=base+'_'+index++;copy.path=file;return copy;
}
function attach(pack,kind,id){
  const entry=pack.locations.find(entry=>entry.id===pack.active);
  if(kind==='kit'){
    const kit=pack.kits.find(kit=>kit.id===id);if(!kit)throw new Error('This saved kit is unavailable.');kit.included=true;
    if(entry?.kitMode==='selected')entry.kits=[...new Set([...entry.kits,id])];
  }else if(kind==='intro'){if(!entry)throw new Error('Choose a starting location for this intro.');entry.intro=id;}
}
function usage(pack,kind,id){return pack?.locations.filter(location=>kind==='intro'?location.intro===id||location.destinations.some(destination=>destination.intro===id):location.kitMode==='selected'?location.kits.includes(id):pack.kits.some(kit=>kit.id===id&&kit.included))??[];}
function connected(value,source,kind,id,name){
  if(!['kit','intro'].includes(kind))throw new Error('Unknown editor.');
  const result=JSON.parse(JSON.stringify(value)),project=result.projects?.find(entry=>entry.id===source?.packId);
  if(!project)throw new Error('The original pack is unavailable. Return to the pack builder to choose another.');
  const pack=project.state,location=pack.locations.find(entry=>entry.id===source.locationId);
  if(!location)throw new Error('The original location is unavailable. Return to the pack builder to choose another.');
  if(kind==='kit'&&!pack.kits.some(entry=>entry.id===id)){
    const base=String(name).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'untitled';let path=base,index=2;
    while(pack.kits.some(entry=>entry.path===path))path=base+'_'+index++;
    pack.kits.push({id,path,included:false});
  }
  pack.active=location.id;attach(pack,kind,id);result.active=project.id;return result;
}
function editor(kind,id){
  const link=document.getElementById('use-in-pack'),nav=document.querySelector('.workflow-nav');let source;
  try{source=context(location.search,localStorage.getItem('heritage.packAssembler.projects.v1'));}
  catch(error){const params=new URLSearchParams(location.search);source={packId:params.get('pack'),locationId:params.get('location'),packName:'Pack builder',locationName:'',step:'locations',missing:true};document.getElementById(kind==='kit'?'status':'copy-status').textContent='Pack context could not load: '+error.message;}
  const route=new URLSearchParams(location.search);if(!route.has('create')&&route.get('draft')!==id){route.set('draft',id);window.history.replaceState(null,'',location.pathname+'?'+route+location.hash);}
  link.href=packUrl(kind,id,source);const label=source?.missing?'Return to pack builder':source?.locationName?'Use in '+source.locationName:source?'Use in '+source.packName:'Use in pack';let text=link.querySelector('span');if(!text){text=document.createElement('span');link.replaceChildren(text);}text.textContent=label;link.setAttribute('aria-label',label);
  if(!source)return null;
  nav.classList.add('pack-context','pack-stage-nav');nav.setAttribute('aria-label','Create a datapack');
  if(!nav.querySelector('[data-pack-stage]')){nav.replaceChildren();for(const [index,stage] of steps.entries()){const a=document.createElement('a');a.dataset.packStage=stage;a.textContent=(index+1)+' '+['Pack','Starting locations','Preview','Export'][index];if(stage==='locations')a.setAttribute('aria-current','step');nav.append(a);}}
  for(const a of nav.querySelectorAll('[data-pack-stage]'))a.href=packUrl(['preview','export'].includes(a.dataset.packStage)?kind:null,id,{...source,step:a.dataset.packStage});
  const contextNode=document.getElementById('author-context');if(contextNode){contextNode.replaceChildren();const back=document.createElement('a');back.href=packUrl(null,null,source);back.textContent=source.missing?'Original location unavailable':source.packName+' / '+(source.locationName||'Starting locations');contextNode.append(back,document.createTextNode(' / '+(kind==='kit'?'Kit':'Intro')));contextNode.hidden=false;}
  for(const a of document.querySelectorAll('header a[href]')){const target=a.getAttribute('href').split('?')[0];if(target==='pack-assembler.html')a.href=packUrl(null,null,source);if(['kit-editor.html','gallery.html'].includes(target)){const other=target==='kit-editor.html'?'kit':'intro',draft=other==='intro'?source.introId:source.kitIds?.find(id=>!['builtin-empty','bundled-empty'].includes(id));a.href=editorUrl(other,{packId:source.packId,locationId:source.locationId,draft,create:!draft});}}
  return source;
}
const api={steps,step,navigation,entryName,context,editorUrl,packUrl,duplicate,attach,usage,connected,editor};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageWorkflow=api;
})();
