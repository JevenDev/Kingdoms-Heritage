(() => {
'use strict';
const P=typeof module!=='undefined'?require('../editor/engine.js'):HeritagePreview;
const Scenes=typeof module!=='undefined'?require('../editor/scenes.js'):HeritageScenes;
const bones=['camera','head','body','left_arm','right_arm','left_leg','right_leg'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function vector(value,limit,name){
  const coordinates=Array.isArray(value)?value:[value,value,value];
  if(coordinates.length!==3||coordinates.some(coordinate=>!Number.isFinite(coordinate)||Math.abs(coordinate)>limit)){
    throw new Error(name+' needs numeric coordinates within ±'+limit+'.');
  }
}
function keyframe(value,limit,name){
  if(!object(value)){vector(value,limit,name);return;}
  if(Object.hasOwn(value,'lerp_mode')&&value.lerp_mode!=='linear')throw new Error(name+' uses an unsupported interpolation. Use linear keyframes.');
  vector(value.post,limit,name);
  if(Object.hasOwn(value,'pre'))vector(value.pre,limit,name);
}
function channel(value,duration,limit,name){
  if(!object(value)||Object.hasOwn(value,'post')){keyframe(value,limit,name);return;}
  const entries=Object.entries(value),times=new Set();
  if(!entries.length||entries.length>2048)throw new Error(name+' needs 1 to 2,048 keyframes.');
  for(const [seconds,key] of entries){
    const time=Math.fround(Math.fround(Number(seconds))*20),tick=Math.min(time,duration);
    if(!seconds.trim()||!Number.isFinite(time)||time<0||time>duration+.01)throw new Error(name+' has a keyframe outside the clip.');
    if(times.has(tick))throw new Error(name+' has duplicate keyframe times.');
    times.add(tick);keyframe(key,limit,name);
  }
}
function clipDuration(clip){
  const ticks=clip?.animation_length*20,duration=Math.round(ticks);
  if(!Number.isFinite(clip?.animation_length)||duration<1||duration>1200||Math.abs(ticks-duration)>.01){
    throw new Error('Set the clip length to a whole Minecraft tick (.05 seconds), between .05 and 60 seconds.');
  }
  if(!object(clip.bones))throw new Error('The clip has no bone tracks.');
  let supported=false;
  for(const bone of bones){
    if(!Object.hasOwn(clip.bones,bone))continue;
    const track=clip.bones[bone];
    if(!object(track))throw new Error(bone+' must be a bone track.');
    for(const [name,limit] of [['position',64],['rotation',1440]]){
      if(!Object.hasOwn(track,name))continue;
      channel(track[name],duration,limit,bone+' '+name);
      supported=true;
    }
  }
  if(!supported)throw new Error('Animate a camera or player bone from the Heritage Blockbench template.');
  return duration;
}
function read(source){
  let document;
  try{document=JSON.parse(source.replace(/^\uFEFF/,''));}
  catch{throw new Error('Choose a valid Blockbench animation JSON export.');}
  if(!object(document?.animations)||!Object.keys(document.animations).length){
    throw new Error('Use Export Animations in Blockbench and choose the exported .animation.json file.');
  }
  const clips=Object.entries(document.animations).map(([name,clip])=>{
    try{
      if(!name.trim()||name.length>256)throw new Error('Give the clip a name of up to 256 characters.');
      return {name,duration:clipDuration(clip)};
    }catch(error){return {name,error:error.message};}
  });
  if(!clips.some(clip=>clip.duration))throw new Error(clips[0].name+': '+clips[0].error);
  return {document,clips};
}
function encode(document){
  const bytes=new TextEncoder().encode(JSON.stringify(document));
  let text='';
  for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(text);
}
async function readFile(file){
  if(file.size>32*1024*1024)throw new Error('The export is too large. Export just the clip you want.');
  return read(await file.text());
}
function bindDrop(host,input,button,upload){
  button.addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>{
    const files=[...input.files];input.value='';
    if(files.length)upload(files);
  });
  for(const type of ['dragenter','dragover'])host.addEventListener(type,event=>{
    if(!event.dataTransfer.types.includes('Files'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';host.classList.add('drag-over');
  });
  host.addEventListener('dragleave',event=>{if(!host.contains(event.relatedTarget))host.classList.remove('drag-over');});
  host.addEventListener('drop',event=>{
    event.preventDefault();host.classList.remove('drag-over');
    if(event.dataTransfer.files.length)upload([...event.dataTransfer.files]);
  });
}
function resource(animation,clip,id,name){
  const {document}=animation;
  return {name,path:Scenes.animationPath(id),base64:encode({...document,animations:{[clip]:document.animations[clip]}})};
}
function resourcePack(asset,name){
  return [{path:'pack.mcmeta',content:JSON.stringify({pack:{pack_format:34,description:name.trim()||'Heritage cinematic'}})+'\n'},
    {path:asset.path,content:Uint8Array.from(atob(asset.base64),character=>character.charCodeAt(0))}];
}
function add(pack,animation,{name,clip,perspective,exitPerspective,pause,makeDefault}){
  if(!/^[a-z0-9_.-]+$/.test(pack.namespace)||/^\.+$/.test(pack.namespace))throw new Error('Set a valid Pack ID before importing.');
  const title=name.trim();
  if(!title||title.length>120)throw new Error('Enter an animation name from 1 to 120 characters.');
  const entry=animation.clips.find(entry=>entry.name===clip);
  if(!entry?.duration)throw new Error(entry?.error??'Choose a clip.');
  const data=pack.importedFiles?.data??[],resources=pack.importedFiles?.resources??[];
  const occupied=new Set([...data,...resources].map(file=>file.path));
  const slug=title.toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'intro';
  const paths=path=>({
    definition:'data/'+pack.namespace+'/heritage/cinematics/'+path+'.json',
    asset:'assets/'+pack.namespace+'/heritage/animations/'+path+'.animation.json'
  });
  let path='imported_animations/'+slug,files=paths(path),version=2;
  while(occupied.has(files.definition)||occupied.has(files.asset)){
    path='imported_animations/'+slug+'_'+version++;files=paths(path);
  }
  const id=pack.namespace+':'+path;
  const scene={animation_file:id,clip,duration_ticks:entry.duration,perspective,exit_perspective:exitPerspective,smooth_camera_return:true};
  if(pause!==null)scene.wait_at_ticks=[pause];
  const definition={text:title,animation:'immediate',black_hold_ticks:2,fade_from_black_ticks:10,hold_ticks:8,fade_out_ticks:11,scene};
  P.readJson(JSON.stringify(definition));
  const importedFiles={data:[...data,{path:files.definition,base64:encode(definition)}],
    resources:[...resources,resource(animation,clip,id,title)]};
  const selectionMetadata=makeDefault?{...pack.selectionMetadata,intro_scene:id}:pack.selectionMetadata;
  return {pack:{...pack,importedFiles,selectionMetadata},id};
}
const api={read,readFile,bindDrop,resource,resourcePack,add};
if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageAnimations=api;
})();
