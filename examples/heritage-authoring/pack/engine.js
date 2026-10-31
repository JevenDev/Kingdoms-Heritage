(() => {
'use strict';
const registry=typeof module!=='undefined'?require('./locations.js'):HeritageLocations;
const preview=typeof module!=='undefined'?require('../editor/engine.js'):HeritagePreview;
const fieldError=(field,message)=>Object.assign(new Error(message),{field});
const labels={search_radius:'Search distance',random_radius:'Random spawn distance',order:'Position in the menu',title:'Location name'};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const types=['default','random','biome','structure','fixed','pool'];
const bundledSpawns=['default','random','plains','village'];
const emptyKit={id:'builtin-empty',name:'Empty-handed',document:{title:'Empty-handed',description:'Begin with an empty inventory.',items:[]},error:'',warnings:[]};
const numericFields=['x','y','z','order','search_radius','random_radius'];
const fields=['title','subtitle','description','title_key','subtitle_key','description_key','type','dimension','target','piece','x','y','z','order','search_radius','random_radius','image'];
const destinationFields=['type','dimension','target','piece','x','y','z','search_radius','random_radius','intro'];
const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'untitled';
function fileId(value,label) {
  if(typeof value!=='string'||!value||!/^[a-z0-9/._-]+$/.test(value)||value.split('/').some(part=>!part||/^\.+$/.test(part)))throw fieldError('path',label+' must use lowercase letters, numbers, _, - or /, without empty or dot-only path segments.');
  return value;
}
function resource(value,label,tags=false) {
  if(typeof value!=='string'||!new RegExp('^'+(tags?'#?':'')+'(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$').test(value))throw new Error(label+' must be a resource ID'+(tags?' or #tag':'')+'.');
  return value;
}
const usesPicture=entry=>entry.imageMode!=='manual'&&entry.picture!==undefined;
const pictureId=(namespace,path)=>namespace+':textures/gui/locations/'+path+'.png';
function pictureBytes(picture) {
  if(!object(picture)||typeof picture.name!=='string'||typeof picture.data!=='string'||picture.data.length>150000||!/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(picture.data))throw fieldError('image','This saved picture is invalid. Choose the image again.');
  const bytes=Uint8Array.from(atob(picture.data.slice(22)),char=>char.charCodeAt(0));
  const signature=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82],end=[0,0,0,0,73,69,78,68,174,66,96,130];
  if(bytes.length<57||signature.some((byte,index)=>bytes[index]!==byte)||end.some((byte,index)=>bytes[bytes.length-end.length+index]!==byte))throw fieldError('image','This saved picture is not a PNG. Choose the image again.');
  const view=new DataView(bytes.buffer);
  if(view.getUint32(16)!==128||view.getUint32(20)!==192)throw fieldError('image','This saved picture must be 128 × 192 pixels. Choose the image again.');
  return bytes;
}
function integer(value,min,max,label) {
  if(!Number.isInteger(value)||value<min||value>max)throw new Error(label+' must be a whole number from '+min+' to '+max+'.');
}
function drafts(raw,kind,validators) {
  if(!raw)return {entries:[],error:''};
  let saved;
  try{saved=typeof raw==='string'?JSON.parse(raw):raw;}catch(error){return {entries:[],error:'Saved '+kind+' could not be read: '+error.message};}
  const collection=kind==='kits'?'kits':'intros';
  const entries=saved?.version===2&&Array.isArray(saved[collection])?saved[collection]:typeof saved?.source==='string'?[{id:'legacy',state:saved}]:null;
  if(!entries)return {entries:[],error:'Saved '+kind+' use an unsupported format. Open the editor to save them again.'};
  const ids=new Set(),result=[];
  for(const entry of entries) {
    if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||!object(entry.state))return {entries:result,error:'Saved '+kind+' contain an invalid or duplicate draft.'};
    ids.add(entry.id);
    const state=entry.state,previous=state.document;
    const draft={id:entry.id,name:kind==='kits'?(previous?.title||previous?.title_key||'Untitled kit'):(state.name||previous?.title||'Untitled intro'),document:previous?copy(kind==='kits'?previous:previous.intro??previous):null,source:state.source,error:'',issue:null,warnings:[]};
    try {
      if(typeof state.source!=='string')throw new Error('This draft has no saved JSON.');
      const rawDocument=JSON.parse(state.source);draft.document=kind==='kits'?rawDocument:rawDocument?.intro??rawDocument;
      if(kind==='kits') {
        const parsed=validators.kit(state.source);draft.document=parsed.document;draft.warnings=parsed.warnings;
        if(state.error&&!state.error.validation&&state.error.target!=='kit-json')throw Object.assign(new Error(state.error.message||'Fix the draft error in the kit creator.'),{path:state.error.path});
        if(state.drafts?.length)throw new Error('Apply or revert pending item edits in the kit creator.');
        if(state.cursor)throw new Error('Place or return the held item in the kit creator.');
        if(parsed.document.enabled===false)throw new Error('This kit is disabled. Enable it in the kit creator.');
        draft.name=parsed.document.title||parsed.document.title_key||draft.name;
      } else {
        const parsed=validators.intro(state.source);draft.document=parsed.wrapped?parsed.document.intro:parsed.document;
        if(parsed.wrapped&&parsed.document.type)draft.spawn=copy(parsed.document);
        if(state.validation?.error&&!state.validation.fromJson)throw new Error(state.validation.error.message||'Fix the draft error in the intro editor.');
      }
    } catch(error) {draft.error=error.message;draft.issue={path:error.path,field:error.field};}
    result.push(draft);
  }
  return {entries:result,error:''};
}
function location(id,index=1) {
  return {id,path:'location_'+index,fields:{title:'Location '+index,description:'',type:'default',dimension:'minecraft:overworld',order:String(index-1)},document:{},destinations:[],intro:'',kitMode:'all',kits:[]};
}
function importSpawn(entry,draft) {
  const result=copy(entry),spawn=copy(draft.spawn);
  if(!spawn)throw new Error('This intro was not saved as a full starting location.');
  result.document=spawn;
  result.fields=Object.fromEntries(fields.filter(key=>Object.hasOwn(spawn,key)).map(key=>[key,spawn[key]]));
  result.destinations=copy(spawn.pool??[]);
  return result;
}
function settings(values,allowed,strict=true) {
  const result={};
  for(const field of allowed) {
    const value=values[field];
    if(value===undefined||value==='')continue;
    if(numericFields.includes(field)) {
      if(typeof value==='string'&&!/^-?\d+$/.test(value)){
        if(strict)throw fieldError(field,(labels[field]??field.toUpperCase())+' must be a whole number.');
        result[field]=value;continue;
      }
      result[field]=typeof value==='number'?value:Number(value);
    } else result[field]=value;
  }
  return result;
}
function knownResource(value,kind,allowUnknown=false) {
  const field=kind==='dimension'?'dimension':'target';
  try{resource(value,kind==='biome'?'Biome':kind==='structure'?'Structure':'Dimension',kind!=='dimension');}
  catch(error){throw fieldError(field,error.message);}
  const tag=value.startsWith('#'),id=value.replace(/^#/,'');
  const normalized=id.includes(':')?id:'minecraft:'+id;
  const known=registry[kind+(tag?'Tags':'')]??[];
  if(normalized.startsWith('minecraft:')&&!known.includes(normalized)&&!allowUnknown)throw fieldError(kind==='dimension'?'dimension':'target','Unknown Minecraft '+kind+': '+value+'. Choose a suggestion, or enable custom Minecraft IDs in Pack options if another datapack defines it.');
  return !known.includes(normalized);
}
function validateSpawn(document,allowUnknown=false) {
  if(!object(document))throw new Error('A location must be an object.');
  const title=document.title??document.title_key;
  if(typeof title!=='string'||!title.trim()||title.length>120)throw fieldError(document.title===undefined&&document.title_key!==undefined?'title_key':'title','Enter a location title or title key from 1 to 120 characters.');
  for(const [key,max] of [['subtitle',120],['description',4000],['title_key',256],['subtitle_key',256],['description_key',256]])if(document[key]!==undefined&&(typeof document[key]!=='string'||document[key].length>max))throw fieldError(key,key+' must be text up to '+max+' characters.');
  const type=typeof document.type==='string'?document.type.toLowerCase():'';
  if(!types.includes(type))throw fieldError('type','Choose a location type.');
  if(document.enabled===false)throw fieldError('enabled','This location is disabled.');
  if(document.intro!==undefined) {
    try{preview.readJson(JSON.stringify({intro:document.intro}));}
    catch(error){throw Object.assign(fieldError('intro',error.message),{path:error.path});}
  }
  if(document.dimension!==undefined)knownResource(document.dimension,'dimension',allowUnknown);
  if(document.image!==undefined)try{resource(document.image,'Image');}catch(error){throw fieldError('image',error.message);}
  if(document.order!==undefined)try{integer(document.order,-2147483648,2147483647,'Order');}catch(error){throw fieldError('order',error.message);}
  for(const key of ['search_radius','random_radius'])if(document[key]!==undefined) {try{integer(document[key],16,30000,labels[key]);}catch(error){throw fieldError(key,error.message);}}
  for(const key of ['x','y','z'])if(document[key]!==undefined)try{integer(document[key],key==='y'?-2147483648:-29999984,key==='y'?2147483647:29999984,key.toUpperCase());}catch(error){throw fieldError(key,error.message);}
  if(type==='fixed'&&['x','y','z'].some(key=>document[key]===undefined))throw fieldError(['x','y','z'].find(key=>document[key]===undefined),'Fixed locations require X, Y and Z coordinates.');
  if(type==='biome'||type==='structure')knownResource(document.target,type,allowUnknown);
  if(document.piece!==undefined) {
    if(type!=='structure')throw fieldError('piece','Only structures support a preferred piece.');
    try{resource(document.piece,'Preferred piece');}catch(error){throw fieldError('piece',error.message);}
  }
  if(type==='pool') {
    if(['target','x','y','z'].some(key=>Object.hasOwn(document,key)))throw fieldError(['target','x','y','z'].find(key=>Object.hasOwn(document,key)),'Coordinates and targets belong inside pool destinations.');
    if(!Array.isArray(document.pool)||document.pool.length<1||document.pool.length>128)throw fieldError('pool','A pool needs 1 to 128 destinations.');
    document.pool.forEach((entry,index)=>{
      try {
        if(!object(entry)||Object.keys(entry).some(key=>!destinationFields.includes(key)))throw new Error('Unsupported destination field.');
        if(typeof entry.type!=='string'||entry.type.toLowerCase()==='pool')throw fieldError('type','Choose a destination type other than pool.');
        const inherited={...document,...entry};delete inherited.pool;
        if(entry.intro===null)delete inherited.intro;
        validateSpawn(inherited,allowUnknown);
      }catch(error){throw Object.assign(new Error('Place '+(index+1)+': '+error.message),{field:error.field,path:error.path,destination:index});}
    });
  } else if(document.pool!==undefined)throw fieldError('pool','Only pools support destinations.');
  return document;
}
function linkedIntro(id,catalog) {
  const intro=catalog.intros.find(draft=>draft.id===id);
  if(!intro)throw fieldError('intro','The linked intro is missing. Restore it or choose another intro.');
  if(intro.error)throw Object.assign(fieldError('intro','Intro '+intro.name+': '+intro.error),{path:['intro',...(intro.issue?.path?.[0]==='intro'?intro.issue.path.slice(1):intro.issue?.path??[])]});
  return copy(intro.document);
}
function previewFiles(state,catalog) {
  const files=[],kitIds=new Map(),namespace=state.namespace??'';
  for(const selected of state.kits.filter(entry=>entry.included)) {
    const draft=catalog.kits.find(entry=>entry.id===selected.id);
    kitIds.set(selected.id,namespace+':'+selected.path);
    if(draft)files.push({path:'data/'+namespace+'/heritage/kits/'+selected.path+'.json',content:typeof draft.source==='string'?draft.source:JSON.stringify(draft.document,null,2)});
  }
  for(const entry of state.locations) {
    const document=copy(entry.document??{}),type=entry.fields?.type;
    for(const key of [...fields,'pool','intro','kits','enabled'])delete document[key];
    const relevant=fields.filter(key=>key!=='piece'||type==='structure').filter(key=>key!=='target'||['biome','structure'].includes(type)).filter(key=>!['x','y','z'].includes(key)||type==='fixed');
    Object.assign(document,settings(entry.fields??{},relevant,false));
    if(usesPicture(entry))document.image=pictureId(namespace,entry.path);
    else if(entry.imageMode==='upload')delete document.image;
    if(entry.fields?.title==='')document.title='';
    const intro=id=>catalog.intros.find(draft=>draft.id===id)?.document??null;
    if(entry.intro)document.intro=copy(intro(entry.intro));
    if(type==='pool')document.pool=entry.destinations.map(destination=>{
      const value=settings(destination,destinationFields,false);
      if(typeof value.intro==='string')value.intro=copy(intro(value.intro));
      return value;
    });
    const ids=entry.kitMode==='selected'?entry.kits:[...kitIds.keys()];
    document.kits=ids.map(id=>id==='bundled-empty'?'kingdomsheritage:default':kitIds.get(id)??id);
    if(entry.kitMode!=='selected'&&state.keepKits)document.kits.push('kingdomsheritage:default');
    files.push({path:'data/'+namespace+'/heritage/spawns/'+entry.path+'.json',content:JSON.stringify(document,null,2)+'\n'});
  }
  files.push({path:'pack.mcmeta',content:JSON.stringify({pack:{pack_format:48,description:state.description}},null,2)+'\n'});
  return files;
}
function build(state,catalog) {
  const errors=[],warnings=[],files=[],issues=[],resourceFiles=[];
  const report=(label,action,locationId,filePath,kitId)=>{try{return action();}catch(error){
    errors.push(label+': '+error.message);
    const path=error.path??error.field?.split('.')??[];
    issues.push({locationId,kitId,filePath,field:error.field,destination:error.destination,path:error.destination===undefined?path:['pool',error.destination,...path],message:error.message});
    return null;
  }};
  const namespace=report('Pack ID',()=>{
    if(typeof state.namespace!=='string'||!/^[a-z0-9_.-]+$/.test(state.namespace)||/^\.+$/.test(state.namespace))throw fieldError('namespace','Use lowercase letters, numbers, _, - or .');
    return state.namespace;
  });
  report('Pack name',()=>{if(typeof state.name!=='string'||!state.name.trim())throw fieldError('name','Enter a name for the download.');});
  report('Pack description',()=>{if(typeof state.description!=='string'||!state.description.trim())throw fieldError('description','Enter a description.');});
  const paths=new Set(),kitIds=new Map(),documents=new Map();
  const add=(path,document)=>{
    if(paths.has(path))throw new Error('Duplicate export path: '+path);
    paths.add(path);files.push({path,content:JSON.stringify(document,null,2)+'\n'});
  };
  const selected=(Array.isArray(state.kits)?state.kits:[]).filter(entry=>entry.included);
  for(const selection of selected)report('Kit '+(selection.path||selection.id),()=>{
    const draft=catalog.kits.find(entry=>entry.id===selection.id);
    if(!draft)throw new Error('The saved draft is missing. Restore it or remove it from this pack.');
    if(draft.error)throw Object.assign(new Error(draft.error),draft.issue);
    const path=fileId(selection.path,'Kit file name'),id=namespace+':'+path;
    if(kitIds.has(selection.id))throw new Error('This kit is selected more than once.');
    add('data/'+namespace+'/heritage/kits/'+path+'.json',copy(draft.document));
    kitIds.set(selection.id,id);documents.set(id,draft.document);
    warnings.push(...draft.warnings);
  },undefined,'data/'+namespace+'/heritage/kits/'+selection.path+'.json',selection.id);
  if(state.keepKits)documents.set('kingdomsheritage:default',emptyKit.document);
  const count=documents.size;
  if(count<1)errors.push('Include at least one kit, or keep the bundled Empty-handed kit.');
  if(count>128)errors.push('A datapack can contain at most 128 enabled kits, including bundled kits.');
  const locations=Array.isArray(state.locations)?state.locations:[];
  if(locations.length<1)errors.push('Add at least one starting location.');
  const spawnIds=new Set(state.keepLocations?bundledSpawns.map(id=>'kingdomsheritage:'+id):[]);
  for(const entry of locations)report('Location '+(entry.fields?.title||entry.path||'Untitled'),()=>{
    const path=fileId(entry.path,'Location file name'),document=copy(entry.document??{});
    for(const key of [...fields,'pool','intro','kits','enabled'])delete document[key];
    const type=entry.fields?.type;
    const relevant=fields.filter(key=>key!=='piece'||type==='structure').filter(key=>key!=='target'||['biome','structure'].includes(type)).filter(key=>!['x','y','z'].includes(key)||type==='fixed');
    const values=settings(entry.fields??{},relevant);
    Object.assign(document,values);
    const picture=usesPicture(entry)?pictureBytes(entry.picture):null;
    if(picture)document.image=pictureId(namespace,path);
    else if(entry.imageMode==='upload')delete document.image;
    if(type==='pool')document.pool=(entry.destinations??[]).map((destination,index)=>{
      try {
        const values=settings(destination,destinationFields);
        if(typeof values.intro==='string')values.intro=linkedIntro(values.intro,catalog);
        return values;
      }catch(error){throw Object.assign(new Error('Place '+(index+1)+': '+error.message),{field:error.field,path:error.path,destination:index});}
    });
    if(entry.intro)document.intro=linkedIntro(entry.intro,catalog);
    const ids=entry.kitMode==='selected'?entry.kits:[...kitIds.keys()];
    if(!Array.isArray(ids))throw fieldError('kits','Choose allowed kits.');
    const allowed=ids.map(id=>{
      if(id==='bundled-empty'&&state.keepKits)return 'kingdomsheritage:default';
      if(!kitIds.has(id))throw fieldError('kits','An assigned kit is missing or excluded. Include it or change this location’s kits.');
      return kitIds.get(id);
    });
    if(entry.kitMode!=='selected'&&state.keepKits)allowed.push('kingdomsheritage:default');
    if(!allowed.length)throw fieldError('kits','Choose at least one allowed kit.');
    document.kits=[...new Set(allowed)];
    if(document.kits.length>128)throw fieldError('kits','A location can allow at most 128 kits.');
    validateSpawn(document,state.allowCustomTargets===true);
    for(const place of [document,...(document.pool??[])]) {
      if(place.dimension&&knownResource(place.dimension,'dimension',true))warnings.push('Custom dimensions must be installed and checked in-game with /heritage validate @s.');
      if(['biome','structure'].includes(place.type)&&knownResource(place.target,place.type,true))warnings.push('Custom biomes, structures and groups must be installed and checked in-game with /heritage validate @s.');
    }
    add('data/'+namespace+'/heritage/spawns/'+path+'.json',document);spawnIds.add(namespace+':'+path);
    if(picture)resourceFiles.push({path:'assets/'+namespace+'/textures/gui/locations/'+path+'.png',content:picture});
    else if(document.image)warnings.push('Pictures entered as resource paths must be supplied by an enabled resource pack.');
  },entry.id,'data/'+namespace+'/heritage/spawns/'+entry.path+'.json');
  if(spawnIds.size>50)errors.push('A datapack can contain at most 50 starting locations, including bundled locations.');
  add('pack.mcmeta',{pack:{pack_format:48,description:state.description}});
  if(!state.keepLocations)for(const id of bundledSpawns) {
    const path='data/kingdomsheritage/heritage/spawns/'+id+'.json';
    if(!paths.has(path))add(path,{enabled:false});
  }
  if(!state.keepKits&&!paths.has('data/kingdomsheritage/heritage/kits/default.json'))add('data/kingdomsheritage/heritage/kits/default.json',{enabled:false});
  files.sort((a,b)=>a.path==='pack.mcmeta'?-1:b.path==='pack.mcmeta'?1:a.path.localeCompare(b.path));
  const pictureCount=resourceFiles.length;
  if(pictureCount)resourceFiles.unshift({path:'pack.mcmeta',content:JSON.stringify({pack:{pack_format:34,description:state.description}},null,2)+'\n'});
  return {files:errors.length?[]:files,resourceFiles:errors.length?[]:resourceFiles,pictureCount,previewFiles:errors.length?previewFiles(state,catalog):files,errors,issues,warnings:[...new Set(warnings)],kitCount:count,locationCount:spawnIds.size};
}
const api={copy,slug,fileId,resource,drafts,location,importSpawn,knownResource,validateSpawn,build,emptyKit,types,fields,destinationFields,usesPicture,pictureId,pictureBytes};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritagePack=api;
})();
