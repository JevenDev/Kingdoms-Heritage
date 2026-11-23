(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePreview;
const bundleUrl=typeof module==='undefined'?new URL('../pack/assets/defaults.json?v=12',document.currentScript.src):null;
const defaultSceneId='kingdomsheritage:wake_up',fadeTicks=10;
const presets=[
  {id:defaultSceneId,label:'Wake-up · First person'},
  {id:'kingdomsheritage:wake_up_third_person',label:'Wake-up · Third person'},
  {id:'kingdomsheritage:wake_up_ground_brace',label:'Ground brace · First person'},
  {id:'kingdomsheritage:wake_up_third_person_ground_brace',label:'Ground brace · Third person'}
];
let loading;
function defaults(){
  if(!bundleUrl)return Promise.resolve(require('../pack/assets/defaults.json'));
  return loading??=fetch(bundleUrl).then(response=>{
    if(!response.ok)throw new Error('Bundled Heritage defaults could not load.');
    return response.json();
  }).catch(error=>{loading=null;throw error;});
}
function arrivalIntro(intro,kitScene,defaultScene,cinematics=[]){
  if(kitScene===null||intro?.scene!==undefined||String(intro?.control).toLowerCase()==='during_title')return intro;
  const id=kitScene??(intro?defaultScene:null);
  const cinematic=typeof id==='string'&&cinematics.find(entry=>entry.id===(id.includes(':')?id:'minecraft:'+id));
  if(!cinematic?.scene)return intro;
  const {id:resource,...definition}=cinematic;
  if(!intro)return definition;
  return {...intro,scene:definition.scene,
    black_hold_ticks:definition.black_hold_ticks??P.packDefaults.black_hold_ticks,
    fade_from_black_ticks:definition.fade_from_black_ticks??P.packDefaults.fade_from_black_ticks};
}
function withDefault(intro,bundled){
  return arrivalIntro(intro,undefined,bundled.selection?.intro_scene,bundled.cinematics);
}
function animationPath(id){
  const colon=id?.indexOf(':')??-1,namespace=colon<0?'minecraft':id.slice(0,colon),path=id?.slice(colon+1);
  return path?'assets/'+namespace+'/heritage/animations/'+path+'.animation.json':null;
}
function sceneAsset(asset,scene){
  return scene?.animation_file&&asset?.path===animationPath(scene.animation_file)&&typeof asset.base64==='string'?asset:null;
}
function sameClip(scene,other){
  return !!scene&&!!other&&scene.animation_file===other.animation_file&&scene.clip===other.clip;
}
function importedCinematics(files=[]){
  const cinematics=[];
  for(const file of files){
    const match=/^data\/([^/]+)\/heritage\/cinematics\/(.+)\.json$/.exec(file.path);
    if(!match)continue;
    try{
      const definition=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.base64),char=>char.charCodeAt(0))));
      if(definition?.enabled!==false&&definition?.scene)cinematics.push({...definition,id:match[1]+':'+match[2]});
    }catch(error){
      if(!(error instanceof SyntaxError||error instanceof DOMException))throw error;
    }
  }
  return cinematics;
}
function cinematicChoices(cinematics){
  return cinematics.filter(entry=>!presets.some(preset=>preset.id===entry.id))
    .map(entry=>({id:entry.id,label:typeof entry.text==='string'?entry.text:entry.id}));
}
function referencePicker(select,input,{inherit=false,change}){
  const label=input.closest('label');
  let entryKey;
  function fill(entries){
    const key=JSON.stringify(entries);
    if(key===entryKey)return;
    entryKey=key;
    const options=[...(inherit?[{id:'inherit',label:'Use pack setting'}]:[]),{id:'none',label:'None'},...presets,...entries,{id:'custom',label:'Custom cinematic ID…'}];
    select.replaceChildren(...options.map(choice=>new Option(choice.label,choice.id)));
  }
  fill([]);
  function showCustom(visible){
    label.hidden=!visible;
    input.setCustomValidity('');
  }
  select.addEventListener('change',()=>{
    const value=select.value;
    showCustom(value==='custom');
    if(value==='custom'){input.focus();return;}
    change(value==='none'?null:value==='inherit'?undefined:value);
  });
  input.addEventListener('input',()=>input.setCustomValidity(''));
  input.addEventListener('change',()=>{
    const id=input.value.trim();
    if(!/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/.test(id)){
      input.setCustomValidity('Enter a cinematic resource ID.');
      input.reportValidity();return;
    }
    input.value=id;change(id);
  });
  return {
    update(value,entries=[]){
      fill(entries);
      const named=[...presets,...entries].some(entry=>entry.id===value);
      select.value=value==null?value===undefined&&inherit?'inherit':'none':named?value:'custom';
      if(value!=null&&!named)input.value=value;
      showCustom(select.value==='custom');
    },
    lock(locked){select.disabled=input.disabled=locked;}
  };
}
function timing(config,names={}){
  const overlay=P.overlayDuration(config,names),pauses=P.scenePauses(config.scene);
  const delay=pauses.length?Math.max(0,overlay-pauses[0].tick):0;
  const duration=config.scene?.duration_ticks??0,returnTicks=config.scene?.smooth_camera_return?12:0;
  const waits=pauses.map((pause,index)=>{
    const at=pause.tick+delay+index*fadeTicks;
    return {...pause,at,end:at+fadeTicks};
  });
  return {overlay,delay,total:Math.max(overlay,duration+returnTicks+delay+waits.length*fadeTicks),waits};
}
function clipTime(time,{waits,delay}){
  if(waits.length)time-=Math.min(delay,Math.max(0,time-waits[0].tick));
  for(const wait of waits)time-=P.clamp(time-wait.tick,0,fadeTicks);
  return time;
}
const keyDefaults={...P.keyDefaults,'key.swapOffhand':'F','key.pickItem':'Middle Button','key.chat':'T','key.playerlist':'Tab'};
function prompt(pause,names={}){
  const binding=pause.key??'key.inventory',keys={...keyDefaults,...names.keys};
  const label=(Object.hasOwn(keys,binding)&&keys[binding])||keys['key.inventory']||keyDefaults['key.inventory'];
  const parts=(pause.prompt??'Press {key} to continue').split('{key}');
  const glyphs=[];
  const append=(text,tint)=>{for(const ch of text)glyphs.push({ch,tint,effect:{},index:glyphs.length});};
  append(parts[0],P.colors.white);
  for(const part of parts.slice(1)){append('['+label+']',P.colors.yellow);append(part,P.colors.white);}
  return {label,glyphs,text:glyphs.map(glyph=>glyph.ch).join('')};
}
function matchesKey(event,label){
  if(event.defaultPrevented||event.repeat||event.ctrlKey&&event.key!=='Control'
      ||event.metaKey&&event.key!=='Meta'||event.altKey&&event.key!=='Alt'
      ||event.target.closest?.('input,textarea,select,[contenteditable]'))return false;
  const keys=[event.key===' '?'Space':event.key,event.code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/,'$2 $1')];
  return keys.some(key=>key.toLowerCase()===label.toLowerCase());
}
const api={defaultSceneId,presets,defaults,arrivalIntro,withDefault,animationPath,sceneAsset,sameClip,importedCinematics,cinematicChoices,referencePicker,timing,clipTime,keyDefaults,prompt,matchesKey};
if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageScenes=api;
})();
