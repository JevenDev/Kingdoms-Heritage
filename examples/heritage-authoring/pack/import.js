(() => {
'use strict';
const Zip=typeof module!=='undefined'?require('./zip.js'):HeritageZip;
const Pack=typeof module!=='undefined'?require('./engine.js'):HeritagePack;
if(typeof module!=='undefined')require('../kit/catalog.js');
const Kit=typeof module!=='undefined'?require('../kit/engine.js'):HeritageKit;
const Intro=typeof module!=='undefined'?require('../editor/engine.js'):HeritagePreview;
const Project=typeof module!=='undefined'?require('./project.js'):HeritageProject;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const decoder=new TextDecoder('utf-8',{fatal:true});
function base64(bytes){let result='';for(let at=0;at<bytes.length;at+=32768)result+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(result);}
function json(files,path){
  if(!files.has(path))throw new Error('Missing '+path+'. Open a ZIP with pack.mcmeta at its root.');
  try{return JSON.parse(decoder.decode(files.get(path)));}
  catch(error){throw new Error(path+': '+error.message);}
}
async function read(bytes,name='Imported pack.zip',createId=()=>crypto.randomUUID()) {
  let data=new Map((await Zip.unzip(bytes)).map(file=>[file.path,file.content])),resources=new Map();
  if(!data.has('pack.mcmeta')){
    const archives=[...data].filter(([path])=>path.endsWith('.zip'));
    if(!archives.length||archives.length!==data.size||archives.length>2)throw new Error('Open a datapack ZIP or the builder\'s paired pack download.');
    data=new Map();
    for(const [path,content] of archives){
      const files=new Map((await Zip.unzip(content)).map(file=>[file.path,file.content])),metadata=json(files,'pack.mcmeta');
      if(metadata?.pack?.pack_format===48){if(data.size)throw new Error('Open one datapack at a time.');data=files;}
      else if(metadata?.pack?.pack_format===34){if(resources.size)throw new Error('Open one resource pack at a time.');resources=files;}
      else throw new Error(path+' is not a Minecraft 1.21.1 data or resource pack.');
    }
  }
  if(data.size+resources.size>4096||[...data.values(),...resources.values()].reduce((total,bytes)=>total+bytes.length,0)>64*1024*1024)throw new Error('Combined pack contents exceed the import size limit.');
  const metadata=json(data,'pack.mcmeta');
  if(!object(metadata)||!object(metadata.pack)||metadata.pack.pack_format!==48)throw new Error('Open a Minecraft 1.21.1 datapack with pack_format 48.');
  const resourceMetadata=resources.size?json(resources,'pack.mcmeta'):null,imageFiles=new Map(resources);
  const definitions=[];
  for(const [path] of data){
    const match=/^data\/([^/]+)\/heritage\/(spawns|kits)\/(.+)\.json$/.exec(path);
    if(!match)continue;
    const [,namespace,kind,id]=match,document=json(data,path);
    if(!object(document))throw new Error(path+' must contain a JSON object.');
    if(!/^[a-z0-9_.-]+$/.test(namespace))throw new Error('Invalid namespace in '+path);
    Pack.fileId(id,'Definition path');definitions.push({path,namespace,kind,id,document});
  }
  const namespaces=new Set(definitions.filter(entry=>entry.document.enabled!==false&&entry.namespace!=='kingdomsheritage').map(entry=>entry.namespace));
  if(namespaces.size>1)throw new Error('This pack uses multiple custom Heritage namespaces. Open a pack with one custom namespace.');
  const namespace=[...namespaces][0]??'kingdomsheritage',bundled=['default','random','plains','village'];
  const disabled=new Set(definitions.filter(entry=>entry.namespace==='kingdomsheritage'&&entry.kind==='spawns'&&entry.document.enabled===false).map(entry=>entry.id));
  if(bundled.some(id=>disabled.has(id))&&bundled.some(id=>!definitions.some(entry=>entry.namespace==='kingdomsheritage'&&entry.kind==='spawns'&&entry.id===id)))throw new Error('This pack partially overrides the bundled locations. Include all four bundled location definitions before importing.');
  const description=typeof metadata.pack.description==='string'?metadata.pack.description:JSON.stringify(metadata.pack.description??'Imported Heritage pack');
  const state={version:1,name:name.replace(/(?:-packs|-data)?\.zip$/i,'')||'Imported pack',namespace,description,keepKits:true,keepLocations:!bundled.some(id=>disabled.has(id)),allowCustomTargets:true,kits:[],locations:[],active:'',packMetadata:metadata,importedFiles:{data:[],resources:[]}};
  const libraries={kits:{version:2,active:'',kits:[]},intros:{version:2,active:'',intros:[]}},kits=new Map(),catalog={kits:[],intros:[]};
  const stock=new Set(Pack.bundledKits(state).map(entry=>entry.resource));
  const overrides=definitions.filter(entry=>entry.kind==='kits'&&stock.has(entry.namespace+':'+entry.id));
  const defaultKit=overrides.find(entry=>entry.id==='default');
  const usesOtherStock=overrides.some(entry=>entry.id!=='default'&&entry.document.enabled!==false)
    ||definitions.some(entry=>entry.kind==='spawns'&&Array.isArray(entry.document.kits)
      &&entry.document.kits.some(id=>id!=='kingdomsheritage:default'&&stock.has(id)));
  if(defaultKit?.document.enabled===false&&!usesOtherStock)state.keepKits=false;
  if(state.keepKits)for(const entry of overrides){
    Kit.read(JSON.stringify(entry.document));
    (state.bundledKits??={})[entry.namespace+':'+entry.id]=Pack.copy(entry.document);
    data.delete(entry.path);
  }
  function draft(kind,document,title){
    const id=createId(),source=JSON.stringify(document,null,2),value={source,document:Pack.copy(document)};
    if(kind==='kits'){
      Kit.read(source);Object.assign(value,{validDocument:Pack.copy(document),cursor:null,selected:0,selection:[],selectionMode:false,drafts:[],loreSources:[],error:null,preview:null});
    }else{Intro.readJson(source);Object.assign(value,{name:title,selection:[0,0],validation:{error:null,fromJson:false}});}
    libraries[kind][kind].push({id,state:value});if(!libraries[kind].active)libraries[kind].active=id;
    catalog[kind].push({id,name:title,document:Pack.copy(document),error:'',warnings:[]});return id;
  }
  for(const entry of definitions){
    if(entry.namespace!==namespace||entry.kind!=='kits'||entry.document.enabled===false
      ||state.keepKits&&stock.has(entry.namespace+':'+entry.id))continue;
    const id=draft('kits',entry.document,entry.document.title??entry.id);
    state.kits.push({id,path:entry.id,included:true});kits.set(namespace+':'+entry.id,{id,document:entry.document});data.delete(entry.path);
  }
  for(const entry of Pack.bundledKits(state))kits.set(entry.resource,{id:entry.id,document:entry.document});
  for(const entry of definitions){
    if(entry.document.enabled===false||entry.kind!=='spawns')continue;
    if(entry.namespace!==namespace){
      if(entry.namespace==='kingdomsheritage'&&bundled.includes(entry.id)){(state.bundledLocations??={})['kingdomsheritage:'+entry.id]=Pack.copy(entry.document);data.delete(entry.path);}
      else throw new Error('Unsupported Heritage namespace in '+entry.path);
      continue;
    }
    const document=entry.document;Pack.validateSpawn(document,true);
    const location=Pack.location(createId());location.path=entry.id;location.document=Pack.copy(document);
    location.fields=Object.fromEntries(Pack.fields.filter(key=>Object.hasOwn(document,key)).map(key=>[key,document[key]]));location.fields.type=document.type.toLowerCase();
    location.kitMode='all';location.importedKitSelectors=Pack.copy(document.kits??[]);
    if(document.kits?.length){
      location.kitMode='selected';
      for(const selector of document.kits){
        const matches=[...kits].filter(([id,kit])=>selector.startsWith('#')?(kit.document.tags??[]).includes(selector.slice(1)):id===(selector.includes(':')?selector:'minecraft:'+selector));
        if(!matches.length)throw new Error(entry.path+' references an unavailable kit or tag: '+selector+'. Include its kits in the datapack.');
        for(const [,kit] of matches)if(!location.kits.includes(kit.id))location.kits.push(kit.id);
      }
    }
    if(document.intro)location.intro=draft('intros',document.intro,(document.title??entry.id)+' intro');
    location.destinations=(document.pool??[]).map((destination,index)=>{
      const result=Pack.copy(destination);result.type=destination.type.toLowerCase();
      if(object(result.intro))result.intro=draft('intros',result.intro,(document.title??entry.id)+' place '+(index+1)+' intro');
      return result;
    });
    if(document.image){
      const parts=document.image.split(':'),path=parts.length===2?'assets/'+parts[0]+'/'+parts[1]:'assets/minecraft/'+parts[0],image=imageFiles.get(path);
      if(image){
        const picture={name:path.split('/').at(-1),data:'data:image/png;base64,'+base64(image),keepResolution:true};
        Pack.pictureBytes(picture);location.picture=picture;location.imageMode='upload';if(path==='assets/'+namespace+'/textures/gui/locations/'+entry.id+'.png')resources.delete(path);
      }
    }
    state.locations.push(location);data.delete(entry.path);
  }
  if(!state.locations.length)throw new Error('This datapack has no enabled starting locations to edit.');
  state.active=state.locations[0].id;
  if(data.has(Pack.selectionPath)){
    const selection=json(data,Pack.selectionPath);state.guiScale=selection.gui_scale??0;
    if(!Number.isInteger(state.guiScale)||state.guiScale<0||state.guiScale>16)throw new Error('Invalid selection GUI scale.');
    if(Object.hasOwn(selection,'kit_preview')){
      if(!['inventory','model'].includes(selection.kit_preview))throw new Error('Kit preview must be inventory or model.');
      state.kitPreview=selection.kit_preview;
    }
    state.selectionMetadata=selection;data.delete(Pack.selectionPath);
  }
  data.delete('pack.mcmeta');resources.delete('pack.mcmeta');
  if(resourceMetadata)state.resourceMetadata=resourceMetadata;
  for(const [path,content] of data)state.importedFiles.data.push({path,base64:base64(content)});
  for(const [path,content] of resources)state.importedFiles.resources.push({path,base64:base64(content)});
  const output=Pack.build(state,catalog);if(output.errors.length)throw new Error(output.errors.join(' '));
  return Project.backup(state,libraries.kits,libraries.intros);
}
const api={read};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritagePackImport=api;
})();
