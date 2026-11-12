(async () => {
'use strict';
const P=HeritagePack,$=id=>document.getElementById(id),storageKey='heritage.packAssembler.v1';
if(!await HeritageSession.acquire(storageKey))return;
try{P.setBundledKits((await HeritageFlowPreview.defaults()).kits);}
catch(error){$('project-status').textContent=error.message;return;}
const validators={kit:source=>HeritageKit.read(source),intro:source=>HeritagePreview.readJson(source)};
const code=new HeritageJsonEditor($('export-json'),$('line-count'));
HeritageIcons.action('copy','copy','Copy JSON');
let catalog={kits:[],intros:[]},state,output,saveTimer,saveBlocked=false,storageError='',projects,openingProject=false;
const bundledKit=id=>P.bundledKits(state).find(entry=>entry.id===id);
const kitDraft=id=>catalog.kits.find(entry=>entry.id===id)??bundledKit(id);
const kitName=id=>kitDraft(id)?.name??'Missing kit';
const W=HeritageWorkflow,route=new URLSearchParams(location.search),touched=new Set();
const saveMessage=$('nav-save-message'),saveSources=[$('project-status'),$('embedded-editor-status'),$('save-status')];
new MutationObserver(()=>{const source=saveSources.find(node=>node.textContent),message=source?.textContent??'';if(saveMessage.textContent!==message)saveMessage.textContent=message;saveMessage.title=source?.title||message;}).observe(saveMessage.parentElement,{childList:true,subtree:true});
let currentStep='pack',revealValidation=false,previewed='',previewing='',embeddedSession=null,locationPart=['details','kits','intro'].includes(route.get('part'))?route.get('part'):'details',renderedLocation='',returnToReview=false,reviewReturn=null,locationParts=new Map(),editorStages=new Map();
const element=(tag,attributes={},text='')=>{
  const node=document.createElement(tag);
  for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
  node.textContent=text;return node;
};
const option=(value,text)=>element('option',{value},text);
const dimensionOptions=[['minecraft:overworld','Overworld','grass_block'],['minecraft:the_nether','Nether','netherrack'],['minecraft:the_end','End','end_stone']];
const active=()=>state.locations.find(entry=>entry.id===state.active);
const orderedLocations=()=>[...state.locations].sort((a,b)=>(Number(a.fields.order)||0)-(Number(b.fields.order)||0)||(a.path<b.path?-1:a.path>b.path?1:0));
const pictureRequests=new WeakMap(),picturePreviews=new WeakMap();
let packTools,coverageView,contentBrowser,pendingContentFocus,cardFits=new Map(),historyGroup='',historyLabel='',historyDrafts=[];
const plainText=text=>HeritagePreview.parse(text).map(glyph=>glyph.ch).join('');
const placeName=value=>{
  const name=String(value||'Not chosen').split(':').at(-1).replace(/^is_/,'').replaceAll('_',' ');
  return name.charAt(0).toUpperCase()+name.slice(1);
};
function editorUrl(kind,draft,create=false){return W.editorUrl(kind,{draft,create,packId:projects?.active,locationId:state.active});}
function fingerprint(){const {active,...pack}=state;return JSON.stringify([pack,catalog]);}
function fieldKey(field){return (field.hasAttribute('data-location-field')||field.hasAttribute('data-destination-field')||['location-id','kit-mode','location-intro'].includes(field.id)?state.active:'pack')+':'+(field.dataset.destination??'')+':'+(field.id||field.dataset.locationField||field.dataset.destinationField||field.dataset.kitPath);}
function setLocationPart(value,{route=true}={}){
  if(!['details','kits','intro'].includes(value))value='details';
  if(embeddedSession&&value!==(embeddedSession.kind==='kit'?'kits':'intro')&&!closeEmbedded())return;locationPart=value;if(state?.active)locationParts.set(state.active,value);
  for(const panel of document.querySelectorAll('[data-location-section]'))panel.hidden=panel.dataset.locationSection!==value;
  for(const button of document.querySelectorAll('[data-location-section-button]'))if(button.dataset.locationSectionButton===value)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  if(route){const url=new URL(location.href);url.searchParams.set('part',value);history.replaceState(null,'',url);}
  if(output)renderCard();updateSteps();
}
function syncEmbedded(status){
  const session=embeddedSession;if(!session||status.kind!==session.kind||projects?.active!==session.packId||state.active!==session.locationId)return;
  const previousId=session.id;loadCatalog();discoverKits();const draft=catalog[session.kind==='kit'?'kits':'intros'].find(entry=>entry.id===status.id);if(!draft)return;
  if(status.attach){if(session.kind==='intro'&&Number.isInteger(session.destination)){const destination=active().destinations[session.destination];if(!destination)return;destination.intro=status.id;}else W.attach(state,session.kind,status.id);$('content-editor').contentWindow.postMessage({type:'heritage:author-connected',token:session.token,id:status.id},location.origin);}
  session.id=status.id;$('embedded-editor').dataset.ready='true';$('embedded-editor-status').textContent=status.valid?'':'Draft saved. Resolve its issues before previewing.';
  historyDrafts=[...new Set([previousId,status.id].filter(Boolean))].map(id=>({kind:session.kind==='kit'?'kits':'intros',id}));historyGroup='draft:'+session.kind+':'+status.id;historyLabel='Edit '+session.kind;
  renderKits();renderIntros();kitChoices();introOptions();renderPool();changed();
  if(pendingContentFocus?.token===session.token){const field=$('content-editor').contentDocument?.getElementById(pendingContentFocus.field);if(field){field.focus({preventScroll:true});field.select?.();pendingContentFocus=null;}}
  const url=new URL(location.href);url.searchParams.set('editing',session.kind);url.searchParams.set('entry',status.id);if(Number.isInteger(session.destination))url.searchParams.set('destination',String(session.destination));history.replaceState(null,'',url);
}
function flushEmbedded(){
  if(!embeddedSession)return true;const editor=$('content-editor').contentWindow?.HeritageEmbeddedEditor;if(!editor)return true;
  const status=editor.flush();if(!status.persisted){$('embedded-editor-status').textContent='The draft could not be saved. Keep a JSON copy before leaving this editor.';return false;}syncEmbedded(status);return true;
}
function closeEmbedded(){
  if(!embeddedSession)return true;if(!flushEmbedded())return false;workspaceVisuals.detach();const frame=$('content-editor');embeddedSession=null;
  const replacement=frame.cloneNode(false);replacement.removeAttribute('src');frame.replaceWith(replacement);$('embedded-editor').hidden=true;$('close-embedded-editor').hidden=true;$('embedded-editor-status').textContent='';document.body.classList.remove('editor-open');delete document.body.dataset.editorKind;refreshShared();renderContentBrowser();updateSteps();
  const url=new URL(location.href);url.searchParams.delete('editing');url.searchParams.delete('entry');url.searchParams.delete('destination');history.replaceState(null,'',url);return true;
}
function openEmbedded(kind,id,create=false,destination=null,returnPart=locationPart){
  if(!active()){setStep('locations');$('new-location').focus();return;}
  if(!closeEmbedded())return;packTools?.observe();if(currentStep!=='locations')setStep('locations');setLocationPart(kind==='kit'?'kits':'intro');save();
  const token=crypto.randomUUID(),url=new URL(editorUrl(kind,id,create),location.href);url.searchParams.set('embedded','1');url.searchParams.set('session',token);if(create){url.searchParams.set('attach','1');url.searchParams.set('name',W.entryName((active().fields.title||'Location')+(Number.isInteger(destination)?' place '+(destination+1):''),kind,catalog[kind==='kit'?'kits':'intros'].map(entry=>entry.name)));}
  if(id&&editorStages.has(kind+':'+id))url.searchParams.set('edit',editorStages.get(kind+':'+id));
  embeddedSession={kind,id,token,destination,returnPart,packId:projects.active,locationId:state.active};$('embedded-editor').hidden=false;$('embedded-editor').dataset.ready='false';$('close-embedded-editor').hidden=false;$('project-status').textContent='';document.body.classList.add('editor-open');document.body.dataset.editorKind=kind;$('embedded-editor-status').textContent='Opening '+(kind==='kit'?'kit':'intro')+' editor…';
  $('content-editor').title=(kind==='kit'?'Kit':'Intro')+' editor for '+active().fields.title;$('content-editor').style.height=innerWidth>=1200?'100%':'640px';$('content-editor').src=url.href;
  document.body.classList.remove('content-browser-open');refreshShared();updateSteps();renderContentBrowser();renderCard();$('pack-content').scrollTop=0;
}
window.addEventListener('message',event=>{
  if(!embeddedSession||event.source!==$('content-editor').contentWindow||event.origin!==location.origin||event.data?.token!==embeddedSession.token)return;
  if(event.data.type==='heritage:author-search')focusContentSearch();
  if(event.data.type==='heritage:author-stage'&&typeof event.data.id==='string'&&typeof event.data.stage==='string')editorStages.set(embeddedSession.kind+':'+event.data.id,event.data.stage);
  if(event.data.type==='heritage:author-size'&&Number.isFinite(event.data.height)&&innerWidth<1200)$('content-editor').style.height=Math.max(480,Math.ceil(event.data.height))+'px';
  if(event.data.type==='heritage:author-save-status'&&typeof event.data.message==='string')$('embedded-editor-status').textContent=event.data.message==='Draft saved'?(event.data.valid?'':'Draft saved. Resolve its issues before previewing.'):event.data.message;
  if(event.data.type==='heritage:author-saved')syncEmbedded(event.data);
});
function finishEmbedded(){
  const session=embeddedSession,kind=session?.kind;if(!kind||!closeEmbedded())return;
  if(returnToReview){setStep('preview');return;}
  setLocationPart(session.returnPart);renderLocation();updateSteps();const target=kind==='kit'?document.querySelector('#location-kits a'):$('edit-location-intro');(target??$('location-editor')).focus({preventScroll:true});
}
$('close-embedded-editor').addEventListener('click',finishEmbedded);
$('editor-new-entry').addEventListener('click',()=>{const session=embeddedSession;if(session&&closeEmbedded())openEmbedded(session.kind,null,true,session.destination,session.returnPart);});
for(const button of document.querySelectorAll('[data-location-section-button]'))button.addEventListener('click',()=>{if(closeEmbedded())setLocationPart(button.dataset.locationSectionButton);});
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href,location.href);if(url.origin!==location.origin||!['kit-editor.html','gallery.html'].some(file=>url.pathname.endsWith('/'+file)))return;
  event.preventDefault();const kind=url.pathname.endsWith('/kit-editor.html')?'kit':'intro',draft=url.searchParams.get('draft'),stage=url.searchParams.get('edit');if(stage&&draft)editorStages.set(kind+':'+draft,stage);openEmbedded(kind,draft,url.searchParams.get('create')==='1',link.hasAttribute('data-destination-intro')?Number(link.dataset.destinationIntro):null);
});
function updateSteps(){
  const navigation=W.navigation(currentStep,locationPart,embeddedSession?.kind,returnToReview);$('toggle-content-browser').hidden=currentStep!=='locations';updateContentBrowser();
  $('step-back').hidden=currentStep==='pack'||!!embeddedSession;$('step-next').hidden=currentStep==='export'||!!embeddedSession;
  const blocked=currentStep==='preview'&&output?.errors.length;
  $('step-back').textContent='Back';$('step-back').setAttribute('aria-label',navigation.backLabel);$('step-next').textContent=currentStep==='locations'&&!active()?(state.keepLocations?'Review and preview':'Add a location'):navigation.nextLabel;
  if(blocked)$('step-next').textContent='Fix '+output.errors.length+' issue'+(output.errors.length===1?'':'s');$('step-next').disabled=currentStep==='preview'&&state.locations.some(entry=>pictureRequests.has(entry));
  $('close-embedded-editor').hidden=!embeddedSession;$('close-embedded-editor').disabled=!!embeddedSession&&$('embedded-editor').dataset.ready!=='true';$('editor-new-entry').hidden=!embeddedSession;$('editor-new-entry').disabled=$('close-embedded-editor').disabled;
  $('editor-new-entry').textContent='New '+(embeddedSession?.kind??'entry');document.querySelector('.pack-history-actions').hidden=!!embeddedSession;
  $('step-status').textContent=embeddedSession?'Editing '+embeddedSession.kind+' · '+(active()?.fields.title||'Untitled location'):currentStep==='locations'?(active()?.fields.title||'Starting locations')+' · '+({details:'Location',kits:'Kits',intro:'Intro'}[locationPart]):'Step '+(W.steps.indexOf(currentStep)+1)+' of '+W.steps.length;
}
function advance(direction){
  if(currentStep==='preview'&&direction==='next'&&output?.errors.length){document.querySelector('#export-errors button')?.click();return;}
  if(currentStep==='locations'&&!active()&&direction==='next'){if(state.keepLocations)setStep('preview');else $('new-location').click();return;}
  const target=W.navigation(currentStep,locationPart,embeddedSession?.kind,returnToReview)[direction];if(target==='finish'){finishEmbedded();return;}
  if(['details','kits','intro'].includes(target)){setLocationPart(target);$('pack-content').scrollTop=0;document.querySelector('[data-location-section-button="'+target+'"]').focus({preventScroll:true});}else setStep(target);
}
function setStep(value,{history=true,focus=true}={}){
  if(!closeEmbedded())return;const restoreReview=value==='preview'&&returnToReview?reviewReturn:null;
  if(history)$('project-status').textContent='';
  currentStep=W.step(value);if(currentStep!=='locations')returnToReview=false;if(['preview','export'].includes(currentStep))revealValidation=true;
  for(const panel of document.querySelectorAll('[data-pack-panel]'))panel.hidden=panel.dataset.packPanel!==currentStep;
  for(const button of document.querySelectorAll('[data-pack-step]'))if(button.dataset.packStep===currentStep)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
  updateSteps();if(output)renderOutput();
  if(history){const url=new URL(location.href);url.searchParams.set('step',currentStep);if(projects)url.searchParams.set('pack',projects.active);if(state.active)url.searchParams.set('location',state.active);window.history.pushState(null,'',url);}
  $('pack-content').scrollTop=restoreReview?.scrollTop??0;
  const returnTarget=restoreReview?document.querySelector('[data-review-location="'+CSS.escape(restoreReview.locationId??'')+'"]'):null;
  if(focus){if(returnTarget){returnTarget.focus({preventScroll:true});returnTarget.scrollIntoView({block:'nearest'});}else document.getElementById(document.querySelector('[data-pack-panel="'+currentStep+'"]').getAttribute('aria-labelledby')).focus({preventScroll:true});}if(restoreReview)reviewReturn=null;
}
function showKitLibrary(id,path=false){
  document.body.classList.remove('content-browser-collapsed');$('clear-content-search').click();document.querySelector('.pack-library').open=true;updateContentBrowser();
  const field=id?document.querySelector('['+(path?'data-kit-path':'data-include-kit')+'="'+CSS.escape(id)+'"]'):document.querySelector('[data-include-kit]');
  if(field){for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field.focus({preventScroll:true});field.scrollIntoView({block:'nearest'});}
}
function fixIssue(issue){
  const returning=['preview','export'].includes(currentStep);if(returning)reviewReturn={locationId:issue.locationId??W.usage(state,'kit',issue.kitId)[0]?.id??state.active,scrollTop:currentStep==='preview'?$('pack-content').scrollTop:0};
  if(issue.kitId){
    const location=W.usage(state,'kit',issue.kitId)[0];if(location){state.active=location.id;renderLocation();}setStep('locations');setLocationPart('kits');returnToReview=returning;updateSteps();
    if(issue.field!=='path'&&catalog.kits.some(draft=>draft.id===issue.kitId))openEmbedded('kit',issue.kitId);else showKitLibrary(issue.kitId,issue.field==='path');return;
  }
  if(issue.locationId){state.active=issue.locationId;renderLocation();setStep('locations');}
  else setStep(['name','namespace','description','guiScale','kitPreview'].includes(issue.field)?'pack':'locations');
  if(issue.locationId)setLocationPart(issue.field==='intro'?'intro':issue.field==='kits'?'kits':'details');returnToReview=returning;updateSteps();
  const selector=issue.locationId?(issue.destination!==undefined?'[data-destination="'+issue.destination+'"][data-destination-field="'+issue.field+'"]':issue.field==='path'?'#location-id':issue.field==='intro'?'#location-intro':issue.field==='kits'?'#kit-mode':'[data-location-field="'+issue.field+'"]'):({'name':'#pack-name','namespace':'#namespace','description':'#pack-description','guiScale':'#pack-gui-scale','kitPreview':'#pack-kit-preview'})[issue.field]??'#kit-mode';
  const field=document.querySelector(selector)??$('kit-mode');for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field.focus();
}
function locationDescription(entry) {
  const fields=entry.fields??{};
  const description={default:'World spawn',random:'Random place',biome:fields.target?placeName(fields.target)+' biome':'Choose a biome',structure:fields.target?placeName(fields.target)+' structure':'Choose a structure',fixed:'At '+['x','y','z'].map(key=>fields[key]??'?').join(', '),pool:'Random choice of '+entry.destinations.length+(entry.destinations.length===1?' place':' places')}[fields.type]||'Choose where players start';
  return fields.dimension&&!['minecraft:overworld','overworld'].includes(fields.dimension)?placeName(fields.dimension)+' · '+description:description;
}
function kitContents(kit){
  const stacks=kit?.items?.length??0,shop=kit?.shop;
  const parts=[];
  if(stacks)parts.push(stacks+' starting stack'+(stacks===1?'':'s'));
  if(shop)parts.push(shop.offers.length+' shop offer'+(shop.offers.length===1?'':'s'),shop.budget+(shop.budget===1?' point':' points'));
  return parts.join(' · ')||'No starting items';
}
function renderContentSummary(){
  const entry=active(),host=$('location-content-summary');host.replaceChildren();if(!entry)return;
  const kits=locationKitIds(entry).map(kitName),intro=catalog.intros.find(draft=>draft.id===entry.intro);
  for(const [part,label,text] of [['kits','Starting kits',kits.join(', ')||'Choose at least one kit'],['intro','Arrival intro',intro?.name||(entry.intro?'Missing saved intro':'No intro, optional')]]){const button=element('button',{type:'button','data-edit-content':part});button.append(element('strong',{},label),element('span',{},text));host.append(button);}
}
function renderOverview() {
  const list=$('location-summary'),focused=document.activeElement,focusId=list.contains(focused)?focused.closest('.review-location-entry')?.querySelector('.review-location-open').dataset.reviewLocation:null,focusAction=focusId?(focused.dataset.reviewPart??(focused.hasAttribute('data-review-test')?'test':focused.hasAttribute('data-review-issue')?'issue':'details')):null;list.replaceChildren();
  if(!state.locations.length)list.append(element('li',{class:'review-note hint'},'Add a starting location to choose its destination, kits and intro.'));
  const preparing=state.locations.some(entry=>pictureRequests.has(entry));
  for(const entry of orderedLocations()) {
    const row=element('li',{class:'review-location-entry'}),button=element('button',{type:'button',class:'review-location-open','data-review-location':entry.id,'aria-label':'Edit location '+(entry.fields.title||entry.path)}),content=element('span',{class:'review-location-content'});
    content.append(element('strong',{title:entry.fields.title||'Unnamed location'},entry.fields.title||'Unnamed location'),element('span',{class:'summary-detail'},locationDescription(entry)));
    const intro=catalog.intros.find(draft=>draft.id===entry.intro),ids=locationKitIds(entry),names=ids.map(kitName),fullKits=names.join(', ')||'Choose a kit',kits=names.slice(0,2).join(', ')+(names.length>2?' +'+(names.length-2):'');
    const overrides=entry.fields.type==='pool'?entry.destinations.filter(destination=>Object.hasOwn(destination,'intro')&&destination.intro!=='').length:0;
    const introSummary=(entry.fields.type==='pool'?'Default intro: ':'Intro: ')+(intro?.name||(entry.intro?'Missing intro':'None'))+(overrides?' · '+overrides+' place override'+(overrides===1?'':'s'):'');
    content.append(element('span',{class:'summary-detail',title:fullKits},ids.length+' kit'+(ids.length===1?'':'s')+': '+(kits||'Choose a kit')),element('span',{class:'summary-detail',title:introSummary},introSummary));
    const issues=(output?.issues??[]).filter(issue=>issue.locationId===entry.id||issue.kitId&&ids.includes(issue.kitId));
    if(issues.length)content.append(element('span',{class:'review-location-issue'},issues.length+' issue'+(issues.length===1?'':'s')+' to fix'));
    button.append(locationThumbnail(entry),content);row.append(button);const actions=element('div',{class:'review-location-actions'});
    for(const [part,label] of [['kits','Kits'],['intro',entry.intro?'Intro':'Add intro']])actions.append(element('button',{type:'button','data-review-location':entry.id,'data-review-part':part,'aria-label':(part==='intro'&&!entry.intro?'Add intro':'Edit '+part)+' for '+(entry.fields.title||entry.path)},label));
    const action=element('button',{type:'button',...(issues.length?{'data-review-issue':String(output.issues.indexOf(issues[0]))}:{'data-review-test':entry.id}),'aria-label':(issues.length?'Fix issues for ':'Preview location ')+(entry.fields.title||entry.path)},issues.length?'Fix':'Preview');action.disabled=!issues.length&&(!!output?.errors.length||preparing);if(action.disabled)action.title=preparing?'Wait for the card pictures to finish processing.':'Resolve the pack issues before previewing.';actions.append(action);row.append(actions);list.append(row);
  }
  if(state.keepLocations)list.append(element('li',{class:'review-note hint'},'Also includes Heritage’s 4 default starting locations.'));
  if(focusId){const main=list.querySelector('.review-location-open[data-review-location="'+CSS.escape(focusId)+'"]'),row=main?.parentElement,selector=focusAction==='details'?'.review-location-open':focusAction==='test'?'[data-review-test]':focusAction==='issue'?'[data-review-issue]':'[data-review-part="'+focusAction+'"]';(row?.querySelector(selector)??main)?.focus({preventScroll:true});}
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
  first.kitMode='selected';first.kits=[P.emptyKit.id];
  return {version:1,name:'My Heritage pack',namespace:'heritage_'+crypto.randomUUID().replaceAll('-',''),description:'Custom Heritage starting locations and kits',keepLocations:false,keepKits:false,kits:[{id:P.emptyKit.id,path:'empty_handed',included:true}],locations:[first],active:first.id};
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
  if(saveBlocked){$('save-status').textContent='Read only';$('save-status').title=storageError;$('project-status').textContent=storageError;return false;}
  try{projects.update(state);projects.save();projectOptions();$('save-status').textContent='Saved';$('save-status').title='Saved in this browser';return true;}
  catch(error){$('save-status').textContent='Save failed';$('save-status').title=error.message;$('project-status').textContent='Your changes could not be saved. Download a copy. '+error.message;return false;}
}
function changed() {
  packTools?.capture({drafts:historyDrafts,group:historyGroup,label:historyLabel||'Edit pack'});historyDrafts=[];historyGroup='';historyLabel='';refreshShared();
  $('project-status').textContent='';
  $('export-status').textContent='';
  projectOptions();renderOutput();
  if(!saveBlocked)$('save-status').textContent='Saving…';
  clearTimeout(saveTimer);saveTimer=setTimeout(save,350);
}
function renderKits() {
  const container=$('kit-library');container.replaceChildren();
  for(const id of P.orderedKitIds(state,catalog).filter(id=>state.kits.some(kit=>kit.id===id))) {
    const selection=state.kits.find(kit=>kit.id===id);
    const draft=catalog.kits.find(entry=>entry.id===selection.id),name=draft?.name??'Missing kit · '+selection.path;
    const row=contentNode(element('div',{class:'kit-library-row'}),'kit',selection.id),label=element('label',{class:'check'}),check=element('input',{type:'checkbox','data-include-kit':selection.id,'aria-label':'Include '+name});
    check.checked=selection.included;label.append(check,document.createTextNode(name));const heading=element('div',{class:'kit-library-heading'});heading.append(label);row.append(heading);
    const settings=element('details',{class:'kit-file-settings'});settings.hidden=!selection.included;settings.append(element('summary',{},'File name'));
    const input=element('input',{type:'text',value:selection.path,'data-kit-path':selection.id,'aria-label':name+' file name',spellcheck:'false'});
    const pathLabel=element('label',{class:'stack'});pathLabel.append(element('span',{class:'sr-only'},name+' file name'),input);settings.append(pathLabel);row.append(settings);
    if(!draft||draft.error)row.append(element('p',{class:'hint error'},draft?.error??'Restore this kit from a project backup, or remove its references from this pack.'));
    else if(draft.id===P.emptyKit.id)row.append(element('p',{class:'hint'},'Start without any items.'));
    if(!draft)row.append(element('button',{type:'button','data-remove-missing-kit':selection.id,title:'Remove this missing reference from the pack and its locations. Undo restores it.'},'Remove missing kit'));
    if(draft&&draft.id!==P.emptyKit.id)heading.append(element('a',{class:'library-edit',href:editorUrl('kit',draft.id)},'Edit kit'));
    container.append(row);
  }
}
function renderIntros() {
  const list=$('intro-library');list.replaceChildren();
  if(!catalog.intros.length)list.append(element('li',{},'No saved intros yet.'));
  for(const draft of catalog.intros) {
    const row=contentNode(element('li'),'intro',draft.id);row.append(element('strong',{},draft.name));
    row.append(element('p',{class:'hint'+(draft.error?' error':'')},draft.error||plainText(draft.document.text)));
    row.append(element('a',{class:'library-edit',href:editorUrl('intro',draft.id)},'Edit intro'));list.append(row);
  }
}
function locationPicture(entry){
  if(!P.usesPicture(entry))return {};
  const previous=picturePreviews.get(entry);if(previous?.picture===entry.picture&&previous.data===entry.picture?.data&&previous.name===entry.picture?.name)return previous.result;
  let result;
  try{P.pictureBytes(entry.picture);result={data:entry.picture.data};}
  catch(error){result={error:error.message};}
  picturePreviews.set(entry,{picture:entry.picture,data:entry.picture?.data,name:entry.picture?.name,result});return result;
}
function locationThumbnail(entry){
  const image=entry.imageMode!=='upload'&&/^kingdomsheritage:textures\/gui\/locations\/(default|random|plains|village)\.png$/.exec(entry.fields.image??'');
  return element('img',{class:'location-thumbnail',src:locationPicture(entry).data??'pack/assets/'+(image?.[1]??'card_fallback')+'.png',width:'48',height:'72',alt:''});
}
function locationKitIds(entry){
  const ids=entry.kitMode==='selected'?entry.kits:[...state.kits.filter(kit=>kit.included).map(kit=>kit.id),...P.bundledKits(state).map(kit=>kit.id)],ordered=P.orderedKitIds(state,catalog);return [...ordered.filter(id=>ids.includes(id)),...ids.filter(id=>!ordered.includes(id))];
}
function locationOptions(){
  const list=$('locations');list.replaceChildren();$('location-count').textContent=String(state.locations.length);
  const selected=active();$('editing-location').textContent=selected?.fields.title||'Untitled location';$('editing-location').title=selected?.fields.title||'Untitled location';$('location-position').textContent=selected?(orderedLocations().findIndex(entry=>entry.id===selected.id)+1)+' of '+state.locations.length:'';
  document.querySelector('.location-toolbar').hidden=!selected;
  for(const entry of orderedLocations()){
    const row=element('li'),button=contentNode(element('button',{type:'button','data-open-location':entry.id,'aria-current':String(entry.id===state.active)}),'location',entry.id),content=element('span',{class:'location-list-content'});
    button.append(locationThumbnail(entry));
    content.append(element('strong',{},entry.fields.title||'Untitled location'),element('span',{},locationDescription(entry)));
    const kits=locationKitIds(entry).length,intro=catalog.intros.find(draft=>draft.id===entry.intro),overrides=entry.fields.type==='pool'&&entry.destinations.some(destination=>destination.intro);
    content.append(element('span',{},kits+' kit'+(kits===1?'':'s')+' · '+(intro?'Intro':entry.intro?'Missing intro':overrides?'Place intros':'No intro')));
    if(revealValidation&&output?.issues.some(issue=>issue.locationId===entry.id))content.append(element('span',{class:'error'},'Needs attention'));
    button.append(content);row.append(button);packTools?.decorate(row,entry);list.append(row);
  }
  renderTextFits();contentBrowser?.refresh();
}
function updateContentBrowser(){
  $('toggle-content-browser').hidden=currentStep!=='locations'||innerWidth<1200;const open=innerWidth<1600&&embeddedSession?document.body.classList.contains('content-browser-open'):!document.body.classList.contains('content-browser-collapsed');$('toggle-content-browser').setAttribute('aria-expanded',String(open));
}
$('toggle-content-browser').addEventListener('click',()=>{document.body.classList.toggle(innerWidth<1600&&embeddedSession?'content-browser-open':'content-browser-collapsed');updateContentBrowser();});
window.addEventListener('resize',updateContentBrowser);
document.addEventListener('pointerdown',event=>{if(innerWidth<1600&&embeddedSession&&!event.target.closest('#pack-content-browser,#toggle-content-browser,#content-context-menu')){document.body.classList.remove('content-browser-open');updateContentBrowser();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('content-browser-open')){event.preventDefault();document.body.classList.remove('content-browser-open');updateContentBrowser();$('toggle-content-browser').focus();}});
function contentNode(node,kind,id){node.dataset.contentKind=kind;node.dataset.contentId=id;node.setAttribute('aria-haspopup','menu');if(!['A','BUTTON'].includes(node.tagName))node.tabIndex=0;if(kind==='kit')node.draggable=true;node.dataset.tooltip=JSON.stringify(kind==='kit'?['Kit actions','Drag to reorder. Right-click for actions. Alt+Up/Down also reorders.']:kind==='location'?['Location actions','Right-click for actions. Alt+Up/Down changes menu order.']:['Intro actions','Right-click for actions. Shared edits affect every use.']);return node;}
function renderContentBrowser(){
  const host=$('content-assets'),entry=active(),another=$('editor-new-entry');$('content-bin-tools').append(another);host.replaceChildren();$('content-location-name').textContent=entry?.fields.title||'Location content';if(!entry)return;
  const group=(kind,label)=>{const section=element('section',{class:'content-asset-group'}),heading=element('div',{class:'section-heading'});heading.append(element('h3',{},label));if(embeddedSession?.kind===kind)heading.append(another);else heading.append(element('a',{href:editorUrl(kind,null,true),class:'library-edit','aria-label':'New '+kind+' for '+(entry.fields.title||entry.path)},'New '+kind));const list=element('div',{class:'content-asset-list'});section.append(heading,list);host.append(section);return list;};
  const kits=group('kit','Kits');for(const id of locationKitIds(entry)){const draft=kitDraft(id),editable=id!==P.emptyKit.id&&!bundledKit(id)&&draft,row=contentNode(element(editable?'a':'div',{class:'content-asset'},''),'kit',id);if(editable){row.href=editorUrl('kit',id);row.setAttribute('aria-current',String(embeddedSession?.kind==='kit'&&embeddedSession.id===id));}const item=draft?.document?.items?.[0]?.item;if(item)row.append(HeritageInventory.icon(item.id));const detail=element('span');detail.append(element('strong',{},draft?.name||'Missing kit'),element('span',{class:'hint'},draft?.error?'Needs attention':kitContents(draft?.document)));row.append(detail);kits.append(row);}
  const intros=group('intro','Intros'),add=(id,label,destination=null)=>{const draft=catalog.intros.find(intro=>intro.id===id),row=contentNode(element(draft?'a':'div',{class:'content-asset',...(draft?{href:editorUrl('intro',id)}:{}),'aria-current':String(embeddedSession?.kind==='intro'&&embeddedSession.id===id&&embeddedSession.destination===destination)}),'intro',id),detail=element('span');if(Number.isInteger(destination))row.dataset.destinationIntro=destination;detail.append(element('strong',{},draft?.name||'Missing intro'),element('span',{class:'hint'+(draft?'':' error')},draft?label:label+' · Choose another intro'));row.append(detail);intros.append(row);};
  if(entry.intro)add(entry.intro,entry.fields.type==='pool'?'Default arrival':'Arrival');else intros.append(element('p',{class:'hint'},'No default intro'));
  entry.destinations.forEach((destination,index)=>{if(typeof destination.intro==='string'&&destination.intro)add(destination.intro,'Place '+(index+1),index);});contentBrowser?.refresh();
}
function refreshShared(){
  const session=embeddedSession,context=$('shared-entry-context');context.hidden=!session;if(!session)return;
  const used=[];for(const project of projects?.projects??[]){const pack=project.id===projects.active?state:project.state;for(const entry of W.usage(pack,session.kind,session.id))used.push({pack:pack.name,location:entry.fields.title||'Untitled location',packId:project.id});}
  const places=used.map(entry=>entry.location+(entry.packId===projects.active?'':' ('+entry.pack+')'));
  $('shared-entry-usage').textContent=(Number.isInteger(session.destination)?'Place '+(session.destination+1)+' · ':'')+(used.length?'Used by '+used.length+' location'+(used.length===1?'':'s')+' across '+new Set(used.map(entry=>entry.packId)).size+' pack'+(new Set(used.map(entry=>entry.packId)).size===1?'':'s')+(used.length>1?'. Shared changes affect these locations.':'.'):'This draft is saved in the library.');
  $('content-editor').contentWindow?.postMessage({type:'heritage:author-usage',token:session.token,count:used.length,places:places.join(', ')},location.origin);$('shared-entry-usage').title=places.join(', ');$('make-local-copy').hidden=!session.id||session.id===P.emptyKit.id||used.length<2;
}
function fitMessages(fit){return [fit?.titleClipped?'Title: only 3 of '+fit.titleLines+' lines fit.':'',fit?.subtitleClipped?'Subtitle: text after “'+fit.subtitleVisible+'” is cut off.':''];}
function renderTextFits(){
  const selected=active(),fit=selected?cardFits.get(state.namespace+':'+selected.path):null,messages=fitMessages(fit);
  for(const [index,key] of ['title','subtitle'].entries()){const node=$('card-'+key+'-fit');node.textContent=messages[index];node.hidden=!messages[index];}
  for(const button of document.querySelectorAll('[data-open-location],[data-review-location]:has(.review-location-content)')){
    const entry=state.locations.find(entry=>entry.id===(button.dataset.openLocation??button.dataset.reviewLocation)),fit=entry?cardFits.get(state.namespace+':'+entry.path):null,text=fit?.titleClipped&&fit?.subtitleClipped?'Title and subtitle cut off':fit?.titleClipped?'Title cut off':fit?.subtitleClipped?'Subtitle cut off':'';let hint=button.querySelector('.card-fit-summary');if(!hint&&text){hint=element('span',{class:'card-fit-warning card-fit-summary'});button.querySelector('.location-list-content,.review-location-content').append(hint);}if(hint){hint.textContent=text;hint.hidden=!text;}
  }
  for(const scope of ['location','pack']){const host=$(scope+'-text-fit');host.hidden=!messages.some(Boolean)||scope==='location'&&locationPart!=='details';host.replaceChildren();for(const [index,key] of ['title','subtitle'].entries())if(messages[index]){const button=element('button',{type:'button',class:'quiet'},messages[index]+' Edit '+key);button.addEventListener('click',()=>{if(!closeEmbedded())return;setStep('locations');setLocationPart('details');const field=document.querySelector('[data-location-field='+key+']');field.focus();field.select();});host.append(button);}}
}
contentBrowser=HeritageContentBrowser.create({records:()=>{
  const records=orderedLocations().map(entry=>({kind:'location',id:entry.id,name:entry.fields.title||'Untitled location',path:entry.path,detail:locationDescription(entry),current:entry.id===state.active,image:locationThumbnail(entry).src}));
  for(const [kind,drafts] of [['kit',P.orderedKitIds(state,catalog).map(id=>catalog.kits.find(kit=>kit.id===id)).filter(Boolean)],['intro',catalog.intros]])for(const draft of drafts){const used=W.usage(state,kind,draft.id).length,selection=kind==='kit'?state.kits.find(kit=>kit.id===draft.id):null;records.push({kind,id:draft.id,name:draft.name,path:selection?.path??'',detail:draft.error?'Needs attention':used?'Used by '+used+' location'+(used===1?'':'s'):'Library · Not assigned',current:embeddedSession?.kind===kind&&embeddedSession.id===draft.id});}return records;
},leave:leaveContentSearch,open:(kind,id)=>{if(kind==='location'){const entry=state.locations.find(entry=>entry.id===id);if(entry)workspaceVisuals.select(state.namespace+':'+entry.path);}else if(kind==='kit'&&id===P.emptyKit.id){if(closeEmbedded())setLocationPart('kits');}else openEmbedded(kind,id);}});
function focusContentKit(id){const field=[...document.querySelectorAll('[data-content-kind=kit][data-content-id="'+CSS.escape(id)+'"]')].find(node=>node.checkVisibility());field?.focus({preventScroll:true});}
function reorderContentKits(ids){
  if(!closeEmbedded())return false;const ordered=P.orderedKitIds(state,catalog),subset=new Set(ids);if(subset.size!==ids.length||ids.some(id=>!ordered.includes(id))){$('project-status').textContent='These kits changed. Try reordering them again.';return false;}
  let index=0;const next=ordered.map(id=>subset.has(id)?ids[index++]:id);if(next.every((id,index)=>id===ordered[index]))return false;
  state=HeritageEditing.reorderKits(state,next);historyLabel='Reorder kits';renderKits();kitChoices();changed();return true;
}
function showContentLocation(id,part='details'){
  if(!closeEmbedded())return false;const entry=state.locations.find(entry=>entry.id===id);if(!entry)throw new Error('This location is unavailable.');state.active=id;renderLocation();if(currentStep!=='locations')setStep('locations');setLocationPart(part);save();return true;
}
function editContentDraft(kind,id,destination=null,rename=false){
  if(!closeEmbedded())return;if(rename)editorStages.set(kind+':'+id,kind==='kit'?'details':'text');openEmbedded(kind,id,false,destination);if(rename&&embeddedSession?.id===id)pendingContentFocus={token:embeddedSession.token,field:kind==='kit'?'title':'intro-name'};
}
async function copyContentDraft(target,local=false){
  if(!closeEmbedded())return;const before=readWorkspace(),id=crypto.randomUUID(),kind=target.kind==='kit'?'kits':'intros',next=local?HeritageEditing.privateCopy(before.pack,before.libraries,target.kind,target.id,target.locationId,id):HeritageEditing.duplicateDraft(before.pack,before.libraries,target.kind,target.id,target.locationId,id,target.destination);
  await writeWorkspace(next,before);historyDrafts=[{kind,id}];historyLabel=local?'Make a local '+target.kind+' copy':'Duplicate '+target.kind;changed();editContentDraft(target.kind,id,target.destination,!local);
}
function contentTarget(node){return {kind:node.dataset.contentKind,id:node.dataset.contentId,locationId:state.active,destination:node.hasAttribute('data-destination-intro')?Number(node.dataset.destinationIntro):null};}
function contentName(node){const target=contentTarget(node);return target.kind==='location'?state.locations.find(entry=>entry.id===target.id)?.fields.title||'Location':target.kind==='kit'?kitName(target.id):catalog.intros.find(entry=>entry.id===target.id)?.name||'Missing intro';}
function contentMenuActions(node){
  const target=contentTarget(node),{kind,id,locationId,destination}=target,entry=state.locations.find(entry=>entry.id===locationId),actions=[],add=(label,run,disabled=false,extra={})=>actions.push({label,run,disabled,...extra}),separator=()=>actions.push({separator:true});
  const sourceId=kind==='location'?state.namespace+':'+state.locations.find(entry=>entry.id===id)?.path:id;
  const ids=kind==='location'?workspaceVisuals.cards().map(spawn=>spawn.id):kind==='kit'?[...node.parentElement.children].filter(node=>node.dataset.contentKind==='kit').map(node=>node.dataset.contentId):[],index=ids.indexOf(sourceId);
  const move=to=>{const next=[...ids];next.splice(index,1);next.splice(to,0,sourceId);if(kind==='kit'){if(reorderContentKits(next))focusContentKit(id);}else{if(to===index)return;const target=ids[to];if(reorderLocationCards(sourceId,target,to>index))document.querySelector('[data-open-location="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});}};
  if(kind==='location'){
    for(const [label,part] of [['Edit location','details'],['Edit kits','kits'],['Edit intro','intro']])add(label,()=>showContentLocation(id,part));
    add('Rename location',()=>{if(showContentLocation(id)){const field=document.querySelector('[data-location-field=title]');field.focus();field.select();}});add('Duplicate location',()=>{if(showContentLocation(id))$('duplicate-location').click();});
  }else{
    const draft=kind==='kit'?kitDraft(id):catalog.intros.find(entry=>entry.id===id);
    const builtin=kind==='kit'&&(id===P.emptyKit.id||!!bundledKit(id)),editable=!!draft&&!builtin;
    add('Edit '+kind,()=>editContentDraft(kind,id,destination),!editable);add('Rename '+kind,()=>editContentDraft(kind,id,destination,true),!editable);add('Duplicate '+kind,()=>copyContentDraft(target),(!draft&&!builtin)||!!draft?.error||!entry);
    const used=projects.projects.reduce((count,project)=>count+W.usage(project.id===projects.active?state:project.state,kind,id).length,0);if(editable&&used>1&&W.usage(state,kind,id).some(location=>location.id===locationId))add('Make a copy for this location',()=>copyContentDraft(target,true));
  }
  if(kind!=='intro'){
    separator();const title=kind==='kit'?'Kit order applies to every location in this pack.':'';add('Move up',()=>move(index-1),index<=0,{title});add('Move down',()=>move(index+1),index<0||index>=ids.length-1,{title});add('Move to first',()=>move(0),index<=0,{title});add('Move to last',()=>move(ids.length-1),index<0||index>=ids.length-1,{title});
  }
  separator();
  if(kind==='location')add('Delete location…',()=>{if(showContentLocation(id))$('delete-location').click();},false,{destructive:true});
  else if(kind==='kit'){
    const assigned=entry&&locationKitIds(entry).includes(id);add(assigned?'Remove from this location':'Use in this location',()=>{if(!showContentLocation(locationId,'kits'))return;const location=active();if(assigned){location.kits=locationKitIds(location).filter(value=>value!==id);location.kitMode='selected';}else if(bundledKit(id))location.kits=[...new Set([...location.kits,id])];else W.attach(state,'kit',id);historyLabel=assigned?'Remove kit from location':'Assign kit';kitChoices();renderKits();changed();},!entry,{destructive:!!assigned});
  }else{
    const assigned=entry&&(Number.isInteger(destination)?entry.destinations[destination]?.intro===id:entry.intro===id);add(assigned?(Number.isInteger(destination)?'Remove intro from this place':'Remove intro from this location'):'Use as this location’s intro',()=>{if(!showContentLocation(locationId,'intro'))return;if(assigned&&Number.isInteger(destination))active().destinations[destination].intro=null;else active().intro=assigned?'':id;historyLabel=assigned?'Remove intro from location':'Assign intro';introOptions();renderPool();changed();},!entry,{destructive:!!assigned});
  }
  return actions;
}
HeritageContentActions.create({actions:contentMenuActions,name:contentName,reorder:reorderContentKits,focusKit:focusContentKit,report:message=>$('project-status').textContent=message});
let searchReturnFocus;
function focusContentSearch(){
  searchReturnFocus=document.activeElement;if(currentStep!=='locations')setStep('locations');if(currentStep!=='locations')return;document.body.classList.remove('content-browser-collapsed');if(embeddedSession&&innerWidth<1600)document.body.classList.add('content-browser-open');updateContentBrowser();$('content-search').focus();
}
function leaveContentSearch(){
  if(embeddedSession){$('content-editor').contentWindow.postMessage({type:'heritage:author-search-close',token:embeddedSession.token},location.origin);if(innerWidth<1600)document.body.classList.remove('content-browser-open');updateContentBrowser();}else if(searchReturnFocus?.isConnected&&searchReturnFocus!==$('content-search'))searchReturnFocus.focus({preventScroll:true});else $('location-editor').focus({preventScroll:true});
}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){event.preventDefault();focusContentSearch();}});

const workspaceVisuals=HeritageWorkspaceVisuals.create({
  textFits:fits=>{cardFits=fits;renderTextFits();},
  editLocation:(id,{stay=false}={})=>{const entry=state.locations.find(entry=>state.namespace+':'+entry.path===id);if(!entry||!closeEmbedded())return false;state.active=entry.id;renderLocation();if(!stay){setLocationPart('details');setStep('locations');}save();return true;},
  selectContext:id=>{
    const entry=state.locations.find(entry=>state.namespace+':'+entry.path===id);if(!entry||entry===active())return;
    const session=embeddedSession,part=locationPart;if(!closeEmbedded())return false;state.active=entry.id;renderLocation();setLocationPart(part);save();
    if(session){const ids=session.kind==='kit'?locationKitIds(entry).filter(id=>id!==P.emptyKit.id&&id!=='bundled-empty'&&catalog.kits.some(kit=>kit.id===id)):catalog.intros.some(intro=>intro.id===entry.intro)?[entry.intro]:[],id=ids.includes(session.id)?session.id:ids[0];if(id){const stage=editorStages.get(session.kind+':'+session.id);if(stage)editorStages.set(session.kind+':'+id,stage);openEmbedded(session.kind,id,false,null,part);}}
    return true;
  },
  reorder:reorderLocationCards,
  editText:(id,key,value,expected)=>{
    const entry=state.locations.find(entry=>state.namespace+':'+entry.path===id);if(saveBlocked||!entry||!['title','subtitle','description'].includes(key)||(entry.fields[key]??'')!==expected||value.length>(key==='description'?4000:120))return false;
    if(value===expected&&!entry.fields[key+'_key'])return true;entry.fields[key]=value;delete entry.fields[key+'_key'];historyLabel='Edit card '+key;historyGroup='';renderLocation();changed();return true;
  },
  undo:direction=>$(direction<0?'pack-undo':'pack-redo').click(),
  crop:id=>{const entry=state.locations.find(entry=>state.namespace+':'+entry.path===id);if(!entry)return;state.active=entry.id;renderLocation();setLocationPart('details');setStep('locations');save();if(P.usesPicture(entry))$('crop-picture').click();else $('choose-picture').click();},
  editIntro:stage=>{const id=active()?.intro;if(!id)return;editorStages.set('intro:'+id,stage);openEmbedded('intro',id);},
  testFlow:()=>$('preview-flow').click()
});
function reorderLocationCards(source,target,after){
  if(!flushEmbedded())return false;const spawns=workspaceVisuals.cards(),ids=spawns.map(spawn=>spawn.id),from=ids.indexOf(source),to=ids.indexOf(target);if(from<0||to<0||from===to)return false;
  const next=ids.filter(id=>id!==source);next.splice(next.indexOf(target)+Number(after),0,source);if(next.every((id,index)=>id===ids[index]))return true;
  state=HeritageEditing.reorderCards(state,next,spawns);const entry=state.locations.find(entry=>state.namespace+':'+entry.path===source);if(!embeddedSession&&entry)state.active=entry.id;historyLabel='Reorder cards';historyGroup='';renderLocation();changed();return true;
}
function renderCard(){
  const pictureData={},pictureErrors={};for(const entry of state.locations){const picture=locationPicture(entry);if(picture.data)pictureData[state.namespace+':'+entry.path]=picture.data;if(picture.error)pictureErrors[entry.id]=picture.error;}
  workspaceVisuals.update({state,output,catalog,packId:projects?.active,step:currentStep,part:locationPart,embedded:!!embeddedSession,pictureData,pictureErrors});
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
  $('intro-status').textContent=draft?.error||(draft?.document?plainText(draft.document.text):entry.intro?'This intro is missing. Choose another or select No intro.':entry.fields.type==='pool'?'Choose a default above, or set a different intro for each place below.':'Players enter the world immediately. Choose a saved intro or create one to add an arrival cutscene.');
  $('edit-location-intro').hidden=!draft;const edit=new URL(editorUrl('intro',entry.intro),location.href);edit.searchParams.set('edit','text');$('edit-location-intro').href=edit.href;
  $('intro-status').classList.toggle('error',!!draft?.error||!!entry.intro&&!draft);
  renderContentSummary();$('use-spawn-settings').hidden=!draft?.spawn||!!draft.error;
  $('spawn-settings-help').hidden=$('use-spawn-settings').hidden;
}
function kitChoiceStatus(){
  const entry=active();if(!entry)return;const count=locationKitIds(entry).length;renderContentSummary();
  $('kit-choice-status').textContent=(entry.kitMode==='all'?'Uses every included kit, including kits added later. ':'')+(count?count+' kit'+(count===1?'':'s')+' available to players at this location.':'Choose at least one kit. Use Empty-handed to start without items.');
}
function kitChoices(){
  const entry=active(),container=$('location-kits');container.replaceChildren();if(!entry)return;container.hidden=false;
  const all=entry.kitMode==='all';$('manage-kits').hidden=!all;kitChoiceStatus();
  const choices=catalog.kits.map(draft=>({id:draft.id,name:draft.name,draft,included:state.kits.find(kit=>kit.id===draft.id)?.included}));for(const draft of P.bundledKits(state))choices.push({id:draft.id,name:draft.name,draft,included:true,bundled:true});
  for(const id of entry.kits)if(!choices.some(kit=>kit.id===id))choices.push({id,name:'Missing saved kit',missing:true});
  const ranks=new Map(P.orderedKitIds(state,catalog).map((id,index)=>[id,index]));choices.sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
  for(const kit of choices){
    if(all&&!kit.included)continue;
    const row=contentNode(element('div',{class:'location-kit-choice'}),'kit',kit.id),label=element('label',{class:'check'+(kit.missing?' location-kit-missing':'')}),input=element('input',{type:'checkbox','data-allowed-kit':kit.id}),content=element('span',{class:'kit-choice-content'});
    input.checked=all?!!kit.included:entry.kits.includes(kit.id);input.disabled=all;
    const excluded=!all&&entry.kits.includes(kit.id)&&!kit.included&&!kit.missing,description=kit.missing?'Restore this kit or untick it to remove the assignment.':excluded?'Selected here, but excluded from the pack.':kit.draft?.error?'Needs attention':kitContents(kit.draft?.document);
    content.append(element('span',{},kit.name),element('span',{class:'hint'},description));label.append(input,content);row.append(label);
    const items=kit.draft?.document?.items??[],pictures=element('div',{class:'kit-choice-items'});for(const entry of items.slice(0,2))pictures.append(HeritageInventory.icon(entry.item.id));if(items.length>2)pictures.append(element('span',{},'+'+(items.length-2)));if(!items.length&&!kit.draft?.document?.shop)pictures.append(element('span',{class:'hint'},'Empty inventory'));const preview=element('button',{type:'button','data-preview-kit':kit.id,'aria-label':'Preview '+kit.name,'aria-pressed':'false'},'Preview');preview.disabled=!!kit.missing;if(kit.missing)preview.title='Restore this kit or remove its assignment before previewing it.';const actions=element('div',{class:'kit-choice-actions'});actions.append(preview);row.append(pictures,actions);
    if(excluded)actions.append(element('button',{type:'button','data-include-allowed-kit':kit.id},'Include kit'));
    if(kit.id!==P.emptyKit.id&&!kit.bundled&&!kit.missing)actions.append(element('a',{class:'library-edit',href:editorUrl('kit',kit.id),'aria-label':'Edit '+kit.name},'Edit'));
    container.append(row);
  }
}
function dimensionChoices(field){
  const container=field.closest('.dimension-field');let choices=container.querySelector('.dimension-choices');
  if(!choices){
    choices=element('div',{class:'dimension-choices',role:'group','aria-label':'Default dimensions'});
    for(const [id,name,item] of dimensionOptions){const button=element('button',{type:'button','data-dimension-choice':id}),icon=element('span',{class:'dimension-icon'});icon.append(HeritageInventory.icon('minecraft:'+item));button.append(icon,element('span',{},name));choices.append(button);}
    field.closest('label').after(choices);
  }
  const id=field.value.includes(':')?field.value:'minecraft:'+field.value;
  for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.dimensionChoice===id));
}
function inputField(label,key,value,index,number=false,placeholder='') {
  const wrapper=element('label',{class:'stack'},label);
  const input=element('input',{type:number?'number':'text','data-destination':String(index),'data-destination-field':key,placeholder,spellcheck:'false'});
  if(key==='dimension')input.setAttribute('list','dimension-choices');
  if(key==='target')input.setAttribute('list',(active()?.destinations[index]?.type??'biome')+'-choices');
  if(number)input.step='1';input.value=value??'';wrapper.append(input);
  if(key==='dimension'){const field=element('div',{class:'stack dimension-field'});field.append(wrapper);return field;}
  return wrapper;
}
function destinationType(row,index,type) {
  row.querySelectorAll('[data-pool-types]').forEach(node=>{node.hidden=!node.dataset.poolTypes.split(' ').includes(type);});
}
function renderPool() {
  const container=$('pool-destinations'),intros=$('pool-intro-choices'),focused=document.activeElement,focusIndex=focused.dataset?.destination,focusField=focused.dataset?.destinationField;container.replaceChildren();intros.replaceChildren();
  const entry=active();$('pool-intros').hidden=entry?.fields.type!=='pool';if(!entry)return;
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
    for(const [key,name] of [['search_radius','Search distance (blocks)'],['random_radius','Random spawn distance (blocks)']]){const field=inputField(name,key,destination[key],index,true,'Use location setting');field.dataset.poolTypes=key==='search_radius'?'biome structure':'random';grid.append(field);}
    const piece=inputField('Preferred building piece (optional)','piece',destination.piece,index);piece.dataset.poolTypes='structure';grid.append(piece);
    options.append(grid);row.append(options);
    const introRow=element('div',{class:'pool-intro-entry'}),introHeading=element('div',{class:'section-heading'});introHeading.append(element('h3',{},'Place '+(index+1)+' · '+locationDescription({fields:destination,destinations:[]})),element('button',{type:'button','data-open-place':String(index),'aria-label':'Edit place '+(index+1)},'Edit place'));introRow.append(introHeading);
    const introLabel=element('label',{class:'stack'},'Intro for place '+(index+1));
    const intro=element('select',{'data-destination':String(index),'data-destination-field':'intro'});
    intro.append(option('','Use the pool’s default intro'),option(':none','No intro'),...catalog.intros.map(draft=>option(draft.id,draft.name+(draft.error?' (needs fixing)':''))));
    const value=destination.intro;
    if(value&&typeof value==='object')intro.append(option(':imported','Imported intro'));
    else if(value&&!catalog.intros.some(draft=>draft.id===value))intro.append(option(value,'Missing saved intro'));
    intro.value=value===null?':none':typeof value==='object'?':imported':value??'';
    introLabel.append(intro);const introControls=element('div',{class:'pool-intro-controls'});introControls.append(introLabel);const create=element('button',{type:'button','data-create-destination-intro':String(index),'aria-label':'New intro for place '+(index+1)},'New intro');introControls.append(create);const introId=typeof value==='string'&&value?value:entry.intro;if(value!==null&&catalog.intros.some(draft=>draft.id===introId))introControls.append(element('button',{type:'button','data-edit-destination-intro':String(index),'data-intro-id':introId,'aria-label':'Edit intro for place '+(index+1)},'Edit intro'));introRow.append(introControls);
    const draft=catalog.intros.find(draft=>draft.id===(value||entry.intro));
    const text=value===null?'Players will start here without an intro.':value&&typeof value==='object'?plainText(value.text??''):draft?.error||plainText(draft?.document?.text??'');
    const status=element('p',{class:'intro-excerpt hint'},text||(value?'This intro is missing. Choose another intro.':entry.intro?'The pool’s default intro is missing.':'The pool has no default intro.'));
    status.classList.toggle('error',value!==null&&typeof value!=='object'&&(!!draft?.error||!!(value||entry.intro)&&!draft));
    introRow.append(status);intros.append(introRow);const introName=value===null?'None':value&&typeof value==='object'?'Imported':value?draft?.name||'Missing intro':'Pool default';row.append(element('button',{type:'button',class:'place-intro-link','data-open-place-intro':String(index)},'Intro: '+introName));container.append(row);destinationType(row,index,destination.type);
  });
  if(focusIndex!==undefined&&focusField)document.querySelector('[data-destination="'+focusIndex+'"][data-destination-field="'+focusField+'"]')?.focus({preventScroll:true});
}
function renderPicture() {
  const entry=active();if(!entry)return;
  const mode=entry.imageMode??(entry.picture?'upload':entry.fields.image?'manual':'upload'),pending=pictureRequests.get(entry),busy=!!pending;
  $('picture-source').value=mode;$('picture-upload').hidden=mode!=='upload';$('picture-manual').hidden=mode!=='manual';
  $('choose-picture').disabled=busy;$('remove-picture').hidden=!entry.picture&&!busy;$('crop-picture').hidden=!entry.picture;$('crop-picture').disabled=busy;
  $('picture-keep-resolution').checked=pending?.keepResolution??entry.keepImageResolution??entry.picture?.keepResolution===true;$('picture-keep-resolution').disabled=busy;
  $('picture-resolution-help').textContent='Export at source resolution instead of 128 × 192. The card keeps the same size in game.';
  $('picture-name').hidden=true;
  $('picture-drop').classList.remove('drag-over');
  $('picture-status').classList.remove('error');$('picture-status').textContent=busy?'Preparing image…':'';
  if(P.usesPicture(entry)) {
    try {
      const bytes=P.pictureBytes(entry.picture),view=new DataView(bytes.buffer);$('picture-name').textContent=entry.picture.name+' · '+view.getUint32(16)+' × '+view.getUint32(20)+' PNG';$('picture-name').hidden=false;
      if(entry.picture.keepResolution&&!entry.picture.source?.preserved)$('picture-resolution-help').textContent='Using the saved source. Re-upload the original with this option enabled to recover full detail.';
    }catch(error){$('picture-status').textContent=error.message;$('picture-status').classList.add('error');}
  }
}
async function uploadPicture(files) {
  const entry=active(),pack=state;if(!entry)return;
  const request={};pictureRequests.set(entry,request);renderPicture();renderOutput();
  let failure='';
  try {
    if(files.length!==1)throw new Error('Choose one image for this card.');
    const file=files[0];
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)&&!(!file.type&&/\.(png|jpe?g|webp)$/i.test(file.name)))throw new Error('Choose a PNG, JPEG or WebP image.');
    if(file.size>10*1024*1024)throw new Error('Choose an image smaller than 10 MB.');
    const url=URL.createObjectURL(file),image=new Image();
    try {
      image.src=url;
      try{await image.decode();}catch(error){throw new Error('This image could not be opened. Choose a valid PNG, JPEG or WebP.');}
      if(state!==pack||!state.locations.includes(entry)||pictureRequests.get(entry)!==request)return;
      const picture={name:file.name,...await HeritagePictureEditor.prepare(image,{keepResolution:entry.keepImageResolution??entry.picture?.keepResolution===true,file})};P.pictureBytes(picture);
      if(state!==pack||!state.locations.includes(entry)||pictureRequests.get(entry)!==request)return;
      entry.picture=picture;entry.imageMode='upload';
    }finally{URL.revokeObjectURL(url);}
  }catch(error){failure=error.message;}
  finally {
    if(pictureRequests.get(entry)===request) {
      pictureRequests.delete(entry);
      if(state===pack&&state.locations.includes(entry)) {
        if(active()===entry) {
          renderPicture();
          if(failure){$('picture-status').textContent=failure;$('picture-status').classList.add('error');}
        }
        changed();
      }
    }
  }
}
function renderLocation({sync=true}={}) {
  if(renderedLocation&&renderedLocation!==state.active)locationPart=locationParts.get(state.active)??'details';renderedLocation=state.active;setLocationPart(locationPart,{route:false});
  if(sync&&currentStep==='locations'){const url=new URL(location.href);if(projects)url.searchParams.set('pack',projects.active);if(state.active)url.searchParams.set('location',state.active);else url.searchParams.delete('location');window.history.replaceState(null,'',url);}
  locationOptions();renderOverview();renderContentBrowser();
  const entry=active();document.querySelector('.location-sections').hidden=!entry;$('location-empty').hidden=!!entry;$('location-form').hidden=!entry;$('delete-location').disabled=!entry;
  $('duplicate-location').disabled=!entry;
  if(!entry)return;
  $('create-kit').href=editorUrl('kit',undefined,true);$('create-intro').href=editorUrl('intro',undefined,true);
  $('location-id').value=entry.path;
  document.querySelectorAll('[data-location-field]').forEach(field=>{field.value=entry.fields[field.dataset.locationField]??(field.dataset.locationField==='outline'?entry.document?.outline??true:'');});
  $('kit-mode').value=entry.kitMode;
  showType();introOptions();kitChoices();renderPool();renderPicture();renderTextFits();
  if(output){$('export-file').value='data/'+state.namespace+'/heritage/spawns/'+entry.path+'.json';previewFile();renderCard();}
}
function fileLabel(path){
  const match=/^data\/([^/]+)\/heritage\/(spawns|kits)\/(.+)\.json$/.exec(path);
  if(match){const own=match[1]===state.namespace,kind=match[2]==='spawns'?'Location':'Kit',entry=own?(kind==='Location'?state.locations.find(entry=>entry.path===match[3]):state.kits.find(entry=>entry.path===match[3])):null;
    const name=kind==='Location'?entry?.fields.title:catalog.kits.find(draft=>draft.id===entry?.id)?.name;return kind+': '+(name||placeName(match[3]))+(own?'':' ('+match[1]+')');}
  return path==='pack.mcmeta'?'Pack information':path===P.selectionPath?'GUI scaling':path;
}
function renderDownloadDetails(){
  const base=P.slug(state.name),resources=!!output.resourceFiles.length,data=base+(resources?'-data':'')+'.zip',resource=base+'-resources.zip',host=$('export-contents');host.replaceChildren();
  for(const [name,description] of [[data,'Datapack'],...(resources?[[resource,output.pictureCount?'Resource pack · '+output.pictureCount+' card image'+(output.pictureCount===1?'':'s'):'Resource pack']]:[])]){const row=element('li');row.append(element('strong',{},name),element('span',{class:'hint'},description));host.append(row);}
  $('install-data-name').textContent=data;$('install-resource-name').textContent=resource;$('install-bundle-name').textContent=base+'-packs.zip';$('install-extract-step').hidden=$('install-resource-step').hidden=!resources;
}
function previewFile() {
  const file=output.previewFiles.find(entry=>entry.path===$('export-file').value);
  $('copy').disabled=!file;$('copy-status').textContent='';$('file-preview-heading').textContent=file?fileLabel(file.path):'JSON preview';$('file-preview-path').textContent=file?.path??'';
  $('export-json').value=file?.content??'';code.setError(file?output.issues.find(issue=>issue.filePath===file.path):null);$('export-json').scrollTop=0;
  if(!file)$('line-count').textContent='';
}
function renderOutput() {
  output=P.build(state,catalog);if(active()){showType();document.querySelectorAll('#pool-destinations > .pool-destination').forEach((row,index)=>destinationType(row,index,active().destinations[index]?.type));}renderOverview();
  for(const field of document.querySelectorAll('[data-location-field],[data-destination-field],#pack-gui-scale,#pack-kit-preview,[data-kit-path],#namespace,#pack-name,#pack-description,#location-id,#kit-mode,#location-intro')) {
    const property=field.dataset.destinationField??field.dataset.locationField??({'pack-name':'name','pack-description':'description','namespace':'namespace','location-id':'path','kit-mode':'kits','location-intro':'intro','pack-gui-scale':'guiScale','pack-kit-preview':'kitPreview'})[field.id]??'path';
    const location=field.hasAttribute('data-location-field')||field.hasAttribute('data-destination-field')||['location-id','kit-mode','location-intro'].includes(field.id);
    const issue=output.issues.find(issue=>issue.field===property&&(field.dataset.kitPath?issue.kitId===field.dataset.kitPath:location?issue.locationId===state.active&&(issue.destination===undefined?!field.hasAttribute('data-destination'):issue.destination===Number(field.dataset.destination)):!issue.locationId&&!issue.kitId));
    const showIssue=!!issue&&(revealValidation||touched.has(fieldKey(field)));
    field.setAttribute('aria-invalid',String(showIssue));
    const errorId='validation-error-'+(field.id??'')+'-'+(field.dataset.kitPath??field.dataset.destination??'main')+'-'+property;
    let message=document.getElementById(errorId);
    const label=field.closest('label');
    if(property==='dimension')dimensionChoices(field);
    field.setAttribute('aria-label',[...label.childNodes].filter(node=>node.nodeType===3||node.nodeName==='SPAN').map(node=>node.textContent).join('').trim());
    if(!message){message=element('p',{class:'field-error',id:errorId});(property==='dimension'?label.closest('.dimension-field'):label).append(message);}
    message.textContent=showIssue?issue.message:'';message.hidden=!showIssue;
    const suggestion=showIssue&&property==='dimension'&&state.allowCustomTargets!==true?P.dimensionSuggestion(field.value):'';
    if(suggestion)message.append(element('button',{type:'button',class:'dimension-correction','data-correct-dimension':suggestion,'aria-label':'Use '+suggestion},'Use this ID'));
    if(showIssue)for(let parent=field.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;if(parent.matches('[data-location-types],[data-pool-types]'))parent.hidden=false;}
    const help=field.dataset.locationField==='target'?'target-help':field.id==='pack-gui-scale'?'gui-scale-help':field.id==='pack-kit-preview'?'kit-preview-help':field.id==='namespace'?'namespace-help':field.id==='location-id'?'location-id-help':'';
    field.setAttribute('aria-describedby',(help?help+' ':'')+message.id);
  }
  const preparing=state.locations.some(entry=>pictureRequests.has(entry)),previewCurrent=!!previewed&&previewed===fingerprint();
  $('export-pack').disabled=!!output.errors.length||preparing;
  $('preview-flow').disabled=$('export-pack').disabled;
  $('flow-readiness').textContent=preparing?'Your picture is being prepared.':output.errors.length?output.errors.length+' issue'+(output.errors.length===1?' blocks':'s block')+' the preview.':previewCurrent?'Preview completed for one path in this version.':previewed?'This pack has changed since your last preview.':'Preview is ready.';
  $('export-file-check').textContent=preparing?'Processing images…':output.errors.length?output.errors.length+' issue'+(output.errors.length===1?'':'s'):'Passed';
  $('export-preview-status').textContent=output.errors.length?'Unavailable':'Checking coverage…';$('export-preview-again').disabled=$('preview-flow').disabled;
  $('export-pack').textContent=output.resourceFiles.length?'Download datapack & resource pack':'Download datapack';
  $('export-file').disabled=!output.previewFiles.length;
  $('preview-state').textContent=output.errors.length?'Draft preview. Fix the highlighted issues before downloading.':'Read-only preview';
  const kitCount=state.kits.filter(kit=>kit.included).length+P.bundledKits(state).length,locationCount=state.locations.length+(state.keepLocations?4:0);
  $('pack-summary').textContent=locationCount+' starting location'+(locationCount===1?'':'s')+' · '+kitCount+' included kit'+(kitCount===1?'':'s');
  $('export-fix').hidden=!output.errors.length;
  const errors=$('export-errors');errors.replaceChildren();
  if(output.errors.length){errors.append(element('p',{},output.errors.length+' issue'+(output.errors.length===1?' needs':'s need')+' fixing before preview or download:'));const list=element('ul');
    for(const issue of output.issues){const row=element('li'),entry=state.locations.find(entry=>entry.id===issue.locationId),button=element('button',{type:'button'},(issue.label||entry?.fields.title||entry?.path||'Pack')+': '+issue.message);button.addEventListener('click',()=>fixIssue(issue));row.append(button);list.append(row);}
    for(const error of output.errors.filter(error=>!output.issues.some(issue=>error.endsWith(issue.message)))){const row=element('li'),button=element('button',{type:'button'},error);button.addEventListener('click',()=>{setStep('locations');const field=/starting location/i.test(error)?$('new-location'):document.querySelector('[data-include-kit]')??$('new-location');for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field.focus();});row.append(button);list.append(row);}errors.append(list);}
  $('export-warnings').replaceChildren(...output.warnings.map(warning=>element('li',{},warning)));
  const select=$('export-file'),previous=select.value;
  select.replaceChildren(...output.previewFiles.map(file=>option(file.path,fileLabel(file.path))));
  const current='data/'+state.namespace+'/heritage/spawns/'+active()?.path+'.json';
  const problem=output.issues.find(issue=>output.previewFiles.some(file=>file.path===issue.filePath));
  if(output.previewFiles.some(file=>file.path===previous))select.value=previous;
  else if(problem)select.value=problem.filePath;
  else if(output.previewFiles.some(file=>file.path===current))select.value=current;
  renderDownloadDetails();previewFile();locationOptions();kitChoiceStatus();renderCard();renderContentBrowser();updateSteps();coverageView?.refresh();
}
function render() {
  for(const [id,key] of [['pack-name','name'],['namespace','namespace'],['pack-description','description']])$(id).value=state[key];
  $('pack-gui-scale').value=String(state.guiScale??0);
  $('pack-kit-preview').value=P.kitPreview(state)??'inventory';
  $('allow-custom-targets').checked=state.allowCustomTargets===true;
  $('keep-locations').checked=state.keepLocations;$('keep-kits').checked=state.keepKits;
  projectOptions();renderKits();renderIntros();renderLocation({sync:false});renderOutput();packTools?.refresh();refreshShared();
}
function refresh() {loadCatalog();discoverKits();renderKits();renderIntros();introOptions();kitChoices();renderPool();changed();}
$('refresh-drafts').addEventListener('click',()=>{refresh();$('project-status').textContent='Your latest saved kits and intros are ready.';});
$('new-pack').addEventListener('click',()=>$('new-pack-dialog').showModal());
$('confirm-new-pack').addEventListener('click',()=>{
  if(!closeEmbedded()){$('new-pack-dialog').close();return;}
  clearTimeout(saveTimer);
  if(saveBlocked){$('project-status').textContent=storageError;return;}
  save();loadCatalog();state=freshState();projects.add(state);discoverKits();
  output=null;returnToReview=false;reviewReturn=null;saveBlocked=false;storageError='';$('export-file').replaceChildren();
  document.querySelectorAll('.pack-options,.destination-options,.extra-settings').forEach(details=>{details.open=false;});
  $('new-pack-dialog').close();render();save();
  revealValidation=false;touched.clear();previewed='';setStep('pack');$('project-status').textContent='New pack ready. Your saved kits and intros are still available.';$('pack-name').focus();$('pack-name').select();
});
window.addEventListener('storage',event=>{if(['heritage.kitCreator.v1','heritage.introEditor.v1'].includes(event.key))refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
for(const [id,key] of [['pack-name','name'],['namespace','namespace'],['pack-description','description']])$(id).addEventListener('input',event=>{state[key]=event.target.value;changed();});
for(const [id,key] of [['keep-locations','keepLocations'],['keep-kits','keepKits'],['allow-custom-targets','allowCustomTargets']])$(id).addEventListener('change',event=>{state[key]=event.target.checked;kitChoices();changed();});
$('pack-gui-scale').addEventListener('change',event=>{
  const value=Number(event.target.value);if(value)state.guiScale=value;else delete state.guiScale;changed();
});
$('pack-kit-preview').addEventListener('change',event=>{
  state.kitPreview=event.target.value;
  changed();
  document.querySelector('[data-workspace-view="kits"]').click();
});
$('kit-library').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-missing-kit]');if(!button)return;const id=button.dataset.removeMissingKit;loadCatalog();
  if(catalog.kits.some(draft=>draft.id===id)){renderKits();kitChoices();renderOutput();$('project-status').textContent='This kit has been restored. Its references were kept.';return;}
  state.kits=state.kits.filter(kit=>kit.id!==id);for(const location of state.locations)location.kits=location.kits.filter(kit=>kit!==id);historyLabel='Remove missing kit';renderKits();kitChoices();changed();$('project-status').textContent='Missing kit references removed. Undo restores them.';if(!embeddedSession)$('step-next').focus({preventScroll:true});
});
$('kit-library').addEventListener('change',event=>{
  if(!event.target.hasAttribute('data-include-kit'))return;
  state.kits.find(kit=>kit.id===event.target.dataset.includeKit).included=event.target.checked;event.target.closest('.kit-library-row').querySelector('.kit-file-settings').hidden=!event.target.checked;kitChoices();changed();
});
$('kit-library').addEventListener('input',event=>{
  if(!event.target.hasAttribute('data-kit-path'))return;
  state.kits.find(kit=>kit.id===event.target.dataset.kitPath).path=event.target.value;changed();
});
$('location-summary').addEventListener('click',event=>{
  const issue=event.target.closest('[data-review-issue]');if(issue){fixIssue(output.issues[Number(issue.dataset.reviewIssue)]);return;}
  const test=event.target.closest('[data-review-test]');if(test){const id=test.dataset.reviewTest;refresh();if($('preview-flow').disabled)return;const entry=state.locations.find(entry=>entry.id===id);if(entry){document.querySelector('[data-review-test="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});coverageView.open({spawnId:state.namespace+':'+entry.path});}return;}
  const button=event.target.closest('[data-review-location]');if(!button)return;
  if(!closeEmbedded())return;reviewReturn={locationId:button.dataset.reviewLocation,scrollTop:$('pack-content').scrollTop};state.active=button.dataset.reviewLocation;renderLocation();setLocationPart(button.dataset.reviewPart??'details');save();setStep('locations');returnToReview=true;updateSteps();const kind=button.dataset.reviewPart;if(kind==='intro'&&catalog.intros.some(draft=>draft.id===active().intro))openEmbedded('intro',active().intro);else if(kind==='intro'&&!active().intro)openEmbedded('intro',null,true);else if(kind==='kits'){const ids=locationKitIds(active()).filter(id=>id!==P.emptyKit.id&&id!=='bundled-empty');if(ids.length===1&&catalog.kits.some(draft=>draft.id===ids[0])&&state.kits.some(kit=>kit.id===ids[0]&&kit.included))openEmbedded('kit',ids[0]);else document.querySelector('[data-location-section-button=kits]').focus({preventScroll:true});}else document.querySelector('[data-location-section-button="'+locationPart+'"]').focus({preventScroll:true});
});
$('location-content-summary').addEventListener('click',event=>{const button=event.target.closest('[data-edit-content]');if(button){setLocationPart(button.dataset.editContent);$('pack-content').scrollTop=0;}});
$('locations').addEventListener('click',event=>{const button=event.target.closest('[data-open-location]');if(!button)return;if(!closeEmbedded())return;state.active=button.dataset.openLocation;renderLocation();save();document.querySelector('[data-location-section-button="'+locationPart+'"]').focus({preventScroll:true});});
$('add-first-location').addEventListener('click',()=>$('new-location').click());
$('review-add-location').addEventListener('click',()=>{setStep('locations');$('new-location').click();});
$('duplicate-location').addEventListener('click',()=>{if(!closeEmbedded())return;const entry=active();if(!entry)return;const duplicate=W.duplicate(entry,state.locations,crypto.randomUUID());state.locations.push(duplicate);state.active=duplicate.id;renderLocation();changed();document.querySelector('[data-location-field=title]').focus();});
$('new-location').addEventListener('click',()=>{
  if(!closeEmbedded())return;
  let index=state.locations.length+1;while(state.locations.some(entry=>entry.path==='location_'+index))index++;
  const entry=P.location(crypto.randomUUID(),index);entry.fields.order=String(Math.min(2147483647,Math.max(-1,...state.locations.map(entry=>Number(entry.fields.order)||0),...workspaceVisuals.cards().map(spawn=>Number(spawn.order)||0))+1));entry.kitMode='selected';entry.kits=state.kits.some(kit=>kit.id===P.emptyKit.id&&kit.included)?[P.emptyKit.id]:state.kits.filter(kit=>kit.included).slice(0,1).map(kit=>kit.id);state.locations.push(entry);state.active=entry.id;renderLocation();changed();document.querySelector('[data-location-field=title]').focus();
});
$('delete-location').addEventListener('click',()=>{
  const entry=active();if(!entry)return;
  $('delete-location-message').textContent='Remove '+(entry.fields.title||entry.path)+' from this assembly? Your saved kits and intros will be kept.';$('delete-location-dialog').showModal();
});
$('confirm-delete-location').addEventListener('click',()=>{
  if(!closeEmbedded()){$('delete-location-dialog').close();return;}
  state.locations=state.locations.filter(entry=>entry.id!==state.active);state.active=state.locations[0]?.id??'';$('delete-location-dialog').close();renderLocation();changed();
});
$('picture-source').addEventListener('change',event=>{
  const entry=active();pictureRequests.delete(entry);entry.imageMode=event.target.value;renderPicture();changed();
});
$('choose-picture').addEventListener('click',()=>$('picture-file').click());
$('picture-file').addEventListener('change',event=>{
  const files=[...event.target.files];event.target.value='';if(files.length)uploadPicture(files);
});
$('picture-keep-resolution').addEventListener('change',async event=>{
  const entry=active(),pack=state,picture=entry?.picture,keepResolution=event.target.checked;if(!entry)return;
  if(!picture){entry.keepImageResolution=keepResolution;changed();return;}
  const request={keepResolution};pictureRequests.set(entry,request);renderPicture();let failure='';
  try{const next=await HeritagePictureEditor.resolution(picture,keepResolution);P.pictureBytes(next);if(state!==pack||!state.locations.includes(entry)||pictureRequests.get(entry)!==request||entry.picture!==picture)return;entry.picture=next;entry.keepImageResolution=keepResolution;historyLabel='Change card image resolution';historyGroup='';}
  catch(error){failure=error.message;}
  finally{if(pictureRequests.get(entry)===request){pictureRequests.delete(entry);if(state===pack&&state.locations.includes(entry)){if(active()===entry){renderPicture();if(failure){$('picture-status').textContent=failure;$('picture-status').classList.add('error');}}if(!failure)changed();}}}
});
$('crop-picture').addEventListener('click',()=>{
  const entry=active(),picture=entry?.picture,pack=state;if(!picture||pictureRequests.has(entry))return;
  HeritagePictureEditor.open({picture,spawn:{...entry.fields,id:state.namespace+':'+entry.path},apply:next=>{
    if(saveBlocked||state!==pack||!state.locations.includes(entry)||entry.picture!==picture)return false;
    entry.picture=next;entry.keepImageResolution=next.keepResolution===true;historyLabel='Crop card image';historyGroup='';renderPicture();changed();return true;
  }});
});
$('remove-picture').addEventListener('click',()=>{
  const entry=active();pictureRequests.delete(entry);delete entry.picture;renderPicture();changed();
});
for(const type of ['dragenter','dragover'])$('picture-drop').addEventListener(type,event=>{
  event.preventDefault();event.dataTransfer.dropEffect='copy';$('picture-drop').classList.add('drag-over');
});
$('picture-drop').addEventListener('dragleave',event=>{if(!$('picture-drop').contains(event.relatedTarget))$('picture-drop').classList.remove('drag-over');});
$('picture-drop').addEventListener('drop',event=>{
  event.preventDefault();$('picture-drop').classList.remove('drag-over');uploadPicture([...event.dataTransfer.files]);
});
$('location-form').addEventListener('submit',event=>event.preventDefault());
$('location-form').addEventListener('click',event=>{
  const button=event.target.closest('[data-correct-dimension],[data-dimension-choice]');if(!button)return;
  const field=button.closest('.dimension-field').querySelector('input'),entry=active(),choice=button.dataset.dimensionChoice,suggestion=choice??P.dimensionSuggestion(field.value);
  if(!entry||!suggestion)return;
  if(choice?!dimensionOptions.some(([id])=>id===choice):state.allowCustomTargets===true||suggestion!==button.dataset.correctDimension)return;
  const values=field.hasAttribute('data-destination')?entry.destinations[Number(field.dataset.destination)]:entry.fields;if(!values||field.value===suggestion)return;
  values.dimension=suggestion;field.value=suggestion;touched.add(fieldKey(field));historyGroup='';historyLabel=choice?'Change dimension':'Correct dimension';changed();if(!choice)field.focus();
});
$('location-form').addEventListener('input',event=>{
  const entry=active(),field=event.target;if(!entry)return;
  if(field.hasAttribute('data-location-field')) {
    const key=field.dataset.locationField;entry.fields[key]=key==='outline'?field.value==='true':field.validity.badInput?'invalid':field.value;
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
  if(field.dataset.destinationField==='intro'){$('intro-preview-destination').value=field.dataset.destination;$('intro-preview-destination').dispatchEvent(new Event('change'));}
});
$('location-intro').addEventListener('change',event=>{const id=event.target.value;if(!closeEmbedded()){event.target.value=active().intro;return;}active().intro=id;introOptions();renderPool();changed();});
$('use-spawn-settings').addEventListener('click',()=>{
  const entry=active(),draft=catalog.intros.find(draft=>draft.id===entry.intro);
  if(!draft?.spawn||draft.error)return;
  const next=P.importSpawn(entry,draft);state.locations[state.locations.indexOf(entry)]=next;renderLocation();changed();
});
$('manage-kits').addEventListener('click',()=>showKitLibrary());
$('kit-mode').addEventListener('change',event=>{active().kitMode=event.target.value;kitChoices();changed();});
$('location-kits').addEventListener('click',event=>{const button=event.target.closest('[data-include-allowed-kit]');if(!button)return;const kit=state.kits.find(kit=>kit.id===button.dataset.includeAllowedKit);if(kit){kit.included=true;renderKits();kitChoices();changed();}});
$('location-kits').addEventListener('change',event=>{
  const id=event.target.dataset.allowedKit;if(!id)return;
  const entry=active();if(event.target.checked){discoverKits();const kit=state.kits.find(kit=>kit.id===id);if(kit)kit.included=true;renderKits();}entry.kits=event.target.checked?[...new Set([...entry.kits,id])]:entry.kits.filter(value=>value!==id);changed();
});
$('add-destination').addEventListener('click',()=>{const index=active().destinations.push({type:'biome',target:'minecraft:plains'})-1;renderPool();changed();const field=document.querySelector('[data-destination="'+index+'"][data-destination-field=type]');field.focus({preventScroll:true});field.scrollIntoView({block:'nearest'});});
$('pool-intro-choices').addEventListener('click',event=>{
  const create=event.target.closest('[data-create-destination-intro]'),edit=event.target.closest('[data-edit-destination-intro]');if(create){openEmbedded('intro',null,true,Number(create.dataset.createDestinationIntro));return;}if(edit){openEmbedded('intro',edit.dataset.introId,false,Number(edit.dataset.editDestinationIntro));return;}
  const place=event.target.closest('[data-open-place]');if(place){setLocationPart('details');const field=document.querySelector('[data-destination="'+place.dataset.openPlace+'"][data-destination-field=type]');field?.focus({preventScroll:true});field?.scrollIntoView({block:'nearest'});}
});
$('pool-destinations').addEventListener('click',event=>{
  const intro=event.target.closest('[data-open-place-intro]');if(intro){setLocationPart('intro');const field=document.querySelector('[data-destination="'+intro.dataset.openPlaceIntro+'"][data-destination-field=intro]');field?.focus({preventScroll:true});field?.scrollIntoView({block:'nearest'});$('intro-preview-destination').value=intro.dataset.openPlaceIntro;$('intro-preview-destination').dispatchEvent(new Event('change'));return;}
  const button=event.target.closest('[data-remove-destination]');if(!button)return;
  const index=Number(button.dataset.removeDestination);active().destinations.splice(index,1);renderPool();changed();const field=document.querySelector('[data-destination="'+Math.min(index,active().destinations.length-1)+'"][data-destination-field=type]')??$('add-destination');field.focus({preventScroll:true});field.scrollIntoView({block:'nearest'});
});
$('export-file').addEventListener('change',previewFile);
$('copy').addEventListener('click',async()=>{
  if($('copy').disabled)return;
  const file=output.previewFiles.find(entry=>entry.path===$('export-file').value);if(!file)return;
  try{await navigator.clipboard.writeText(file.content);HeritageIcons.copied($('copy'));}
  catch(failure){$('export-json').focus();$('export-json').select();$('copy-status').textContent='Copy the selected JSON with Ctrl+C.';}
});
$('preview-flow').addEventListener('click',()=>{
  refresh();if($('preview-flow').disabled)return;
  if(coverageView)coverageView.open();else{previewing=fingerprint();HeritageFlowPreview.open(output,state);}
});
$('export-preview-again').addEventListener('click',()=>$('preview-flow').click());
$('export-pack').addEventListener('click',()=>{
  refresh();if($('export-pack').disabled)return;
  try {
    const name=P.slug(state.name),withPictures=output.resourceFiles.length>0;
    const files=withPictures?[{path:name+'-data.zip',content:HeritageZip.zip(output.files)},{path:name+'-resources.zip',content:HeritageZip.zip(output.resourceFiles)}]:output.files;
    const filename=name+(withPictures?'-packs':'')+'.zip';
    const bytes=HeritageZip.zip(files),blob=new Blob([bytes],{type:'application/zip'}),url=URL.createObjectURL(blob),link=element('a',{href:url,download:filename});
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('export-status').textContent='Downloaded '+filename+'.';
    save();
  }catch(error){$('export-status').textContent='Could not download your pack: '+error.message;}
});
window.addEventListener('pagehide',()=>{closeEmbedded();save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
$('pack-projects').addEventListener('change',event=>{
  const id=event.target.value;if(!closeEmbedded()){event.target.value=projects.active;return;}save();
  projects.active=id;state=projects.state();returnToReview=false;reviewReturn=null;discoverKits();revealValidation=false;touched.clear();previewed='';render();save();setStep(currentStep);
});
$('save-project').addEventListener('click',()=>{
  if(!flushEmbedded())return;
  try {
    save();
    const read=key=>JSON.parse(localStorage.getItem(key)??'null');
    const backup=HeritageProject.backup(state,read(HeritageProject.keys.kits),read(HeritageProject.keys.intros));
    const filename=P.slug(state.name)+'.heritage-project.json';HeritageSession.download(backup,filename);
    $('project-status').textContent='Downloaded '+filename+'.';
  }catch(error){$('project-status').textContent='Could not save project: '+error.message;}
});
async function restoreProject(input) {
  return navigator.locks.request('heritage-editor:'+HeritageProject.keys.intros,{ifAvailable:true},introLock=>{
    if(!introLock)throw new Error('Close the intro editor tab before opening a project.');
    return navigator.locks.request('heritage-editor:'+HeritageProject.keys.kits,{ifAvailable:true},kitLock=>{
      if(!kitLock)throw new Error('Close the kit creator tab before opening a project.');
      if(!save())throw new Error('Your current project could not be saved. Download a project backup before importing another pack.');
      const read=key=>JSON.parse(localStorage.getItem(key)??'null');
      const result=HeritageProject.merge(input,{kits:read(HeritageProject.keys.kits),intros:read(HeritageProject.keys.intros)});
      const previous=projects.serialize();
      projects.add(result.pack);
      try{HeritageProject.write(localStorage,{[HeritageProject.keys.kits]:result.kits,[HeritageProject.keys.intros]:result.intros,[HeritageProject.keys.packs]:projects.serialize()});}
      catch(error){projects.projects=previous.projects;projects.active=previous.active;throw error;}
      state=projects.state();returnToReview=false;reviewReturn=null;revealValidation=false;touched.clear();previewed='';loadCatalog();discoverKits();render();setStep('locations');
      $('project-status').textContent='Project opened. Existing saved work was kept.';
    });
  });
}
function setOpeningProject(value){openingProject=value;$('open-project').disabled=value;$('start-example').disabled=value;}
async function startExample(){
  if(openingProject||!closeEmbedded())return;
  try{
    if(saveBlocked)throw new Error(storageError);
    setOpeningProject(true);$('project-status').textContent='Creating the starter example…';
    await restoreProject(await HeritagePackExample.create());setStep('pack');
    $('project-status').textContent='Home and Open Plains share the Traveler and Trail Scout kits and the Arrival intro.';
  }catch(error){$('project-status').textContent='Could not start the example: '+error.message;}
  finally{setOpeningProject(false);}
}
$('start-example').addEventListener('click',startExample);
$('open-project').addEventListener('change',async()=>{
  const file=$('open-project').files[0];if(!file||openingProject)return;if(!closeEmbedded()){$('open-project').value='';return;}
  try {
    if(saveBlocked)throw new Error(storageError);
    if(file.size>64*1024*1024)throw new Error('Pack and project imports must be no larger than 64 MiB.');
    setOpeningProject(true);
    $('project-status').textContent='Opening '+file.name+'…';
    const input=/\.zip$/i.test(file.name)?await HeritagePackImport.read(new Uint8Array(await file.arrayBuffer()),file.name):JSON.parse(await file.text());
    await restoreProject(input);
  }catch(error){$('project-status').textContent='Could not open project: '+error.message;}
  $('open-project').value='';setOpeningProject(false);
});
for(const button of document.querySelectorAll('[data-pack-step],[data-go-step]'))button.addEventListener('click',()=>setStep(button.dataset.packStep??button.dataset.goStep));
$('step-back').addEventListener('click',()=>advance('back'));$('step-next').addEventListener('click',()=>advance('next'));
$('export-fix').addEventListener('click',()=>setStep('preview'));$('export-save-project').addEventListener('click',()=>$('save-project').click());
window.addEventListener('popstate',()=>{if(!closeEmbedded())return;$('project-status').textContent='';const params=new URLSearchParams(location.search),id=params.get('pack');if(id&&id!==projects?.active&&projects?.projects.some(entry=>entry.id===id)){save();projects.active=id;state=projects.state();discoverKits();revealValidation=false;touched.clear();previewed='';render();save();}const selected=params.get('location');if(selected&&state.locations.some(entry=>entry.id===selected)){state.active=selected;renderLocation();save();}setStep(params.get('step'),{history:false});if(currentStep==='locations')setLocationPart(params.get('part')??locationPart,{route:false});});
document.addEventListener('input',event=>{if(state&&event.target.matches('[data-location-field],[data-destination-field],#pack-gui-scale,#pack-kit-preview,[data-kit-path],#namespace,#pack-name,#pack-description,#location-id,#kit-mode,#location-intro')){touched.add(fieldKey(event.target));historyGroup=event.target.type==='checkbox'||event.target.tagName==='SELECT'?'':fieldKey(event.target);historyLabel='Edit '+(event.target.getAttribute('aria-label')||'pack');}},{capture:true});
for(const kind of ['biome','structure','dimension']) {
  const ids=[...HeritageLocations[kind],...(HeritageLocations[kind+'Tags']??[]).map(id=>'#'+id)];
  $(kind+'-choices').replaceChildren(...ids.map(id=>option(id,placeName(id))));
}
document.querySelector('[data-location-field=dimension]').setAttribute('list','dimension-choices');
loadCatalog();state=loadAssembly();discoverKits();render();save();
const incoming=route,requestedPack=incoming.get('pack');let available=true,fallbackStep='pack';
if(requestedPack&&requestedPack!==projects?.active){if(projects?.projects.some(entry=>entry.id===requestedPack)){projects.active=requestedPack;state=projects.state();discoverKits();}else{available=false;$('project-status').textContent='The original pack is unavailable. Choose a saved pack. Your kit and intro drafts are still in the library.';}}
const requestedLocation=incoming.get('location');
if(available&&requestedLocation){if(state.locations.some(entry=>entry.id===requestedLocation))state.active=requestedLocation;else{available=false;fallbackStep='locations';$('project-status').textContent='This location was removed. Choose a location and use the saved kit or intro from the library.';}}
const kit=incoming.get('kit'),intro=incoming.get('intro');
if(available&&!saveBlocked&&(kit||intro)){
  if(kit&&!catalog.kits.some(entry=>entry.id===kit)||intro&&!catalog.intros.some(entry=>entry.id===intro))$('project-status').textContent='This saved draft is unavailable. Choose another kit or intro for the location.';
  else{if(!active()){const entry=P.location(crypto.randomUUID());state.locations.push(entry);state.active=entry.id;}if(kit)W.attach(state,'kit',kit);if(intro)W.attach(state,'intro',intro);$('project-status').textContent='Saved work connected to '+(active().fields.title||'this location')+'.';}
}
render();save();setStep(available?(route.get('step')??(kit||intro?'locations':'pack')):fallbackStep,{history:false,focus:false});
function readWorkspace(){
  const libraries={};for(const kind of ['kits','intros'])libraries[kind]=HeritageProject.library(JSON.parse(localStorage.getItem(HeritageProject.keys[kind])??'null'),kind);
  return {id:projects.active,pack:state,libraries};
}
async function writeWorkspace(next,expected){
  if(saveBlocked)throw new Error(storageError);if(!closeEmbedded())throw new Error('Save the open draft before restoring the pack.');
  const expectedPack=JSON.stringify(expected.pack);
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const affected=['kits','intros'].filter(kind=>JSON.stringify(next.libraries[kind])!==JSON.stringify(expected.libraries[kind]));
  const write=()=>{
    const latest=readWorkspace();if(latest.id!==expected.id||JSON.stringify(latest.pack)!==expectedPack)throw new Error('The pack changed while this action was pending. Try it again.');for(const kind of affected)if(JSON.stringify(latest.libraries[kind])!==JSON.stringify(expected.libraries[kind]))throw new Error('The '+kind+' library changed. Try the action again.');
    for(const kind of affected)for(const entry of expected.libraries[kind][kind])if(!next.libraries[kind][kind].some(saved=>saved.id===entry.id)&&projects.projects.some(project=>project.id!==projects.active&&W.usage(project.state,kind==='kits'?'kit':'intro',entry.id).length))throw new Error('This draft is now used by another pack. Remove that connection before undoing its creation.');
    clearTimeout(saveTimer);const previous=projects.serialize(),pack=HeritageProject.validatePack(next.pack);projects.update(pack);
    try{HeritageProject.write(localStorage,{[HeritageProject.keys.packs]:projects.serialize(),...Object.fromEntries(affected.map(kind=>[HeritageProject.keys[kind],next.libraries[kind]]))});}
    catch(error){projects.projects=previous.projects;projects.active=previous.active;throw error;}
    state=pack;loadCatalog();touched.clear();render();$('save-status').textContent='Saved';$('save-status').title='Saved in this browser';
  };
  const lock=index=>index===affected.length?write():navigator.locks.request('heritage-editor:'+HeritageProject.keys[affected[index]],{ifAvailable:true},available=>{if(!available)throw new Error('Close the separate '+(affected[index]==='kits'?'kit':'intro')+' editor tab before changing its saved drafts.');return lock(index+1);});
  await lock(0);
}
if(!saveBlocked){
  try{packTools=HeritagePackAuthoring.create({read:readWorkspace,write:writeWorkspace,prepare:closeEmbedded,flush:flushEmbedded,render,locations:locationOptions,ordered:()=>orderedLocations().map(entry=>entry.id),move:(id,direction)=>{const source=state.locations.find(entry=>entry.id===id),cards=workspaceVisuals.cards(),index=cards.findIndex(spawn=>spawn.id===state.namespace+':'+source?.path),target=cards[index+direction];if(target)reorderLocationCards(cards[index].id,target.id,direction>0);},kitIds:locationKitIds,kits:()=>[...catalog.kits.map(entry=>({id:entry.id,name:entry.name})),...P.bundledKits(state).map(({id,name})=>({id,name}))],intros:()=>catalog.intros,shared:()=>embeddedSession?{kind:embeddedSession.kind,id:embeddedSession.id,locationId:embeddedSession.locationId}:null,open:openEmbedded,
    bulk:(ids,changes)=>{if(!closeEmbedded())return false;state=HeritageEditing.assign(state,ids,changes);historyLabel='Assign '+(changes.kitIds?'kits':'intro')+' to '+ids.length+' locations';renderLocation();renderKits();changed();return true;},
    reorder:ids=>{if(!closeEmbedded())return;state=HeritageEditing.reorder(state,ids,workspaceVisuals.cards());historyLabel='Reorder locations';renderLocation();changed();}
  });locationOptions();}
  catch(error){$('project-status').textContent='Pack history tools could not load: '+error.message;for(const id of ['pack-undo','pack-redo','pack-checkpoints','select-locations'])$(id).disabled=true;}
}
function editPreviewChoice(detail){
  if(!closeEmbedded())return;const entry=state.locations.find(entry=>entry.id===detail.locationId);if(!entry){$('project-status').textContent='This location is unavailable.';return;}
  state.active=entry.id;renderLocation();save();setStep('locations');returnToReview=true;updateSteps();if(detail.kind==='location'){setLocationPart('details');document.querySelector('[data-location-field=title]').focus();}else openEmbedded(detail.kind,detail.id,false,detail.kind==='intro'&&Number.isInteger(detail.resume?.poolIndex)?detail.resume.poolIndex:null);
}
coverageView=HeritageCoverageView.create({get:()=>({id:projects?.active??'',state,output}),visible:()=>currentStep==='preview'||currentStep==='export',summary:text=>{$('export-preview-status').textContent=text;},prepare:closeEmbedded,started:()=>{previewing=fingerprint();},completed:()=>{previewed=previewing;renderOutput();},
  editable:route=>state.locations.some(entry=>state.namespace+':'+entry.path===route.spawnId),edit:editPreviewChoice,
  editRoute:route=>{const entry=state.locations.find(entry=>state.namespace+':'+entry.path===route.spawnId);if(entry)editPreviewChoice({kind:'location',locationId:entry.id});}
});
if(route.get('editing')&&route.get('entry'))openEmbedded(route.get('editing')==='kit'?'kit':'intro',route.get('entry'),false,route.has('destination')?Number(route.get('destination')):null);
if(route.get('example')==='starter')await startExample();
const clean=new URL(location.href);clean.searchParams.delete('example');clean.searchParams.delete('kit');clean.searchParams.delete('intro');clean.searchParams.set('step',currentStep);if(projects)clean.searchParams.set('pack',projects.active);if(state.active)clean.searchParams.set('location',state.active);window.history.replaceState(null,'',clean);

})();
