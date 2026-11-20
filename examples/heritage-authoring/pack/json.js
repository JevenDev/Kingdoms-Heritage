(() => {
'use strict';
const P=typeof module!=='undefined'?require('./engine.js'):HeritagePack;
if(typeof module!=='undefined')require('../kit/catalog.js');
const K=typeof module!=='undefined'?require('../kit/engine.js'):HeritageKit;
const I=typeof module!=='undefined'?require('../editor/engine.js'):HeritagePreview;
const E=typeof module!=='undefined'?require('./editing.js'):HeritageEditing;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const decode=value=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),char=>char.charCodeAt(0)));
function encode(value){const bytes=new TextEncoder().encode(value);let text='';for(let at=0;at<bytes.length;at+=32768)text+=String.fromCharCode(...bytes.subarray(at,at+32768));return btoa(text);}
function catalog(libraries){
  const validators={kit:source=>K.read(source),intro:source=>I.readJson(source)};
  return Object.fromEntries(['kits','intros'].map(kind=>{const result=P.drafts(libraries[kind],kind,validators);if(result.error)throw new Error(result.error);return [kind,result.entries];}));
}
function files(value){
  const output=P.build(value.pack,catalog(value.libraries)),result=[];
  for(const [group,entries] of [['data',output.previewFiles],['resources',output.resourceFiles]]){
    const paths=new Set();
    for(const file of entries)if(typeof file.content==='string'&&/\.(json|mcmeta)$/.test(file.path)){result.push({...file,group});paths.add(file.path);}
    for(const file of value.pack.importedFiles?.[group]??[])if(!paths.has(file.path)&&/\.(json|mcmeta)$/.test(file.path))result.push({path:file.path,content:decode(file.base64),group});
  }
  return result.map(file=>{
    const match=/^data\/([^/]+)\/heritage\/(kits|spawns)\/(.+)\.json$/.exec(file.path),pack=value.pack;
    const custom=match?.[1]===pack.namespace&&(match[2]==='kits'?pack.kits.some(entry=>entry.path===match[3]):pack.locations.some(entry=>entry.path===match[3]));
    const reason=file.group==='data'&&match&&!custom&&JSON.parse(file.content)?.enabled===false?'This file disables bundled content. Change the bundled content settings in Pack settings.':'';
    return {...file,reason};
  });
}
function apply(value,group,path,source,createId=()=>crypto.randomUUID()){
  const file=files(value).find(file=>file.group===group&&file.path===path);
  if(!file)throw new Error('This JSON file is no longer available. Reopen the editor.');
  if(file.reason)throw new Error(file.reason);
  const document=JSON.parse(source),next=E.workspace(value.pack,value.libraries),pack=next.pack,drafts=[];
  const before=catalog(value.libraries);let original;
  try{original=JSON.parse(file.content);}catch(error){if(!(error instanceof SyntaxError))throw error;}
  const changed=(kind,id)=>{if(!drafts.some(entry=>entry.kind===kind&&entry.id===id))drafts.push({kind,id});};
  function intro(document,previous,name){
    if(document===undefined)return '';
    I.readJson(JSON.stringify({intro:document}));
    if(previous&&equal(before.intros.find(entry=>entry.id===previous)?.document,document))return previous;
    const id=createId();if(next.libraries.intros.intros.some(entry=>entry.id===id))throw new Error('An intro with this ID already exists. Try again.');
    next.libraries.intros.intros.push({id,state:{name,source:JSON.stringify(document,null,2),document:P.copy(document),selection:[0,0],validation:{error:null,fromJson:false}}});
    if(!next.libraries.intros.active)next.libraries.intros.active=id;changed('intros',id);return id;
  }
  if(path==='pack.mcmeta'){
    const format=group==='data'?48:34;
    if(!object(document)||!object(document.pack)||document.pack.pack_format!==format)throw new Error('pack_format must remain '+format+' for Minecraft 1.21.1.');
    const description=document.pack.description;
    if(typeof description!=='string'&&!object(description)&&!Array.isArray(description)||typeof description==='string'&&!description.trim())throw new Error('Enter a pack description.');
    if(group==='data'){pack.packMetadata=document;pack.description=typeof description==='string'?description:JSON.stringify(description);}
    else{pack.resourceMetadata=document;pack.packMetadata=JSON.parse(files(value).find(file=>file.group==='data'&&file.path==='pack.mcmeta').content);}
  }else if(group==='data'&&path===P.selectionPath){
    if(!object(document))throw new Error('Selection settings must be a JSON object.');
    pack.selectionMetadata=document;pack.guiScale=document.gui_scale??0;pack.kitPreview=document.kit_preview;
  }else{
    const match=group==='data'&&/^data\/([^/]+)\/heritage\/(kits|spawns)\/(.+)\.json$/.exec(path);
    const custom=match&&match[1]===pack.namespace,resource=match?match[1]+':'+match[3]:'';
    const kit=custom&&match[2]==='kits'?pack.kits.find(entry=>entry.path===match[3]):null;
    const location=custom&&match[2]==='spawns'?pack.locations.find(entry=>entry.path===match[3]):null;
    const bundledKit=match&&match[2]==='kits'&&P.bundledKits(pack).some(entry=>entry.resource===resource);
    if(kit||bundledKit){
      K.read(source);if(document.enabled===false)throw new Error('Remove this kit from the pack using the content controls.');
      if(pack.kitOrder&&!equal(document.order,original?.order))throw new Error('This pack uses a custom kit order. Reorder its kits in the content list.');
      if(kit){
        const draft=next.libraries.kits.kits.find(entry=>entry.id===kit.id);
        if(!draft)throw new Error('This kit draft is missing.');
        if(draft.state.cursor||draft.state.drafts?.length)throw new Error('Place any held item and apply or revert pending item edits in the kit editor first.');
        Object.assign(draft.state,{source,document:P.copy(document),validDocument:P.copy(document),error:null,loreSources:[]});changed('kits',kit.id);
      }else{(pack.bundledKits??={})[resource]=document;}
    }else if(location){
      P.validateSpawn(document,pack.allowCustomTargets===true);
      const selectors=document.kits??[];
      if(!Array.isArray(selectors)||selectors.some(selector=>typeof selector!=='string'))throw new Error('kits must be a list of kit IDs or #tags.');
      const kits=[...pack.kits.filter(entry=>entry.included).map(entry=>({id:entry.id,resource:pack.namespace+':'+entry.path,document:before.kits.find(draft=>draft.id===entry.id)?.document})),...P.bundledKits(pack)];
      const selected=[];
      for(const selector of selectors){
        P.resource(selector,'Kit',true);
        const matches=kits.filter(kit=>selector.startsWith('#')?(kit.document?.tags??[]).some(tag=>K.normalize(tag)===K.normalize(selector.slice(1))):kit.resource===K.normalize(selector));
        if(!matches.length)throw new Error('Include the referenced kit or tag first: '+selector);
        for(const kit of matches)if(!selected.includes(kit.id))selected.push(kit.id);
      }
      location.intro=intro(document.intro,location.intro,(document.title??location.path)+' intro');
      location.destinations=(document.pool??[]).map((destination,index)=>{
        const result=P.copy(destination);result.type=result.type.toLowerCase();
        if(object(result.intro))result.intro=intro(result.intro,location.destinations[index]?.intro,(document.title??location.path)+' place '+(index+1)+' intro');
        return result;
      });
      if(!equal(document.image,original?.image))location.imageMode='manual';
      location.document=P.copy(document);location.fields=Object.fromEntries(P.fields.filter(key=>Object.hasOwn(document,key)).map(key=>[key,document[key]]));location.fields.type=document.type.toLowerCase();
      location.kitMode=selectors.length?'selected':'all';location.kits=selected;location.importedKitSelectors=P.copy(selectors);
    }else if(match&&match[2]==='spawns'&&Object.hasOwn(pack.bundledLocations??{},resource)){
      P.validateSpawn(document,pack.allowCustomTargets===true);
      pack.bundledLocations[resource]=document;
    }else{
      const imported=pack.importedFiles?.[group]?.find(file=>file.path===path);
      if(!imported)throw new Error('Use the pack settings to change this generated file.');
      imported.base64=encode(source);
    }
  }
  const previous=P.build(value.pack,before),output=P.build(pack,catalog(next.libraries));
  const introduced=output.errors.filter(message=>!previous.errors.includes(message));
  const issue=output.issues.find(issue=>issue.filePath===path);
  if(issue||introduced.length)throw Object.assign(new Error(issue?.message??introduced.join(' ')),issue?{path:issue.path}:{});
  return {...next,drafts};
}
const api={files,apply,catalog};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritagePackJson=api;
})();
