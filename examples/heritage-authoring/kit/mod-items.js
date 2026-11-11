(() => {
'use strict';
const Zip=typeof module!=='undefined'?require('../pack/zip.js'):HeritageZip;
const modelPath=/^assets\/([a-z0-9_.-]+)\/models\/item\/([a-z0-9/._-]+)\.json$/;
const languagePath=/^assets\/([a-z0-9_.-]+)\/lang\/en_us\.json$/;
const resourcePath=/^(?:([a-z0-9_.-]+):)?([a-z0-9/._-]+)$/;
const flatModels=new Set(['minecraft:item/generated','minecraft:item/handheld','minecraft:item/handheld_rod']);
const decoder=new TextDecoder('utf-8',{fatal:true});
const maxArchiveSize=64*1024*1024;
const readJson=async(archive,path,limit=256*1024)=>JSON.parse(decoder.decode(await archive.read(path,limit)));
const hasName=value=>typeof value==='string'&&value.trim()!=='';
const fallbackName=path=>path.split(/[/_.-]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');

function open(bytes) {
  return Zip.open(bytes,{maxEntries:65534,select:path=>/^assets\/[^/]+\/(?:models\/|textures\/|blockstates\/|lang\/en_us\.json$)|^data\/[^/]+\/recipe\//.test(path)});
}

async function index(archive) {
  const names=new Map(),models=[];
  for(const path of archive.paths){
    if(!path.endsWith('.json'))continue;
    if(path.endsWith('/lang/en_us.json')){
      const language=languagePath.exec(path);
      if(language)names.set(language[1],await readJson(archive,path,2*1024*1024));
    }else if(path.includes('/models/item/')){
      const model=modelPath.exec(path);
      if(model&&model[1]!=='minecraft')models.push(model);
    }
  }
  const entries=[];
  for(const [model,namespace,path] of models){
    const id=namespace+':'+path,translations=names.get(namespace),key=namespace+'.'+path.replaceAll('/','.');
    const itemName=translations?.['item.'+key],blockName=translations?.['block.'+key];
    let name=hasName(itemName)?itemName:blockName;
    if(translations&&!hasName(name)){
      // auxiliary models can look like item IDs, so look for a matching recipe result
      const recipePath='data/'+namespace+'/recipe/'+path+'.json';
      if(!archive.has(recipePath))continue;
      const recipe=await readJson(archive,recipePath).catch(()=>null),result=recipe?.result;
      if((result?.id??result)!==id)continue;
      if(path.startsWith('module_'))name=translations['module.'+namespace+'.'+path.slice(7)];
    }
    const block=hasName(blockName)||archive.has('assets/'+namespace+'/blockstates/'+path+'.json');
    entries.push({id,name:hasName(name)?name:fallbackName(path),block,model});
  }
  return entries;
}

function location(value,folder,extension) {
  const match=typeof value==='string'&&resourcePath.exec(value);
  if(!match)return;
  const namespace=match[1]??'minecraft',path=match[2];
  return {id:namespace+':'+path,path:'assets/'+namespace+'/'+folder+'/'+path+extension};
}

async function iconLayers(read,modelPath) {
  const textures=new Map(),visited=new Set();
  let path=modelPath;
  for(;;){
    if(visited.has(path)||visited.size>=32)return;
    visited.add(path);
    const model=await read(path);
    if(!model)return;
    const definition=JSON.parse(decoder.decode(model));
    if(!definition||definition.loader||definition.display?.gui)return;
    for(const [key,value] of Object.entries(definition.textures??{}))if(!textures.has(key))textures.set(key,value);
    const parent=location(definition.parent,'models','.json');
    if(!parent)return;
    if(flatModels.has(parent.id))break;
    path=parent.path;
  }
  const layers=[];
  for(let layer=0;layer<5;layer++){
    let value=textures.get('layer'+layer);
    if(value===undefined)break;
    const aliases=new Set();
    while(typeof value==='string'&&value.startsWith('#')){
      if(aliases.has(value))return;
      aliases.add(value);value=textures.get(value.slice(1));
    }
    const texture=location(value,'textures','.png');
    if(!texture)return;
    layers.push(texture.path);
  }
  return layers.length?layers:undefined;
}

const pending=[];
let loading=0;
function loadNext() {
  while(loading<8&&pending.length){
    const {draw,resolve}=pending.shift();
    loading++;
    draw().catch(()=>null).then(icon=>{loading--;resolve(icon);loadNext();});
  }
}
const enqueue=draw=>new Promise(resolve=>{pending.push({draw,resolve});loadNext();});

async function drawIcon(read,model) {
  const layers=await iconLayers(read,model);
  if(!layers)return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(const path of layers){
    const bytes=await read(path,2*1024*1024);
    if(!bytes||bytes.length<24)return null;
    const png=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const width=png.getUint32(16),height=png.getUint32(20);
    if(png.getUint32(0)!==0x89504e47||png.getUint32(4)!==0x0d0a1a0a||png.getUint32(12)!==0x49484452||!width||!height||width>1024||height>1024)return null;
    const metadata=await read(path+'.mcmeta');
    if(metadata&&JSON.parse(decoder.decode(metadata))?.animation)return null;
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    try{ctx.drawImage(bitmap,0,0,32,32);}finally{bitmap.close();}
  }
  return {canvas,url:canvas.toDataURL()};
}

async function read(files) {
  const archives=[],failures=[];
  for(const file of files){
    try{
      if(!/\.jar$/i.test(file.name))throw new Error('Choose a mod JAR.');
      if(file.size>maxArchiveSize)throw new Error('Mod JARs must be no larger than 64 MiB.');
      const archive=open(new Uint8Array(await file.arrayBuffer())),entries=await index(archive);
      if(!entries.length)failures.push(file.name+' (No Minecraft 1.21.1 item models found.)');
      archives.push({archive,entries});
    }catch(error){failures.push(file.name+' ('+error.message+')');}
  }
  const items=[];
  for(const {archive,entries} of archives){
    const resource=(path,limit=256*1024)=>(archive.has(path)?archive:archives.find(other=>other.archive.has(path))?.archive)?.read(path,limit);
    for(const {model,...entry} of entries){
      let icon;
      const item={...entry,loadIcon:()=>icon??=enqueue(()=>drawIcon(resource,model)).then(sprite=>item.sprite=sprite)};
      items.push(item);
    }
  }
  return {items,failures};
}

const api={read,iconLayers};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageModItems=api;
})();
