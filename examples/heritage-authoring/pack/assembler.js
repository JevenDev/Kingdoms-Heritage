(async () => {
'use strict';
const P=HeritagePack,$=id=>document.getElementById(id),storageKey='heritage.packAssembler.v1';
if(!await HeritageSession.acquire(storageKey))return;
const validators={kit:source=>HeritageKit.read(source),intro:source=>HeritagePreview.readJson(source)};
const code=new HeritageJsonEditor($('export-json'),$('line-count'));
HeritageIcons.action('copy','copy','Copy JSON');
let catalog={kits:[],intros:[]},state,output,saveTimer,saveBlocked=false,storageError='',projects;
const element=(tag,attributes={},text='')=>{
  const node=document.createElement(tag);
  for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
  node.textContent=text;return node;
};
const option=(value,text)=>element('option',{value},text);
const active=()=>state.locations.find(entry=>entry.id===state.active);
const plainText=text=>HeritagePreview.parse(text).map(glyph=>glyph.ch).join('');
const placeName=value=>{
  const name=String(value||'Not chosen').split(':').at(-1).replace(/^is_/,'').replaceAll('_',' ');
  return name.charAt(0).toUpperCase()+name.slice(1);
};
function locationDescription(entry) {
  const fields=entry.fields??{};
  const description={default:'World spawn',random:'Random place',biome:fields.target?placeName(fields.target)+' biome':'Choose a biome',structure:fields.target?placeName(fields.target)+' structure':'Choose a structure',fixed:'At '+['x','y','z'].map(key=>fields[key]??'?').join(', '),pool:'Random choice of '+entry.destinations.length+(entry.destinations.length===1?' place':' places')}[fields.type]||'Choose where players start';
  return fields.dimension&&!['minecraft:overworld','overworld'].includes(fields.dimension)?placeName(fields.dimension)+' · '+description:description;
}
function renderOverview() {
  const list=$('location-summary');list.replaceChildren();
  if(!state.locations.length)list.append(element('li',{class:'hint'},'Your starting locations will appear here.'));
  for(const entry of state.locations) {
    const row=element('li'),button=element('button',{type:'button','data-review-location':entry.id,'aria-current':String(entry.id===state.active)});
    button.append(element('strong',{},entry.fields.title||'Unnamed location'),element('span',{class:'summary-detail'},locationDescription(entry)));
    const intro=catalog.intros.find(draft=>draft.id===entry.intro);
    const overrides=entry.fields.type==='pool'?entry.destinations.filter(destination=>Object.hasOwn(destination,'intro')&&destination.intro!=='').length:0;
    button.append(element('span',{class:'summary-detail'},(entry.fields.type==='pool'?'Default intro: ':'Intro: ')+(intro?.name||(entry.intro?'Missing intro':'None'))+(overrides?' · '+overrides+' place override'+(overrides===1?'':'s'):'')));
    const ids=entry.kitMode==='selected'?entry.kits:state.kits.filter(kit=>kit.included).map(kit=>kit.id);
    const names=ids.map(id=>id==='bundled-empty'?'Heritage Empty-handed':catalog.kits.find(draft=>draft.id===id)?.name||'Missing kit');
    if(entry.kitMode!=='selected'&&state.keepKits)names.push('Heritage Empty-handed');
    button.append(element('span',{class:'summary-detail'},'Kits: '+(names.join(', ')||'Choose a kit')));
    row.append(button);list.append(row);
  }
  if(state.keepLocations)list.append(element('li',{class:'hint'},'Also includes Heritage’s 4 default starting locations.'));
}

function loadCatalog() {
  const errors=[];
  for(const [kind,key] of [['kits','heritage.kitCreator.v1'],['intros','heritage.introEditor.v1']]) {
    try {
      const result=P.drafts(localStorage.getItem(key),kind,validators);
      catalog[kind]=result.entries;if(result.error)errors.push(result.error);
    }catch(error){catalog[kind]=[];errors.push('Could not read saved '+kind+': '+error.message);}
  }
  catalog.kits.unshift(P.copy(P.emptyKit));
  $('library-status').textContent=errors.join(' ');
}
function uniquePath(name) {
  const base=P.slug(name),used=new Set(state.kits.map(entry=>entry.path));
  let value=base,index=2;while(used.has(value))value=base+'_'+index++;
  return value;
}
function discoverKits() {
  for(const draft of catalog.kits)if(!state.kits.some(entry=>entry.id===draft.id)) {
    state.kits.push({id:draft.id,path:uniquePath(draft.name),included:false});
  }
}
function freshState() {
  const first=P.location(crypto.randomUUID());
  return {version:1,name:'My Heritage pack',namespace:'heritage_'+crypto.randomUUID().replaceAll('-',''),description:'Custom Heritage starting locations and kits',keepLocations:false,keepKits:false,kits:[],locations:[first],active:first.id};
}
function loadAssembly() {
  try {
    projects=new HeritageProject.Projects(localStorage,freshState());
    return projects.state();
  }catch(error) {
    saveBlocked=true;storageError='Your saved packs could not be opened and have been kept. Save project to back up new work. '+error.message;
    return freshState();
  }
}
function projectOptions() {
  const select=$('pack-projects');
  const names=new Map();
  select.replaceChildren(...(projects?.projects??[]).map(entry=>{
    const name=entry.id===projects.active?state.name:entry.state.name,count=(names.get(name)??0)+1;names.set(name,count);
    return option(entry.id,name+(count>1?' ('+count+')':''));
  }));
  select.value=projects?.active??'';select.disabled=saveBlocked;
}
function save() {
  clearTimeout(saveTimer);
  if(saveBlocked){$('save-status').textContent=storageError;return;}
  try{projects.update(state);projects.save();projectOptions();$('save-status').textContent='Saved in this browser';}
  catch(error){$('save-status').textContent='Your changes could not be saved. Download a copy. '+error.message;}
}
function changed() {
  $('export-status').textContent='';
  locationOptions();projectOptions();renderOutput();
  if(!saveBlocked)$('save-status').textContent='Saving…';
  clearTimeout(saveTimer);saveTimer=setTimeout(save,350);
}
function renderKits() {
  const container=$('kit-library');container.replaceChildren();
  for(const selection of state.kits) {
    const draft=catalog.kits.find(entry=>entry.id===selection.id),name=draft?.name??'Missing saved kit';
    const row=element('div',{class:'kit-library-row'}),label=element('label',{class:'check'}),check=element('input',{type:'checkbox','data-include-kit':selection.id,'aria-label':'Include '+name});
    check.checked=selection.included;label.append(check,document.createTextNode(name));row.append(label);
    const settings=element('details',{class:'kit-file-settings'});settings.hidden=!selection.included;settings.append(element('summary',{},'File name'));
    const pathLabel=element('label',{class:'stack'},'File name (without .json)'),input=element('input',{type:'text',value:selection.path,'data-kit-path':selection.id,'aria-label':name+' file name',spellcheck:'false'});
    pathLabel.append(input);settings.append(pathLabel);row.append(settings);
    if(!draft||draft.error)row.append(element('p',{class:'hint error'},draft?.error??'Open this kit in the kit creator to fix it, or untick it here.'));
    else if(draft.id===P.emptyKit.id)row.append(element('p',{class:'hint'},'Start without any items.'));
    if(draft&&draft.id!==P.emptyKit.id)row.append(element('a',{class:'library-edit',href:'kit-editor.html?draft='+encodeURIComponent(draft.id)},'Edit kit'));
    container.append(row);
  }
}
function renderIntros() {
  const list=$('intro-library');list.replaceChildren();
  if(!catalog.intros.length)list.append(element('li',{},'No saved intros yet. Create one in the intro editor, then refresh your saved work.'));
  for(const draft of catalog.intros) {
    const row=element('li');row.append(element('strong',{},draft.name));
    row.append(element('p',{class:'hint'+(draft.error?' error':'')},draft.error||plainText(draft.document.text)));
    row.append(element('a',{class:'library-edit',href:'gallery.html?draft='+encodeURIComponent(draft.id)},'Edit intro'));list.append(row);
  }
}
function locationOptions() {
  const field=$('locations');
  field.replaceChildren(...state.locations.map(entry=>option(entry.id,entry.fields.title||entry.path||'Untitled location')));
  field.value=state.active;
}
function showType() {
  const type=active()?.fields.type??'default';
  document.querySelectorAll('[data-location-types]').forEach(node=>{node.hidden=!node.dataset.locationTypes.split(' ').includes(type);});
  document.querySelector('[data-location-field=target]').setAttribute('list',type+'-choices');
  $('target-label').textContent=type==='structure'?'Structure':'Biome';
  $('target-help').textContent=type==='structure'?'For example, minecraft:village_plains. Use #minecraft:village for any village type.':'For example, minecraft:forest. Use #minecraft:is_forest for any forest type.';
}
function introOptions() {
  const entry=active();if(!entry)return;
  $('location-intro-label').textContent=entry.fields.type==='pool'?'Default intro for this pool':'Play this intro';
  const field=$('location-intro');field.replaceChildren(option('','No intro'),...catalog.intros.map(draft=>option(draft.id,draft.name+(draft.error?' (needs fixing)':''))));
  if(entry.intro&&!catalog.intros.some(draft=>draft.id===entry.intro))field.append(option(entry.intro,'Missing saved intro'));
  field.value=entry.intro;
  const draft=catalog.intros.find(draft=>draft.id===entry.intro);
  $('intro-status').textContent=draft?.error||(draft?.document?plainText(draft.document.text):entry.intro?'This intro is missing. Choose another or select No intro.':entry.fields.type==='pool'?'Places using the pool’s default will start without an intro.':'Players will start without an intro.');
  $('intro-status').classList.toggle('error',!!draft?.error||!!entry.intro&&!draft);
  $('use-spawn-settings').hidden=!draft?.spawn||!!draft.error;
  $('spawn-settings-help').hidden=$('use-spawn-settings').hidden;
}
function kitChoices() {
  const entry=active(),container=$('location-kits');container.replaceChildren();if(!entry)return;
  container.hidden=entry.kitMode!=='selected';
  const choices=state.kits.filter(kit=>kit.included).map(kit=>({id:kit.id,name:catalog.kits.find(draft=>draft.id===kit.id)?.name??'Missing saved kit'}));
  if(state.keepKits)choices.push({id:'bundled-empty',name:'Heritage Empty-handed'});
  for(const id of entry.kits)if(!choices.some(kit=>kit.id===id))choices.push({id,name:'Missing or excluded kit',missing:true});
  if(!choices.length)container.append(element('p',{class:'hint'},'Tick a kit in step 1 first.'));
  for(const kit of choices) {
    const label=element('label',{class:'check'+(kit.missing?' location-kit-missing':'')});
    const input=element('input',{type:'checkbox','data-allowed-kit':kit.id});input.checked=entry.kits.includes(kit.id);
    label.append(input,document.createTextNode(kit.name));container.append(label);
  }
}
function inputField(label,key,value,index,number=false,placeholder='') {
  const wrapper=element('label',{class:'stack'},label);
  const input=element('input',{type:number?'number':'text','data-destination':String(index),'data-destination-field':key,placeholder,spellcheck:'false'});
  if(key==='dimension')input.setAttribute('list','dimension-choices');
  if(key==='target')input.setAttribute('list',(active()?.destinations[index]?.type??'biome')+'-choices');
  if(number)input.step='1';input.value=value??'';wrapper.append(input);return wrapper;
}
function destinationType(row,index,type) {
  row.querySelectorAll('[data-pool-types]').forEach(node=>{node.hidden=!node.dataset.poolTypes.split(' ').includes(type);});
}
function renderPool() {
  const container=$('pool-destinations');container.replaceChildren();
  const entry=active();if(!entry)return;
  entry.destinations.forEach((destination,index)=>{
    const row=element('div',{class:'pool-destination'}),heading=element('div',{class:'section-heading'});
    heading.append(element('h3',{},'Place '+(index+1)),element('button',{type:'button','data-remove-destination':String(index),'aria-label':'Remove place '+(index+1)},'Remove'));row.append(heading);
    const label=element('label',{class:'stack'},'Start at');
    const select=element('select',{'data-destination':String(index),'data-destination-field':'type','aria-label':'Place '+(index+1)+' start at'});
    for(const [value,name] of [['default','The world spawn'],['random','A random place'],['biome','A biome'],['structure','A structure'],['fixed','Exact coordinates']])select.append(option(value,name));
    select.value=destination.type;label.append(select);row.append(label);
    const target=inputField(destination.type==='structure'?'Structure':'Biome','target',destination.target,index,false,destination.type==='structure'?'minecraft:village_plains':'minecraft:forest');target.dataset.poolTypes='biome structure';row.append(target);
    const coords=element('div',{class:'coordinates','data-pool-types':'fixed'});
    for(const key of ['x','y','z'])coords.append(inputField(key.toUpperCase(),key,destination[key],index,true));
    row.append(coords);
    const options=element('details',{class:'destination-options'});options.append(element('summary',{},'More options for this place'));
    const grid=element('div',{class:'form-grid'});
    grid.append(inputField('Dimension (optional)','dimension',destination.dimension,index,false,'Same as this location'));
    for(const [key,name] of [['search_radius','Search distance (blocks)'],['random_radius','Random spawn distance (blocks)']])grid.append(inputField(name,key,destination[key],index,true,'Use location setting'));
    const piece=inputField('Preferred building piece (optional)','piece',destination.piece,index);piece.dataset.poolTypes='structure';grid.append(piece);
    options.append(grid);row.append(options);
    const introLabel=element('label',{class:'stack'},'Intro for place '+(index+1));
    const intro=element('select',{'data-destination':String(index),'data-destination-field':'intro'});
    intro.append(option('','Use the pool’s default intro'),option(':none','No intro'),...catalog.intros.map(draft=>option(draft.id,draft.name+(draft.error?' (needs fixing)':''))));
    const value=destination.intro;
    if(value&&typeof value==='object')intro.append(option(':imported','Imported intro'));
    else if(value&&!catalog.intros.some(draft=>draft.id===value))intro.append(option(value,'Missing saved intro'));
    intro.value=value===null?':none':typeof value==='object'?':imported':value??'';
    introLabel.append(intro);row.append(introLabel);
    const draft=catalog.intros.find(draft=>draft.id===(value||entry.intro));
    const text=value===null?'Players will start here without an intro.':value&&typeof value==='object'?plainText(value.text??''):draft?.error||plainText(draft?.document?.text??'');
    const status=element('p',{class:'intro-excerpt hint'},text||(value?'This intro is missing. Choose another intro.':entry.intro?'The pool’s default intro is missing.':'The pool has no default intro.'));
    status.classList.toggle('error',value!==null&&typeof value!=='object'&&(!!draft?.error||!!(value||entry.intro)&&!draft));
    row.append(status);container.append(row);destinationType(row,index,destination.type);
  });
}
function renderLocation() {
  locationOptions();renderOverview();
  const entry=active();$('location-empty').hidden=!!entry;$('location-form').hidden=!entry;$('delete-location').disabled=!entry;
  if(!entry)return;
  $('location-id').value=entry.path;
  document.querySelectorAll('[data-location-field]').forEach(field=>{field.value=entry.fields[field.dataset.locationField]??'';});
  $('kit-mode').value=entry.kitMode;
  showType();introOptions();kitChoices();renderPool();
  if(output){$('export-file').value='data/'+state.namespace+'/heritage/spawns/'+entry.path+'.json';previewFile();}
}
function previewFile() {
  const file=output.files.find(entry=>entry.path===$('export-file').value);
  $('copy').disabled=!file;$('copy-status').textContent='';
  $('export-json').value=file?.content??'';code.sync();$('export-json').scrollTop=0;
  if(!file)$('line-count').textContent='';
}
function renderOutput() {
  output=P.build(state,catalog);renderOverview();
  for(const field of document.querySelectorAll('[data-location-field],[data-destination-field]')) {
    const issue=output.issues.find(issue=>issue.locationId===state.active&&issue.field===(field.dataset.destinationField??field.dataset.locationField)&&(issue.destination===undefined?!field.hasAttribute('data-destination'):issue.destination===Number(field.dataset.destination)));
    field.setAttribute('aria-invalid',String(!!issue));
    const errorId='location-error-'+(field.dataset.destination??'main')+'-'+(field.dataset.destinationField??field.dataset.locationField);
    let message=document.getElementById(errorId);
    const label=field.closest('label');
    field.setAttribute('aria-label',[...label.childNodes].filter(node=>node.nodeType===3||node.nodeName==='SPAN').map(node=>node.textContent).join('').trim());
    if(!message){message=element('p',{class:'field-error',id:errorId});label.append(message);}
    message.textContent=issue?.message??'';message.hidden=!issue;
    field.setAttribute('aria-describedby',(field.dataset.locationField==='target'?'target-help ':'')+message.id);
  }
  $('export-pack').disabled=!!output.errors.length;
  $('export-file').disabled=!!output.errors.length;
  $('preview-state').textContent=output.errors.length?'Complete the fields to see JSON':'Read-only preview';
  $('pack-summary').textContent=output.locationCount+' starting location'+(output.locationCount===1?'':'s')+' · '+output.kitCount+' kit'+(output.kitCount===1?'':'s');
  $('export-readiness').textContent=output.errors.length?'A few things need fixing before you download.':'Files checked for Minecraft 1.21.1. Test the installed pack in-game.';
  const errors=$('export-errors');errors.replaceChildren();
  if(output.errors.length) {
    errors.append(element('p',{},'Before downloading:'));
    const list=element('ul');for(const error of output.errors)list.append(element('li',{},error));errors.append(list);
  }
  $('export-warnings').replaceChildren(...output.warnings.map(warning=>element('li',{},warning)));
  const select=$('export-file'),previous=select.value;
  select.replaceChildren(...output.files.map(file=>option(file.path,file.path)));
  const current='data/'+state.namespace+'/heritage/spawns/'+active()?.path+'.json';
  if(output.files.some(file=>file.path===previous))select.value=previous;
  else if(output.files.some(file=>file.path===current))select.value=current;
  previewFile();
}
function render() {
  for(const [id,key] of [['pack-name','name'],['namespace','namespace'],['pack-description','description']])$(id).value=state[key];
  $('allow-custom-targets').checked=state.allowCustomTargets===true;
  $('keep-locations').checked=state.keepLocations;$('keep-kits').checked=state.keepKits;
  projectOptions();renderKits();renderIntros();renderLocation();renderOutput();
}
function refresh() {loadCatalog();discoverKits();renderKits();renderIntros();introOptions();kitChoices();renderPool();changed();}
$('refresh-drafts').addEventListener('click',()=>{refresh();$('export-status').textContent='Your latest saved kits and intros are ready.';});
$('new-pack').addEventListener('click',()=>$('new-pack-dialog').showModal());
$('confirm-new-pack').addEventListener('click',()=>{
  clearTimeout(saveTimer);
  if(saveBlocked){$('export-status').textContent=storageError;return;}
  save();loadCatalog();state=freshState();projects.add(state);discoverKits();
  output=null;saveBlocked=false;storageError='';$('export-file').replaceChildren();
  document.querySelectorAll('.pack-options,.destination-options,.extra-settings').forEach(details=>{details.open=false;});
  $('new-pack-dialog').close();render();save();
  $('export-status').textContent='New pack ready. Your saved kits and intros are still available.';
  $('pack-name').focus();$('pack-name').select();
});
window.addEventListener('storage',event=>{if(['heritage.kitCreator.v1','heritage.introEditor.v1'].includes(event.key))refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
for(const [id,key] of [['pack-name','name'],['namespace','namespace'],['pack-description','description']])$(id).addEventListener('input',event=>{state[key]=event.target.value;changed();});
for(const [id,key] of [['keep-locations','keepLocations'],['keep-kits','keepKits'],['allow-custom-targets','allowCustomTargets']])$(id).addEventListener('change',event=>{state[key]=event.target.checked;kitChoices();changed();});
$('kit-library').addEventListener('change',event=>{
  if(!event.target.hasAttribute('data-include-kit'))return;
  state.kits.find(kit=>kit.id===event.target.dataset.includeKit).included=event.target.checked;event.target.closest('.kit-library-row').querySelector('.kit-file-settings').hidden=!event.target.checked;kitChoices();changed();
});
$('kit-library').addEventListener('input',event=>{
  if(!event.target.hasAttribute('data-kit-path'))return;
  state.kits.find(kit=>kit.id===event.target.dataset.kitPath).path=event.target.value;changed();
});
$('location-summary').addEventListener('click',event=>{
  const button=event.target.closest('[data-review-location]');if(!button)return;
  state.active=button.dataset.reviewLocation;renderLocation();save();$('locations').focus();
});
$('locations').addEventListener('change',event=>{state.active=event.target.value;renderLocation();save();});
$('new-location').addEventListener('click',()=>{
  let index=state.locations.length+1;while(state.locations.some(entry=>entry.path==='location_'+index))index++;
  const entry=P.location(crypto.randomUUID(),index);state.locations.push(entry);state.active=entry.id;renderLocation();changed();document.querySelector('[data-location-field=title]').focus();
});
$('delete-location').addEventListener('click',()=>{
  const entry=active();if(!entry)return;
  $('delete-location-message').textContent='Remove '+(entry.fields.title||entry.path)+' from this assembly? Your saved kits and intros will be kept.';$('delete-location-dialog').showModal();
});
$('confirm-delete-location').addEventListener('click',()=>{
  state.locations=state.locations.filter(entry=>entry.id!==state.active);state.active=state.locations[0]?.id??'';$('delete-location-dialog').close();renderLocation();changed();
});
$('location-form').addEventListener('submit',event=>event.preventDefault());
$('location-form').addEventListener('input',event=>{
  const entry=active(),field=event.target;if(!entry)return;
  if(field.hasAttribute('data-location-field')) {
    const key=field.dataset.locationField;entry.fields[key]=field.validity.badInput?'invalid':field.value;
    if(key==='type') {
      if(field.value==='fixed')for(const [key,value] of [['x','0'],['y','64'],['z','0']])if(entry.fields[key]===undefined)entry.fields[key]=value;
      if(field.value==='pool'&&!entry.destinations.length)entry.destinations.push({type:'biome',target:'minecraft:plains'});
      renderLocation();
    }
  } else if(field.id==='location-id')entry.path=field.value;
  else if(field.hasAttribute('data-destination-field')) {
    const destination=entry.destinations[Number(field.dataset.destination)],key=field.dataset.destinationField;
    if(key==='intro') {
      if(field.value==='')delete destination.intro;
      else if(field.value!==':imported')destination.intro=field.value===':none'?null:field.value;
      renderPool();
    } else destination[key]=field.validity.badInput?'invalid':field.value;
    if(key==='type') {
      for(const name of ['target','piece','x','y','z'])delete destination[name];
      if(field.value==='fixed')Object.assign(destination,{x:'0',y:'64',z:'0'});
      renderPool();
    }
  } else return;
  changed();
});
$('location-intro').addEventListener('change',event=>{active().intro=event.target.value;introOptions();renderPool();changed();});
$('use-spawn-settings').addEventListener('click',()=>{
  const entry=active(),draft=catalog.intros.find(draft=>draft.id===entry.intro);
  if(!draft?.spawn||draft.error)return;
  const next=P.importSpawn(entry,draft);state.locations[state.locations.indexOf(entry)]=next;renderLocation();changed();
});
$('kit-mode').addEventListener('change',event=>{active().kitMode=event.target.value;kitChoices();changed();});
$('location-kits').addEventListener('change',event=>{
  const id=event.target.dataset.allowedKit;if(!id)return;
  const entry=active();entry.kits=event.target.checked?[...new Set([...entry.kits,id])]:entry.kits.filter(value=>value!==id);changed();
});
$('add-destination').addEventListener('click',()=>{active().destinations.push({type:'biome',target:'minecraft:plains'});renderPool();changed();});
$('pool-destinations').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-destination]');if(!button)return;
  active().destinations.splice(Number(button.dataset.removeDestination),1);renderPool();changed();
});
$('export-file').addEventListener('change',previewFile);
$('copy').addEventListener('click',async()=>{
  if($('copy').disabled)return;
  const file=output.files.find(entry=>entry.path===$('export-file').value);if(!file)return;
  try{await navigator.clipboard.writeText(file.content);HeritageIcons.copied($('copy'));}
  catch(failure){$('export-json').focus();$('export-json').select();$('copy-status').textContent='Copy the selected JSON with Ctrl+C.';}
});
$('export-pack').addEventListener('click',()=>{
  refresh();if(output.errors.length)return;
  try {
    const bytes=HeritageZip.zip(output.files),blob=new Blob([bytes],{type:'application/zip'}),url=URL.createObjectURL(blob),link=element('a',{href:url,download:P.slug(state.name)+'.zip'});
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('export-status').textContent='Downloaded '+P.slug(state.name)+'.zip. Put it in your world’s datapacks folder.';
    save();
  }catch(error){$('export-status').textContent='Could not download your pack: '+error.message;}
});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
$('pack-projects').addEventListener('change',event=>{
  const id=event.target.value;save();
  projects.active=id;state=projects.state();discoverKits();render();save();
});
$('save-project').addEventListener('click',()=>{
  try {
    save();
    const read=key=>JSON.parse(localStorage.getItem(key)??'null');
    const backup=HeritageProject.backup(state,read(HeritageProject.keys.kits),read(HeritageProject.keys.intros));
    HeritageSession.download(backup,P.slug(state.name)+'.heritage-project.json');
    $('project-status').textContent='Project saved with all kits, intros and unfinished drafts.';
  }catch(error){$('project-status').textContent='Could not save project: '+error.message;}
});
$('open-project').addEventListener('change',async()=>{
  const file=$('open-project').files[0];if(!file)return;
  try {
    if(saveBlocked)throw new Error(storageError);
    const input=JSON.parse(await file.text());
    const restore=()=>navigator.locks.request('heritage-editor:'+HeritageProject.keys.intros,{ifAvailable:true},introLock=>{
      if(!introLock)throw new Error('Close the intro editor tab before opening a project.');
      return navigator.locks.request('heritage-editor:'+HeritageProject.keys.kits,{ifAvailable:true},kitLock=>{
        if(!kitLock)throw new Error('Close the kit creator tab before opening a project.');
        save();
        const read=key=>JSON.parse(localStorage.getItem(key)??'null');
        const result=HeritageProject.merge(input,{kits:read(HeritageProject.keys.kits),intros:read(HeritageProject.keys.intros)});
        const previous=projects.serialize();
        projects.add(result.pack);
        try{HeritageProject.write(localStorage,{[HeritageProject.keys.kits]:result.kits,[HeritageProject.keys.intros]:result.intros,[HeritageProject.keys.packs]:projects.serialize()});}
        catch(error){projects.projects=previous.projects;projects.active=previous.active;throw error;}
        state=projects.state();loadCatalog();discoverKits();render();
        $('project-status').textContent='Project opened. Existing saved work was kept.';
      });
    });
    await restore();
  }catch(error){$('project-status').textContent='Could not open project: '+error.message;}
  $('open-project').value='';
});
for(const kind of ['biome','structure','dimension']) {
  const ids=[...HeritageLocations[kind],...(HeritageLocations[kind+'Tags']??[]).map(id=>'#'+id)];
  $(kind+'-choices').replaceChildren(...ids.map(id=>option(id,placeName(id))));
}
document.querySelector('[data-location-field=dimension]').setAttribute('list','dimension-choices');
loadCatalog();state=loadAssembly();discoverKits();render();save();
const incoming=new URLSearchParams(location.search);
const kit=incoming.get('kit'),intro=incoming.get('intro');
if(kit||intro) {
  if(kit&&catalog.kits.some(entry=>entry.id===kit))state.kits.find(entry=>entry.id===kit).included=true;
  if(intro&&catalog.intros.some(entry=>entry.id===intro)) {
    if(!active()){const entry=P.location(crypto.randomUUID());state.locations.push(entry);state.active=entry.id;}
    active().intro=intro;
  }
  render();save();
  $('project-status').textContent='Saved work added to this pack. Review the starting location and kit choices.';
  window.history.replaceState(null,'',location.pathname+location.hash);
}
})();
