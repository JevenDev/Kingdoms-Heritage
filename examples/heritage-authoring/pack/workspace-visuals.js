(() => {
'use strict';
const P=HeritagePreview,F=HeritageFlow,$=id=>document.getElementById(id);
function create({editLocation,editIntro,testFlow,selectContext,reorder,editText,undo,crop,textFits}){
  let current,packView='cards',previewKit='',previewLocation='',expanded=false,poolIndex='',frame=0,lastFrame=0,playing=false,time=0,introKey='',request=0,ready,monitors,currentModel,currentStory;
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
    const spawns=new Map((state.keepLocations?defaults.spawns:[]).map(spawn=>[spawn.id,spawn]));
    for(const file of output.previewFiles){const match=/^data\/([^/]+)\/heritage\/spawns\/(.+)\.json$/.exec(file.path);if(!match)continue;const spawn=JSON.parse(file.content),id=match[1]+':'+match[2];if(spawn.enabled===false)spawns.delete(id);else spawns.set(id,{...spawn,id});}
    const ordered=[...spawns.values()].sort(F.compare);
    const entry=state.locations.find(entry=>entry.id===state.active),id=entry?state.namespace+':'+entry.path:'',spawn=ordered.find(spawn=>spawn.id===id)??ordered[0];
    const ids=entry?.kitMode==='selected'?entry.kits:[...state.kits.filter(kit=>kit.included).map(kit=>kit.id),...(state.keepKits?['bundled-empty']:[])];
    const orderedIds=HeritagePack.orderedKitIds(state,current.catalog).filter(id=>ids.includes(id));
    const kits=orderedIds.map(id=>id==='bundled-empty'?{...defaults.kits[0],id:'bundled-empty'}:current.catalog.kits.find(kit=>kit.id===id)).filter(Boolean);
    const available=[...current.catalog.kits,...(state.keepKits?[{...defaults.kits[0],id:'bundled-empty'}]:[])];
    if(previewLocation!==entry?.id||!available.some(kit=>kit.id===previewKit)){previewLocation=entry?.id;previewKit=kits[0]?.id??available[0]?.id??'';}
    const kitDraft=available.find(kit=>kit.id===previewKit),kit=kitDraft?.document??kitDraft;
    return {ordered,entry,spawn,id,kits,kitError:kitDraft?.error,kit:kitDraft?.error?null:kit};
  }
  function arrival(model){
    const index=poolIndex===''?null:Number(poolIndex),spawn=model.spawn?.type==='pool'&&Number.isInteger(index)?F.destination(model.spawn,index):model.spawn;
    let config=null,error='';if(spawn?.intro)try{config=P.readJson(JSON.stringify(spawn.intro)).config;}catch(issue){error='This intro needs fixing. '+issue.message;}
    return {config,error,names:F.locations(spawn??{}),spawn};
  }
  function draw(now){
    frame=0;if(!current||!monitors||document.hidden||$('flow-dialog').open||current.embedded||!['pack','locations'].includes(current.step))return;
    const scope=current.step==='pack'?'pack':'location',phase=scope==='pack'?packView:current.part==='details'?'cards':current.part==='intro'?'intro':'kits';
    try{
      const model=currentModel,story=currentStory,config=story.config;
      if(playing){time+=Math.min(100,Math.max(0,now-lastFrame))/50;if(time>=P.duration(config??P.packDefaults)){time=P.duration(config??P.packDefaults);playing=false;}}
      lastFrame=now;
      const resolution=$(scope==='pack'?'pack-preview-resolution':'location-preview-resolution').value.split('x').map(Number),guiScale=current.state.guiScale||Number($('flow-scale').value)||3;
      nodes[scope].parentElement.style.setProperty('--monitor-ratio',resolution[0]/resolution[1]);
      const view=monitors[scope].draw({spawns:tools.preview(model.ordered),page:tools.page(),selectedId:model.id,guiScale,width:resolution[0],height:resolution[1],phase,expanded:scope==='location'&&expanded,intro:config,time,names:story.names,pictureData:current.pictureData,kit:model.kit});
      $(scope==='pack'?'pack-visual-scale':'location-visual-scale').textContent=(current.state.guiScale?'Pack GUI scale '+current.state.guiScale:'Player GUI scale '+guiScale+' for this preview')+' · effective '+view.scale;
      if(scope==='location'){
        $('arrival-play').textContent=playing?'Pause':'Play';$('arrival-scrub').value=String(time);$('arrival-time').textContent=seconds(time)+' / '+seconds(config?P.duration(config):0);
      }
      frame=requestAnimationFrame(draw);
    }catch(error){nodes[scope].hidden=true;status(scope,'Player view could not render. '+error.message,true);}
  }
  function start(){if(!frame&&monitors&&currentModel){lastFrame=performance.now();frame=requestAnimationFrame(draw);}}
  async function update(value){
    current=value;const token=++request;if(frame){cancelAnimationFrame(frame);frame=0;}
    $('pack-file-label').textContent=HeritagePack.slug(value.state.name)+(value.output.resourceFiles.length?'-data':'')+'.zip';$('pack-description-preview').textContent=value.state.description;
    const disabled=$('preview-flow').disabled;$('pack-try-flow').disabled=$('location-try-flow').disabled=disabled;
    const scope=value.step==='pack'?'pack':'location';
    try{
      await prepare();if(token!==request)return;const fits=documents();textFits(new Map(fits.ordered.map(spawn=>[spawn.id,monitors.pack.textFit(spawn)])));if(!['pack','locations'].includes(value.step)){tools.update(null);return;}
      const pictures=Object.values(value.pictureData).map(data=>({data}));await Promise.all(Object.values(monitors).map(monitor=>monitor.pictures(pictures)));if(token!==request)return;
      const model=documents(),field=$('intro-preview-destination');field.replaceChildren(new Option('Pool default',''),...(model.spawn?.pool??[]).map((destination,index)=>new Option('Place '+(index+1)+' · '+(F.place(destination.target)||destination.type),String(index))));
      if(poolIndex!==''&&!model.spawn?.pool?.[Number(poolIndex)])poolIndex='';field.value=poolIndex;$('arrival-destination-field').hidden=value.part!=='intro'||model.spawn?.type!=='pool';
      currentModel=model;tools.update({...value,model,packCards:packView==='cards',translations:monitors.pack.defaults.translations});if(value.embedded)return;currentStory=arrival(model);const story=currentStory,config=story.config,key=JSON.stringify([model.id,poolIndex,config]);if(key!==introKey){introKey=key;playing=false;time=config?Math.min(P.duration(config)-1,config.black_hold_ticks+config.reveal_ticks+20):0;}
      $('arrival-transport').hidden=value.part!=='intro'||!config;$('arrival-scrub').max=String(config?P.duration(config):0);
      $('card-description-toggle').hidden=value.part!=='details';$('card-description-toggle').setAttribute('aria-pressed',String(expanded));$('card-description-toggle').textContent=expanded?'Hide description':'Show description';
      $('location-visual-heading').textContent=value.part==='intro'?'Arrival preview':value.part==='kits'?'Kit selection preview':'Selection screen';
      const place=story.spawn?.type==='pool'?'Pool default':story.spawn?.type==='fixed'?['x','y','z'].map(key=>story.spawn[key]).join(', '):F.place(story.spawn?.target)||(story.spawn?.type==='random'?'Random place':'World spawn');
      $('location-preview-caption').textContent=value.part==='intro'?(config?place+' · Sample terrain.':'This arrival enters the world without an intro.'):value.part==='kits'?'Read-only equipment preview. Edit a kit to change its items.':'Click card text to edit it. Drag cards to reorder. Double-click an image to crop it.';
      const facts=$('intro-assignment-facts');facts.replaceChildren();
      if(config)for(const [label,text] of [['Duration',seconds(P.duration(config))],['Text reveal',config.animation.replaceAll('_',' ')],['Cinematic bars',config.cinematic_bars?(config.bar_style==='random'?'Slanted':'Straight')+' · '+config.bar_height+' GUI px':'Off'],['Player control',config.control==='after_title'?'After the intro':'During the intro']]){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=text;facts.append(term,detail);}
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
  for(const button of document.querySelectorAll('[data-workspace-view]'))button.addEventListener('click',()=>{packView=button.dataset.workspaceView;for(const tab of document.querySelectorAll('[data-workspace-view]'))tab.setAttribute('aria-pressed',String(tab===button));if(packView==='intro'){playing=true;time=0;}update(current);});
  for(const id of ['pack-preview-resolution','location-preview-resolution'])$(id).addEventListener('change',()=>{const value=$(id).value;$('pack-preview-resolution').value=$('location-preview-resolution').value=value;update(current);});
  for(const id of ['pack-try-flow','location-try-flow'])$(id).addEventListener('click',testFlow);
  $('card-description-toggle').addEventListener('click',()=>{expanded=!expanded;update(current);});
  document.addEventListener('focusin',event=>{if(event.target.matches('[data-location-field=description]')&&!expanded){expanded=true;update(current);}});
  $('intro-preview-destination').addEventListener('change',event=>{poolIndex=event.target.value;update(current);});
  $('arrival-play').addEventListener('click',()=>{if(time>=Number($('arrival-scrub').max))time=0;playing=!playing;start();});
  $('arrival-restart').addEventListener('click',()=>{time=0;playing=true;start();});
  $('arrival-scrub').addEventListener('input',event=>{time=Number(event.target.value);playing=false;start();});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-preview-kit]');if(button){previewKit=button.dataset.previewKit;update(current);}const intro=event.target.closest('[data-intro-stage]');if(intro)editIntro(intro.dataset.introStage);});
  for(const node of Object.values(nodes))node.tabIndex=0;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});$('flow-dialog').addEventListener('close',start);
  return {update,detach:tools.detach,select:selectContext};
}
globalThis.HeritageWorkspaceVisuals={create};
})();
