(() => {
'use strict';
const P=HeritagePreview,F=HeritageFlow,$=id=>document.getElementById(id);
function create({editLocation,editIntro,testFlow,selectContext,reorder,editText,undo,crop,textFits}){
  let current,packView='cards',previewKit='',previewLocation='',expanded=false,poolIndex='',frame=0,lastFrame=0,playing=false,time=0,introKey='',request=0,ready,monitors,currentModel,currentStory;
  const speech=HeritageDialogueAudio.create({muted:()=>$('flow-mute').checked});let speechRunning=false,playAttempt=0;
  const stopSpeech=()=>{speech.stop();speechRunning=false;};
  const seconds=ticks=>(Math.round(ticks/2)/10)+' s';
  const nodes={pack:$('pack-player-view'),location:$('location-card')};
  const tools=HeritageCardTools.create({editLocation,selectContext,reorder,editText,undo,crop,fit:spawn=>monitors.pack.textFit(spawn),collapse:()=>{expanded=false;}});
  const status=(scope,message,error=false)=>{const node=$(scope==='pack'?'pack-visual-status':'card-preview-status');node.textContent=message;node.classList.toggle('error',error);};
  async function prepare(){
    if(ready)return ready;
    ready=Promise.all(Object.values(nodes).map(node=>HeritageFlowPreview.monitorPreview(node))).then(views=>{HeritageInventory.setupTooltips('pack');monitors={pack:views[0],location:views[1]};for(const [scope,node] of Object.entries(nodes))tools.connect(scope,node,monitors[scope]);return monitors;}).catch(error=>{ready=null;throw error;});return ready;
  }
  function documents(){
    const {state,output}=current,defaults=monitors.pack.defaults;
    const invalidKits=new Set(state.kits.filter(kit=>current.catalog.kits.some(draft=>draft.id===kit.id&&draft.error)).map(kit=>'data/'+state.namespace+'/heritage/kits/'+kit.path+'.json'));
    const choices=F.catalog({errors:[],files:output.previewFiles.filter(file=>!invalidKits.has(file.path))},{...defaults,spawns:state.keepLocations?defaults.spawns:[],kits:state.keepKits?defaults.kits:[]}),ordered=choices.spawns;
    const entry=state.locations.find(entry=>entry.id===state.active),id=entry?state.namespace+':'+entry.path:'',spawn=ordered.find(spawn=>spawn.id===id)??ordered[0];
    const kits=choices.kits.filter(kit=>spawn?.kits.includes(kit.id)).map(document=>{
      const selection=state.kits.find(kit=>kit.included&&state.namespace+':'+kit.path===document.id),draft=current.catalog.kits.find(kit=>kit.id===selection?.id);
      return {id:selection?.id??(document.id==='kingdomsheritage:default'?'bundled-empty':document.id),document,error:draft?.error};
    });
    if(previewLocation!==entry?.id||!kits.some(kit=>kit.id===previewKit)){previewLocation=entry?.id;previewKit=kits[0]?.id??'';}
    const kitDraft=kits.find(kit=>kit.id===previewKit),kit=kitDraft?.document;
    return {ordered,entry,spawn,id,kits,kitError:kitDraft?.error,kit:kitDraft?.error?null:kit};
  }
  function arrival(model){
    const index=poolIndex===''?null:Number(poolIndex),spawn=model.spawn?.type==='pool'&&Number.isInteger(index)?F.destination(model.spawn,index):model.spawn;
    let config=null,error='';if(spawn?.intro)try{config=P.readJson(JSON.stringify(spawn.intro)).config;}catch(issue){error='This intro needs fixing. '+issue.message;}
    return {config,error,names:F.context(spawn??{},model.kit??{title:'Empty-handed',items:[]},'Player',F.locations(spawn??{}),monitors.pack.defaults.translations),spawn};
  }
  function draw(now){
    frame=0;if(!current||!monitors||document.hidden||$('flow-dialog').open||current.embedded||!['pack','locations'].includes(current.step)){stopSpeech();return;}
    const scope=current.step==='pack'?'pack':'location',phase=scope==='pack'?packView:current.part==='details'?'cards':current.part==='intro'?'intro':'kits';
    try{
      const model=currentModel,story=currentStory,config=story.config;
      if(playing){time+=Math.max(0,now-lastFrame)/50;if(time>=P.duration(config??P.packDefaults,story.names)){time=P.duration(config??P.packDefaults,story.names);playing=false;}}
      lastFrame=now;
      if(phase==='intro'&&playing&&config?.blip){if(!speechRunning){speechRunning=true;speech.start(P.blipCues(config,story.names),()=>time).catch(error=>status(scope,'Preview audio could not load: '+error.message,true));}}
      else if(speechRunning)stopSpeech();
      const resolution=$(scope==='pack'?'pack-preview-resolution':'location-preview-resolution').value.split('x').map(Number),guiScale=current.state.guiScale||Number($('flow-scale').value);
      nodes[scope].parentElement.style.setProperty('--monitor-ratio',resolution[0]/resolution[1]);
      const view=monitors[scope].draw({spawns:tools.preview(model.ordered),page:tools.page(),selectedId:model.id,guiScale,width:resolution[0],height:resolution[1],phase,expanded:scope==='location'&&expanded,intro:config,time,names:story.names,pictureData:current.pictureData,kit:model.kit,kitIndex:model.kits.findIndex(kit=>kit.id===previewKit),kitCount:model.kits.length});
      $(scope==='pack'?'pack-visual-scale':'location-visual-scale').textContent=(current.state.guiScale?'Pack GUI scale '+current.state.guiScale:'Player GUI scale '+(guiScale||'Auto')+' for this preview')+' · effective '+view.scale;
      if(scope==='location'){
        $('arrival-play').textContent=playing?'Pause':'Play';$('arrival-scrub').value=String(time);$('arrival-time').textContent=seconds(time)+' / '+seconds(config?P.duration(config,currentStory.names):0);
      }
      frame=requestAnimationFrame(draw);
    }catch(error){nodes[scope].hidden=true;status(scope,'Player view could not render. '+error.message,true);}
  }
  function start(){if(!frame&&monitors&&currentModel){lastFrame=performance.now();frame=requestAnimationFrame(draw);}}
  async function update(value){
    playAttempt++;stopSpeech();current=value;const token=++request;if(frame){cancelAnimationFrame(frame);frame=0;}
    $('pack-file-label').textContent=HeritagePack.slug(value.state.name)+(value.output.resourceFiles.length?'-data':'')+'.zip';$('pack-description-preview').textContent=value.state.description;
    const disabled=$('preview-flow').disabled;$('pack-try-flow').disabled=$('location-try-flow').disabled=disabled;
    const scope=value.step==='pack'?'pack':'location';
    try{
      await prepare();if(token!==request)return;const fits=documents();textFits(new Map(fits.ordered.map(spawn=>[spawn.id,monitors.pack.textFit(spawn)])));if(!['pack','locations'].includes(value.step)){tools.update(null);return;}
      const pictures=Object.values(value.pictureData).map(data=>({data}));await Promise.all(Object.values(monitors).map(monitor=>monitor.pictures(pictures)));if(token!==request)return;
      const model=documents(),field=$('intro-preview-destination');field.replaceChildren(new Option('Pool default',''),...(model.spawn?.pool??[]).map((destination,index)=>new Option('Place '+(index+1)+' · '+(F.place(destination.target)||destination.type),String(index))));
      if(poolIndex!==''&&!model.spawn?.pool?.[Number(poolIndex)])poolIndex='';field.value=poolIndex;$('arrival-destination-field').hidden=value.part!=='intro'||model.spawn?.type!=='pool';
      currentModel=model;tools.update({...value,model,packCards:packView==='cards',translations:monitors.pack.defaults.translations});if(value.embedded)return;currentStory=arrival(model);const story=currentStory,config=story.config,key=JSON.stringify([model.id,poolIndex,config]);if(key!==introKey){introKey=key;playing=false;time=config?Math.min(P.duration(config,currentStory.names)-1,P.textStart(config)+P.revealDuration(config,currentStory.names)+20):0;}
      $('pack-preview-mute').hidden=packView!=='intro';
      $('arrival-transport').hidden=value.part!=='intro'||!config;$('arrival-scrub').max=String(config?P.duration(config,currentStory.names):0);
      $('card-description-toggle').hidden=value.part!=='details';$('card-description-toggle').setAttribute('aria-pressed',String(expanded));$('card-description-toggle').textContent=expanded?'Hide description':'Show description';
      $('location-visual-heading').textContent=value.part==='intro'?'Arrival preview':value.part==='kits'?'Kit selection preview':'Selection screen';
      const place=story.spawn?.type==='pool'?'Pool default':story.spawn?.type==='fixed'?['x','y','z'].map(key=>story.spawn[key]).join(', '):F.place(story.spawn?.target)||(story.spawn?.type==='random'?'Random place':'World spawn');
      $('location-preview-caption').textContent=value.part==='intro'?(config?place+' · Sample terrain.':'This arrival enters the world without an intro.'):value.part==='kits'?'Read-only equipment preview. Edit a kit to change its items.':'Click card text to edit it. Drag cards to reorder. Double-click an image to crop it.';
      const facts=$('intro-assignment-facts');facts.replaceChildren();
      if(config)for(const [label,text] of [['Duration',seconds(P.duration(config,currentStory.names))],['Text reveal',config.animation.replaceAll('_',' ')],['Cinematic bars',config.cinematic_bars?(config.bar_style==='random'?'Slanted':'Straight')+' · '+config.bar_height+' GUI px':'Off'],['Player control',config.control==='after_title'?'After the intro':'During the intro']]){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=text;facts.append(term,detail);}
      $('intro-edit-shortcuts').hidden=!model.entry?.intro||!value.catalog.intros.some(draft=>draft.id===model.entry.intro);
      for(const button of document.querySelectorAll('[data-preview-kit]'))button.setAttribute('aria-pressed',String(button.dataset.previewKit===previewKit));
      nodes[scope].hidden=false;nodes[scope].setAttribute('aria-label',(scope==='pack'?'Pack':model.entry?.fields.title||'Location')+' player preview');
      const phase=scope==='pack'?packView:value.part,issue=phase==='intro'?story.error:phase==='kits'?model.kitError:'',pictureIssue=value.pictureErrors?.[model.entry?.id];
      const resourceHint=monitors[scope].needsResourcePack(model.spawn,value.pictureData[model.spawn?.id])?'This image needs its resource pack. The card uses the same fallback as Minecraft.':'';
      const hint=scope==='pack'?(packView==='cards'?'Click text to edit. Drag cards to reorder. Double-click an image to crop.':packView==='intro'?'Arrival after confirming a location and kit. Sample terrain.':'Equipment shown for the active location.'):'';
      status(scope,issue||pictureIssue||(value.output.errors.length?'Draft view. Resolve the highlighted issues before testing the full flow.':resourceHint||hint),!!issue||!!pictureIssue);
      start();
    }catch(error){if(token===request){nodes[scope].hidden=true;status(scope,'Player view could not load. '+error.message,true);}}
  }
  for(const button of document.querySelectorAll('[data-workspace-view]'))button.addEventListener('click',async()=>{const selected=button.dataset.workspaceView;packView=selected;for(const tab of document.querySelectorAll('[data-workspace-view]'))tab.setAttribute('aria-pressed',String(tab===button));if(packView==='intro'){try{await speech.prepare();}catch(error){status('pack',error.message,true);}if(packView!==selected)return;playing=true;time=0;}update(current);});
  for(const id of ['pack-preview-resolution','location-preview-resolution'])$(id).addEventListener('change',()=>{const value=$(id).value;$('pack-preview-resolution').value=$('location-preview-resolution').value=value;update(current);});
  for(const id of ['pack-try-flow','location-try-flow'])$(id).addEventListener('click',testFlow);
  $('card-description-toggle').addEventListener('click',()=>{expanded=!expanded;update(current);});
  document.addEventListener('focusin',event=>{if(event.target.matches('[data-location-field=description]')&&!expanded){expanded=true;update(current);}});
  $('intro-preview-destination').addEventListener('change',event=>{poolIndex=event.target.value;update(current);});
  async function playArrival(restart=false){
    if(playing&&!restart){playAttempt++;playing=false;stopSpeech();start();return;}
    const attempt=++playAttempt;if(currentStory?.config?.blip&&!$('flow-mute').checked)try{await speech.prepare();}catch(error){status('location',error.message,true);}if(attempt!==playAttempt)return;
    if(restart||time>=Number($('arrival-scrub').max))time=0;stopSpeech();playing=true;lastFrame=performance.now();start();
  }
  $('arrival-play').addEventListener('click',()=>playArrival());$('arrival-restart').addEventListener('click',()=>playArrival(true));
  $('arrival-scrub').addEventListener('input',event=>{playAttempt++;time=Number(event.target.value);playing=false;stopSpeech();start();});
  function syncMute(){stopSpeech();speech.syncMute();const muted=$('flow-mute').checked,label=muted?'Unmute preview sound':'Mute preview sound';for(const id of ['arrival-mute','pack-preview-mute']){HeritageIcons.action(id,muted?'volume-x':'volume-2','');$(id).setAttribute('aria-label',label);$(id).dataset.tooltip=JSON.stringify(['Preview audio',label]);}}
  for(const id of ['arrival-mute','pack-preview-mute'])$(id).addEventListener('click',()=>{$('flow-mute').checked=!$('flow-mute').checked;$('flow-mute').dispatchEvent(new Event('change'));});$('flow-mute').addEventListener('change',syncMute);syncMute();
  document.addEventListener('click',event=>{const button=event.target.closest('[data-preview-kit]');if(button){previewKit=button.dataset.previewKit;update(current);}const intro=event.target.closest('[data-intro-stage]');if(intro)editIntro(intro.dataset.introStage);});
  for(const node of Object.values(nodes))node.tabIndex=0;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){playAttempt++;stopSpeech();}else start();});$('flow-dialog').addEventListener('close',start);
  return {update,detach:tools.detach,select:selectContext,cards:()=>monitors&&current?documents().ordered:[]};
}
globalThis.HeritageWorkspaceVisuals={create};
})();
