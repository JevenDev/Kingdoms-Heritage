(() => {
'use strict';
const colors = {black:0x000000,dark_blue:0x0000aa,dark_green:0x00aa00,dark_aqua:0x00aaaa,dark_red:0xaa0000,dark_purple:0xaa00aa,gold:0xffaa00,gray:0xaaaaaa,dark_gray:0x555555,blue:0x5555ff,green:0x55ff55,aqua:0x55ffff,red:0xff5555,light_purple:0xff55ff,yellow:0xffff55,white:0xffffff};
const aliases = {i:'italic',italics:'italic',b:'bold',u:'underline',underlined:'underline',s:'strike',strikethrough:'strike',obfuscate:'obfuscated',magic:'obfuscated',wavy:'wave',shaky:'shake',pulsing:'pulse',jumping:'jump',bounce:'jump',bouncy:'jump'};
const contextDefaults={player:'Alex',kit:'Traveler',spawn:'Homeland',biome:'Plains',structure:'Wilderness',dimension:'Overworld',place:'the plains',companions:'',party_size:'1',party_leader:'Alex',equipment:'Traveler'};
function token(raw,names={}) {
  const [key,...fallback]=raw.split('|'),requested=key.startsWith('key:')?key.slice(4):null,keys=names.__keys??keyDefaults,binding=requested?(Object.hasOwn(keys,requested)||requested.startsWith('key.')?requested:'key.'+requested):null;
  const known=Object.hasOwn(contextDefaults,key)||key.startsWith('var:')&&Object.hasOwn(names,key)||binding&&Object.hasOwn(names.__keys??keyDefaults,binding);
  if(!known&&!fallback.length&&!Object.hasOwn(names.__fallbacks??{},key))return null;
  let value=binding?(names.__keys??keyDefaults)[binding]:Object.hasOwn(names,key)?names[key]:contextDefaults[key];
  const missing=Object.hasOwn(names.__facts??{},key)?String(names.__facts[key])==='':value===undefined||value===null||componentText(value)==='';
  if(missing){if(fallback.length)value=fallback.join('|');else if(Object.hasOwn(names.__fallbacks??{},key))value=names.__fallbacks[key];}
  return {key,value:value??'',text:componentText(value??'')};
}
const positions = {mid_center:[1,1],top_center:[1,0],bottom_center:[1,2],left_center:[0,1],right_center:[2,1],top_left:[0,0],top_right:[2,0],bottom_left:[0,2],bottom_right:[2,2]};
const defaults = {text:'You woke up in <wave><gold>{biome}</gold></wave>...',subtitle:'<italic>A new journey begins.</italic>',title:false,large_subtitle:false,outline:true,animation:'word_by_word',control:'after_title',blip:true,black_hold_ticks:60,fade_from_black_ticks:60,reveal_ticks:40,hold_ticks:60,fade_out_ticks:20,cinematic_bars:true,bar_style:'random',bar_transition_ticks:40,bar_height:26,timeline:null,hide_hud_during_bars:true,title_position:'left_center',subtitle_position:'left_center'};
const packDefaults = {...defaults,variables:{},fallbacks:{},variants:[],text:'',subtitle:'',animation:'fade_in',blip:false,cinematic_bars:false,hide_hud_during_bars:false,title_position:'mid_center',subtitle_position:'mid_center'};
const positionAliases = {center:'mid_center',mc:'mid_center',mid_c:'mid_center',tc:'top_center',top_c:'top_center',bc:'bottom_center',bottom_c:'bottom_center',lc:'left_center',left_c:'left_center',rc:'right_center',right_c:'right_center',tl:'top_left',tr:'top_right',bl:'bottom_left',br:'bottom_right'};
function readJson(source,{validate:check=true}={}) {
  let document;
  try { document=JSON.parse(/^\s*"intro"\s*:/.test(source)?'{'+source+'}':source); }
  catch(error) { throw new Error('Invalid JSON: '+error.message); }
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  if(!object(document)) throw new Error('Paste an intro object or a spawn definition containing intro.');
  const wrapped=Object.hasOwn(document,'intro'), intro=wrapped?document.intro:document;
  if(!object(intro)) throw Object.assign(new Error('intro must be a JSON object.'),{path:wrapped?['intro']:[]});
  if(check&&!Object.hasOwn(intro,'text')) throw Object.assign(new Error('intro requires text.'),{field:'text',path:wrapped?['intro','text']:['text']});
  const config=Object.fromEntries(Object.entries(packDefaults).map(([key,fallback])=>[key,Object.hasOwn(intro,key)?intro[key]:fallback]));
  for(const key of ['animation','control','bar_style']) if(typeof config[key]==='string') config[key]=config[key].toLowerCase();
  for(const key of ['title_position','subtitle_position']) if(typeof config[key]==='string') {
    const value=config[key].trim().toLowerCase().replaceAll(' ','_');
    config[key]=Object.hasOwn(positionAliases,value)?positionAliases[value]:value;
  }
  for(const key of ['title_coordinates','subtitle_coordinates']) {
    config[key]=Object.hasOwn(intro,key)?intro[key]:null;
    if(config[key]&&typeof config[key]==='object'&&!Array.isArray(config[key]))config[key]={width:50,...config[key]};
  }
  if(check)try{validate(config);}catch(error){
    error.path??=error.field?.split('.')??[];
    if(wrapped)error.path=['intro',...error.path];
    throw error;
  }
  return {document,wrapped,config};
}
function updateJson(state,changes,options) {
  const intro={...(state.wrapped?state.document.intro:state.document),...changes};
  return readJson(JSON.stringify(state.wrapped?{...state.document,intro}:intro),options);
}
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b,v));
const canonical = tag => Object.hasOwn(aliases,tag)?aliases[tag]:tag;
const active = e => !!(e.wave || e.shake || e.pulse || e.jump || e.rainbow);
function color(raw) {
  raw = raw.toLowerCase();
  const names={grey:'gray',dark_grey:'dark_gray',purple:'light_purple',magenta:'light_purple'};
  if(Object.hasOwn(names,raw))raw=names[raw];
  if(Object.hasOwn(colors,raw))return colors[raw];
  const hex = raw.replace(/^(#|0x)/,'');
  return /^[0-9a-f]{6}$/.test(hex) ? parseInt(hex,16) : null;
}
function effects(raw) {
  if (raw.startsWith('color:')) { const value=color(raw.slice(6)); return value===null?null:{color:value}; }
  if (raw.startsWith('gradient:')) {
    const parts=raw.slice(9).split(':').map(color);
    return parts.length===2 && parts.every(v=>v!==null) ? {gradient:parts} : null;
  }
  const value=color(raw), tag=canonical(raw);
  return value!==null ? {color:value} : ['italic','bold','underline','strike','obfuscated','wave','shake','pulse','jump','rainbow'].includes(tag) ? {[tag]:true} : null;
}
function lerpColor(a,b,p) {
  return [16,8,0].reduce((value,shift)=>value | (Math.round(((a>>shift)&255)+(((b>>shift)&255)-((a>>shift)&255))*clamp(p))<<shift),0);
}
function rainbow(p) {
  const h=((p%1)+1)%1*6, f=h-Math.floor(h), v=.95, s=.58;
  const low=v*(1-s), q=v*(1-s*f), t=v*(1-s*(1-f));
  const rgb=[[v,t,low],[q,v,low],[low,v,t],[low,q,v],[t,low,v],[v,low,q]][Math.floor(h)%6];
  return rgb.reduce((value,c,i)=>value | Math.round(c*255)<<(16-i*8),0);
}
function componentText(value) {
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(componentText).join('');
  if(!value||typeof value!=='object')return '';
  let text=value.text??value.fallback??(value.translate?'['+value.translate+']':value.keybind??value.selector??value.score?.value??value.score?.name??value.nbt??'');
  if(value.translate&&Array.isArray(value.with)) {
    let index=0;
    text=text.replace(/%(?:(\d+)\$)?s/g,(_,position)=>componentText(value.with[position?Number(position)-1:index++]??''));
  }
  return String(text)+(value.extra??[]).map(componentText).join('');
}
const factDefaults={kit:'example:traveler',spawn:'example:homeland',biome:'minecraft:plains',structure:'',dimension:'minecraft:overworld',inventory_policy:'merge',keeps_belongings:'false',receives_kit:'true'};
const keyDefaults={'key.inventory':'E','key.jump':'Space','key.sneak':'Left Shift','key.sprint':'Left Control','key.forward':'W','key.left':'A','key.back':'S','key.right':'D','key.attack':'Left Button','key.use':'Right Button','key.drop':'Q'};
function condition(value,facts) {
  if(value.all)return value.all.every(entry=>condition(entry,facts));
  if(value.any)return value.any.some(entry=>condition(entry,facts));
  if(value.not)return !condition(value.not,facts);
  const raw=facts[value.tag],present=raw!==undefined&&raw!==null&&String(raw)!=='';
  if(value.present!==undefined&&value.present!==present)return false;
  if(value.equals!==undefined&&(!present||String(raw)!==String(value.equals)))return false;
  if(value.min!==undefined||value.max!==undefined){
    if(!present||!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(String(raw)))return false;
    const number=Number(raw);
    if(!Number.isFinite(number)||value.min!==undefined&&number<value.min||value.max!==undefined&&number>value.max)return false;
  }
  return true;
}
function validateCondition(value,depth=0,count={value:0}) {
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(!object(value)||depth>16||++count.value>128)throw new Error('Dialogue conditions require objects with at most 16 nesting levels and 128 nodes.');
  for(const key of ['all','any','not'])if(Object.hasOwn(value,key)){
    if(Object.keys(value).length!==1)throw new Error(key+' cannot be combined with other condition fields.');
    if(key==='not')validateCondition(value.not,depth+1,count);
    else {
      if(!Array.isArray(value[key])||!value[key].length)throw new Error(key+' requires a non-empty list of conditions.');
      value[key].forEach(entry=>validateCondition(entry,depth+1,count));
    }
    return;
  }
  if(typeof value.tag!=='string'||! /^[a-z_][a-z0-9_:./-]*$/.test(value.tag)||Object.keys(value).length<2||Object.keys(value).some(key=>!['tag','equals','present','min','max'].includes(key)))throw new Error('A dialogue condition requires a tag and equals, present, min or max.');
  if(Object.hasOwn(value,'equals')&&!['string','number','boolean'].includes(typeof value.equals))throw new Error('equals requires text, a boolean or a finite number.');
  if(typeof value.equals==='number'&&!Number.isFinite(value.equals))throw new Error('equals requires a finite number.');
  if(Object.hasOwn(value,'present')&&typeof value.present!=='boolean')throw new Error('present must be true or false.');
  for(const key of ['min','max'])if(Object.hasOwn(value,key)&&(typeof value[key]!=='number'||!Number.isFinite(value[key])))throw new Error(key+' must be a finite number.');
  if(value.min!==undefined&&value.max!==undefined&&value.min>value.max)throw new Error('min cannot exceed max.');
}
function expandComponent(value,names){
  if(Array.isArray(value))return value.map(entry=>expandComponent(entry,names));
  if(value&&typeof value==='object'){
    const own={...value};delete own.extra;
    const style=Object.fromEntries(['color','bold','italic','underlined','strikethrough','obfuscated'].filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
    return {text:'',...style,extra:[expandComponent(componentText(own),names),...(value.extra??[]).map(entry=>expandComponent(entry,names))]};
  }
  if(typeof value!=='string')return String(value);
  const parts=[];let cursor=0;
  for(const match of value.matchAll(/\{([a-z_][a-z0-9_:./-]*(?:\|[^{}]*)?)\}|<([a-z_][a-z0-9_:./-]*(?:\|[^<>]*)?)>/g)){
    const replacement=token(match[1]??match[2],names);if(!replacement)continue;
    parts.push(value.slice(cursor,match.index),replacement.value);cursor=match.index+match[0].length;
  }
  return cursor?{text:'',extra:[...parts,value.slice(cursor)]}:value;
}
function dialogue(config,names={}) {
  const context={...contextDefaults,...names,__fallbacks:config.fallbacks??{},__keys:{...keyDefaults,...names.keys}},facts={...context,...factDefaults,...names.facts};
  if(!names.facts||!Object.hasOwn(names.facts,'structure'))facts.structure=context.structure==='Wilderness'?'':names.facts?.structure??context.structure;
  const variableBase={...context,__fallbacks:{}};
  for(const [id,value] of Object.entries({...config.variables,...names.variables})){
    const tag='var:'+id,resolved=Object.hasOwn(names.variables??{},id)?value:expandComponent(value,variableBase);
    context[tag]=typeof resolved==='number'||typeof resolved==='boolean'?String(resolved):resolved;
    facts[tag]=componentText(context[tag]);
  }
  context.party_size=String(facts.party_size);
  if(Number(facts.party_size)===1){context.party_leader=context.player;context.companions='';facts.party_leader=facts.player;facts.companions='';}
  context.__facts=facts;
  const variant=(config.variants??[]).find(entry=>condition(entry.when,facts));
  return {text:variant?.text??config.text,subtitle:variant?.subtitle??config.subtitle,names:context};
}
function validateDialogue(config) {
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  for(const field of ['variables','fallbacks']){
    const values=config[field]===undefined?{}:config[field];
    if(!object(values)||Object.keys(values).length>64)throw Object.assign(new Error(field+' must contain at most 64 entries.'),{field});
    for(const [key,value] of Object.entries(values)){
      if(!(field==='variables'?/^[a-z0-9_.-]+:[a-z0-9/._-]+$/:/^[a-z_][a-z0-9_:./-]*$/).test(key))throw Object.assign(new Error('Invalid '+field+' key: '+key),{field});
      if(typeof value==='number'||typeof value==='boolean'){if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Dialogue values must be finite.');}
      else validateComponent(value,0,[field,key]);
    }
  }
  if(!Array.isArray(config.variants===undefined?[]:config.variants)||(config.variants??[]).length>32)throw Object.assign(new Error('variants must contain at most 32 entries.'),{field:'variants'});
  (config.variants??[]).forEach((entry,index)=>{
    try{
      if(!object(entry)||!Object.hasOwn(entry,'when')||!['text','subtitle'].some(key=>Object.hasOwn(entry,key))||Object.keys(entry).some(key=>!['when','text','subtitle'].includes(key)))throw new Error('Each dialogue variant requires when and text or subtitle.');
      validateCondition(entry.when);
      for(const key of ['text','subtitle'])if(Object.hasOwn(entry,key))validateComponent(entry[key],0,['variants',index,key]);
    }catch(error){error.field??='variants';error.path??=['variants',index];throw error;}
  });
}
function validateSamples(values){
  for(const kind of ['variables','facts','keys']){
    const value=values[kind]??{};
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Sample '+kind+' must be a JSON object.');
    for(const [key,entry] of Object.entries(value)){
      if(kind==='variables'){
        if(!/^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(key))throw new Error('Sample variable IDs require a namespace.');
        if(typeof entry==='number'||typeof entry==='boolean'){if(typeof entry==='number'&&!Number.isFinite(entry))throw new Error('Sample variables must be finite.');}
        else validateComponent(entry);
      }else if(kind==='keys'&&typeof entry!=='string'||kind==='facts'&&!['string','number','boolean'].includes(typeof entry))throw new Error('Use text keybindings and scalar condition values.');
    }
  }
  return values;
}
function diagnostics(config,names={}) {
  const resolved=dialogue(config,names),warnings=new Set();
  for(const source of [config.text,config.subtitle,...Object.values(config.variables??{}),...(config.variants??[]).flatMap(entry=>[entry.text,entry.subtitle])]){
    for(const match of componentText(source).matchAll(/\{([a-z_][a-z0-9_:./-]*(?:\|[^{}]*)?)\}|<(\/?)([^<>]+)>/g)){
      const brace=match[1]!==undefined,raw=(brace?match[1]:match[3]).trim();
      if(!brace&&(effects(raw.toLowerCase())||pacingCue(raw)))continue;
      if(token(raw,resolved.names))continue;
      warnings.add('Unknown dialogue '+(brace?'placeholder '+match[0]:'tag <'+raw+'>')+'. Add a sample value for extension variables or modded keybindings.');
    }
  }
  return [...warnings];
}
function validateComponent(value,depth=0,path=[]) {
  const invalid=(message,part=[])=>Object.assign(new Error(message),{path:[...path,...part],field:path[0]});
  if(depth>64)throw invalid('Text components are nested too deeply.');
  if(typeof value==='string')return;
  if(Array.isArray(value)) {
    if(!value.length)throw invalid('A text component array needs at least one entry.');
    value.forEach((entry,index)=>validateComponent(entry,depth+1,[...path,index]));return;
  }
  if(!value||typeof value!=='object'||!['text','translate','score','selector','keybind','nbt'].some(key=>Object.hasOwn(value,key)))throw invalid('Use text or a Minecraft text component.');
  for(const key of ['text','translate','fallback','selector','keybind','nbt'])if(value[key]!==undefined&&typeof value[key]!=='string')throw invalid(key+' in a text component must be text.',[key]);
  for(const key of ['bold','italic','underlined','strikethrough','obfuscated'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw invalid(key+' in a text component must be true or false.',[key]);
  for(const key of ['extra','with'])if(value[key]!==undefined) {
    if(!Array.isArray(value[key]))throw invalid(key+' in a text component must be a list.',[key]);
    value[key].forEach((entry,index)=>validateComponent(entry,depth+1,[...path,key,index]));
  }
  if(value.score!==undefined&&(!value.score||typeof value.score.name!=='string'||typeof value.score.objective!=='string'))throw invalid('A score component needs a name and objective.',['score']);
}
function pacingCue(raw){
  const match=/^(\/?)(pause|speed)(?:[=:](.*))?$/i.exec(raw);
  if(!match)return null;
  const kind=match[2].toLowerCase(),value=Number(match[3]);
  if(match[1]||!match[3]||!/^[0-9]+(?:\.[0-9]+)?$/.test(match[3])||!Number.isFinite(value)||(kind==='pause'?value<0||value>60000||!Number.isInteger(value):value<.1||value>10))throw new Error('Invalid dialogue pacing tag <'+raw+'>.');
  return {kind,value};
}
function glyphList(result,cues=[]){Object.defineProperty(result,'cues',{value:cues});return result;}
function schedule(all,cues,unitMillis,words=false){
  if(cues.length>64)throw new Error('Dialogue may contain at most 64 pacing cues.');
  const times=[],positions=[];let time=0,speed=1,cue=0;
  for(let index=0;index<=all.length;index++){
    while(cue<cues.length&&cues[cue].offset===index){const event=cues[cue++];if(event.kind==='pause')time+=event.value;else speed=event.value;}
    if(index===all.length)break;
    if(!words||!/\s/u.test(all[index].ch)&&(index+1===all.length||/\s/u.test(all[index+1].ch))){time+=unitMillis/speed;times.push(time);positions.push(index+1);}
  }
  return {durationMillis:time,durationTicks:Math.max(0,Math.ceil((time-1e-7)/50)),visible(elapsed){let low=0,high=times.length;while(low<high){const middle=(low+high)>>>1;if(times[middle]<=elapsed+1e-7)low=middle+1;else high=middle;}return low===0?0:positions[low-1];}};
}
const playbackCache=new WeakMap();
function playback(cfg,names={}){
  const key=JSON.stringify([cfg.text,cfg.subtitle,cfg.animation,cfg.reveal_ticks,cfg.variables,cfg.fallbacks,cfg.variants,names]),cached=playbackCache.get(cfg);
  if(cached?.key===key)return cached.value;
  const resolved=dialogue(cfg,names),main=parse(resolved.text,resolved.names),sub=parse(resolved.subtitle,resolved.names,main.length+1),all=[...main,{ch:'\n',index:main.length,effect:{}},...sub],ends=wordEnds(all),cues=[...main.cues,...sub.cues],words=cfg.animation==='word_by_word',paced=cues.length>0&&['letter_by_letter','word_by_word'].includes(cfg.animation);
  if(cues.length>64)throw new Error('Dialogue may contain at most 64 pacing cues.');
  const timing=paced?schedule(all,cues,cfg.reveal_ticks*50/Math.max(1,words?ends.length:all.length),words):null;
  const value={main,sub,all,ends,timing,revealTicks:timing?timing.durationTicks:cfg.animation==='immediate'?0:cfg.reveal_ticks};
  playbackCache.set(cfg,{key,value});return value;
}
function revealDuration(cfg,names={}){return playback(cfg,names).revealTicks;}
function parse(text, names={}, offset=0, inherited={}) {
  if(typeof text!=='string') {
    if(Array.isArray(text)) {
      let result=[],cues=[],base=inherited;
      text.forEach((entry,index)=>{
        if(index===0&&entry&&typeof entry==='object'&&!Array.isArray(entry))base={...inherited,...entry};
        const child=parse(entry,names,offset+result.length,base);result.push(...child);cues.push(...child.cues);
      });
      return glyphList(result,cues);
    }
    const style={...inherited,...text},effect={};
    for(const [key,target] of [['bold','bold'],['italic','italic'],['underlined','underline'],['strikethrough','strike'],['obfuscated','obfuscated']])if(typeof style[key]==='boolean')effect[target]=style[key];
    const tint=typeof style.color==='string'?color(style.color):null;
    if(tint!==null)effect.color=tint;
    const own={...text};delete own.extra;
    const ownGlyphs=parse(componentText(own),names,offset),cues=[...ownGlyphs.cues],result=ownGlyphs.map(glyph=>({...glyph,effect:{...effect,...glyph.effect},tint:glyph.effect.color??tint??glyph.tint}));
    for(const child of text.extra??[]){const glyphs=parse(child,names,offset+result.length,style);result.push(...glyphs);cues.push(...glyphs.cues);}
    return glyphList(result,cues);
  }

  text=text.replace(/\r\n?/g,'\n');
  const base=[], chars=[];
  let style={};
  for(const [key,target] of [['bold','bold'],['italic','italic'],['underlined','underline'],['strikethrough','strike'],['obfuscated','obfuscated']])if(typeof inherited[key]==='boolean')style[target]=inherited[key];
  if(typeof inherited.color==='string'&&color(inherited.color)!==null)style.color=color(inherited.color);
  const legacyColors=Object.values(colors);
  for (let i=0;i<text.length;) {
    if (text[i]==='§' && i+1<text.length) {
      const code=text[++i].toLowerCase(), n='0123456789abcdef'.indexOf(code);
      if(n>=0) style={color:legacyColors[n]};
      else if(code==='r') style={};
      else if('klmno'.includes(code)) style={...style,[{k:'obfuscated',l:'bold',m:'strike',n:'underline',o:'italic'}[code]]:true};
      i++;
      continue;
    }
    const ch=String.fromCodePoint(text.codePointAt(i));
    for(let unit=0;unit<ch.length;unit++) { chars.push(ch[unit]);base.push(style); }
    i+=ch.length;
  }
  const plain=chars.join(''), tags=[];
  for(const m of plain.matchAll(/\{([a-z_][a-z0-9_:./-]*(?:\|[^{}]*)?)\}|<(\/?)([^<>]+)>/g)) {
    const brace=m[1]!==undefined,value=brace?m[1]:m[3],raw=value.trim().toLowerCase(),closing=!brace&&!!m[2];
    tags.push({start:m.index,end:m.index+m[0].length,name:canonical(raw.split(':')[0]),closing,effect:brace?null:effects(raw),cue:brace?null:pacingCue(value.trim()),replacement:!closing&&!names.__substitution?token(value,names):null});
  }
  function closed(index,name) {
    let depth=1;
    for(let next=index+1;next<tags.length;next++) if(tags[next].name===name) {
      if(tags[next].closing) { if(--depth===0) return true; }
      else if(tags[next].effect) depth++;
    }
    return false;
  }
  const stack=[{tag:'',effect:{}}], result=[],cues=[];
  function append(start,end,effect) {
    while(start<end) {
      let next=start+1;
      while(next<end && base[start]===base[next]) next++;
      const span=Array.from(plain.slice(start,next)), merged={...base[start],...effect};
      span.forEach((ch,index)=>{
        const tint=merged.rainbow?rainbow(index/Math.max(1,span.length)):merged.gradient?lerpColor(...merged.gradient,index/Math.max(1,span.length-1)):merged.color??0xffffff;
        result.push({ch,effect:merged,tint,phase:index,index:offset+result.length});
      });
      start=next;
    }
  }
  let cursor=0;
  tags.forEach((tag,index)=>{
    if(tag.cue){append(cursor,tag.start,stack.at(-1).effect);cues.push({...tag.cue,offset:offset+result.length});cursor=tag.end;return;}
    if(tag.replacement){
      append(cursor,tag.start,stack.at(-1).effect);
      const inherited={...base[tag.start],...stack.at(-1).effect};
      const inserted=parse(tag.replacement.value,{...names,__substitution:true},offset+result.length);cues.push(...inserted.cues);
      for(const glyph of inserted){
        const effect={...inherited,...glyph.effect},phase=glyph.phase,tint=effect.rainbow?rainbow(phase/Math.max(1,tag.replacement.text.length)):effect.gradient?lerpColor(...effect.gradient,phase/Math.max(1,tag.replacement.text.length-1)):effect.color??glyph.tint;
        result.push({...glyph,effect,tint});
      }
      cursor=tag.end;return;
    }
    const valid=tag.closing ? stack.length>1 && stack.at(-1).tag===tag.name : tag.effect && stack.length<64 && closed(index,tag.name);
    if(!valid) return;
    append(cursor,tag.start,stack.at(-1).effect);
    if(tag.closing) stack.pop();
    else stack.push({tag:tag.name,effect:{...stack.at(-1).effect,...tag.effect}});
    cursor=tag.end;
  });
  append(cursor,plain.length,stack.at(-1).effect);
  if(cues.length>64)throw new Error('Dialogue may contain at most 64 pacing cues.');
  return glyphList(result,cues);
}
function wrap(glyphs,width,advance) {
  const lines=[];
  let start=0;
  for(let i=0;i<=glyphs.length;i++) {
    if(i!==glyphs.length && glyphs[i].ch!=='\n') continue;
    if(i===start) lines.push({glyphs:[],width:0});
    while(start<i) {
      let end=start, used=0,lastSpace=-1;
      while(end<i) {
        const step=advance(glyphs[end]);
        if(end>start && used+step>width) break;
        used+=step;
        if(/\s/u.test(glyphs[end].ch)) lastSpace=end;
        end++;
      }
      if(end<i && lastSpace>start) end=lastSpace;
      let trimmed=end;
      while(trimmed>start && /\s/u.test(glyphs[trimmed-1].ch)) trimmed--;
      const part=glyphs.slice(start,trimmed);
      lines.push({glyphs:part,width:part.reduce((sum,g)=>sum+advance(g),0)});
      start=end;
      while(start<i && /\s/u.test(glyphs[start].ch)) start++;
    }
    start=i+1;
  }
  return lines;
}
function padding(glyphs) {
  const animated=glyphs.filter(g=>active(g.effect));
  if(!animated.length) return [0,0];
  return [Math.ceil(Math.max(...animated.map(g=>g.effect.shake?1.15:0)))+1,
    Math.ceil(Math.max(...animated.map(g=>(g.effect.wave?1.75:0)+(g.effect.jump?2.4:0))))+1];
}
function bounds(block) {
  const width=Math.max(0,...block.lines.map(line=>line.width))*block.scale;
  return {x:block.x-width*block.column/2,y:block.y,width,height:block.lines.length*block.lineHeight*block.scale};
}
function guiViewport(width,height,requested=0) {
  const maxScale=Math.max(1,Math.min(Math.floor(width/320),Math.floor(height/240)));
  const scale=requested===0?maxScale:Math.max(1,Math.min(requested,maxScale));
  return {width,height,scale,maxScale,guiWidth:Math.ceil(width/scale),guiHeight:Math.ceil(height/scale)};
}
function barHeight(screenHeight,requestedHeight=26) { return Math.min(requestedHeight,Math.trunc(screenHeight/4)); }
function layout(cfg,main,sub,width,height,advance) {
  const pads=padding([...main,...sub]), margin=Math.min(20+Math.max(...pads)*1.5,Math.min(width,height)/4);
  const top=margin,bottom=height-margin;
  const aw=Math.max(1,width-margin*2), ah=Math.max(1,bottom-top);
  const p=positions[cfg.title_position], q=positions[cfg.subtitle_position];
  const ts=cfg.title?1.5:1, ss=cfg.large_subtitle?1.5:1, lh=12+pads[1]*2;
  const maxWidth=lines=>Math.max(0,...lines.map(line=>line.width));
  if(!cfg.title_coordinates&&!cfg.subtitle_coordinates&&(!sub.length||cfg.title_position===cfg.subtitle_position)) {
    const a=wrap(main,Math.max(1,Math.trunc(aw/ts)),advance), b=sub.length?wrap(sub,Math.max(1,Math.trunc(aw/ss)),advance):[];
    const th=a.length*lh*ts, sh=b.length*lh*ss, gap=b.length?8:0;
    const fit=Math.min(1,ah/(th+gap+sh),aw/Math.max(1,maxWidth(a)*ts,maxWidth(b)*ss));
    const x=margin+aw*p[0]/2,y=top+(ah-(th+gap+sh)*fit)*p[1]/2;
    return [{lines:a,scale:ts*fit,column:p[0],x,y,lineHeight:lh},{lines:b,scale:ss*fit,column:p[0],x,y:y+(th+gap)*fit,lineHeight:lh}];
  }
  const span=(anchor,size,alignment)=>alignment===0?size-anchor:alignment===2?anchor:2*Math.min(anchor,size-anchor);
  function positioned(glyphs,scale,pos,coordinates,limit=Infinity) {
    const x=coordinates?width*coordinates.x/100:margin+aw*pos[0]/2;
    const anchorY=coordinates?height*coordinates.y/100:0;
    // configured widths only constrain text when another block would overlap
    const maxWidth=Math.max(1,Math.min(limit,coordinates?span(x,width,pos[0]):aw));
    const maxHeight=coordinates?Math.max(1,span(anchorY,height,pos[1])):ah;
    const lines=glyphs.length?wrap(glyphs,Math.max(1,Math.trunc(maxWidth/scale)),advance):[];
    scale*=Math.min(1,maxHeight/Math.max(1,lines.length*lh*scale),maxWidth/Math.max(1,...lines.map(line=>line.width*scale)));
    const y=coordinates?anchorY-lines.length*lh*scale*pos[1]/2:top+(ah-lines.length*lh*scale)*pos[1]/2;
    return {lines,scale,column:pos[0],x,y,lineHeight:lh};
  }
  const titleLayout=limit=>positioned(main,ts,p,cfg.title_coordinates,limit);
  const subtitleLayout=limit=>positioned(sub,ss,q,cfg.subtitle_coordinates,limit);
  const title=titleLayout(Infinity),subtitle=subtitleLayout(Infinity);
  function overlaps(a,b) {
    const hp=pads[0]+1,vp=pads[1]+1;
    return a.lines.some((line,i)=>line.glyphs.length&&b.lines.some((other,j)=>{
      if(!other.glyphs.length)return false;
      const left=a.x-line.width*a.scale*a.column/2-hp*a.scale;
      const right=left+(line.width+hp*2)*a.scale;
      const top=a.y+(i*lh-vp)*a.scale,bottom=top+(9+vp*2)*a.scale;
      const otherLeft=b.x-other.width*b.scale*b.column/2-hp*b.scale;
      const otherTop=b.y+(j*lh-vp)*b.scale;
      return left<otherLeft+(other.width+hp*2)*b.scale&&right>otherLeft&&top<otherTop+(9+vp*2)*b.scale&&bottom>otherTop;
    }));
  }
  if(!overlaps(title,subtitle))return [title,subtitle];
  const gap=4+pads[0]*2*Math.max(ts,ss);
  const space=(block,left,right)=>block.x<left||block.x>right?0:span(block.x-left,right-left,block.column);
  let best=null;
  function consider(candidate) {
    if(overlaps(...candidate))return;
    const lines=blocks=>blocks.reduce((sum,block)=>sum+block.lines.length,0);
    if(!best||lines(candidate)<lines(best)||lines(candidate)===lines(best)&&candidate[0].scale+candidate[1].scale>best[0].scale+best[1].scale)best=candidate;
  }
  [title,subtitle].forEach((block,index)=>{
    const other=index===0?subtitle:title,box=bounds(other);
    const coordinates=index===0?cfg.title_coordinates:cfg.subtitle_coordinates;
    const limits=[space(block,0,box.x-gap),space(block,box.x+box.width+gap,width),coordinates?width*(coordinates.width??50)/100:aw];
    for(const limit of limits) {
      if(limit<=0||limit>=bounds(block).width)continue;
      consider(index===0?[titleLayout(limit),subtitle]:[title,subtitleLayout(limit)]);
    }
  });
  if(title.x!==subtitle.x) {
    const middle=(title.x+subtitle.x)/2;
    const titleWidth=title.x<subtitle.x?space(title,0,middle-gap/2):space(title,middle+gap/2,width);
    const subWidth=title.x<subtitle.x?space(subtitle,middle+gap/2,width):space(subtitle,0,middle-gap/2);
    if(titleWidth>0&&subWidth>0)consider([titleLayout(titleWidth),subtitleLayout(subWidth)]);
  }
  if(best)return best;
  const th=bounds(title).height,sh=bounds(subtitle).height,fit=Math.min(1,ah/(th+8+sh));
  const titleY=title.y+th*p[1]/2,subtitleY=subtitle.y+sh*q[1]/2,groupHeight=(th+8+sh)*fit;
  const groupTop=clamp((titleY+subtitleY-groupHeight)/2,top,bottom-groupHeight);
  return [{...title,y:groupTop,scale:title.scale*fit},{...subtitle,y:groupTop+(th+8)*fit,scale:subtitle.scale*fit}];
}
function barVisibility(ticks,duration,transitionTicks) {
  const f=Math.fround,transition=Math.min(transitionTicks,duration/2),entry=clamp(f(ticks/transition)),exit=clamp(f((ticks-f(duration-transition))/transition));
  return f(f(1-f((1-entry)**3))*f(1-f(f(exit*exit)*exit)));
}
function sampleSlant(token,style='random') {
  if(style==='straight')return 0;
  const bits=BigInt('0x'+token.replaceAll('-','').slice(-16)),mask=(1n<<48n)-1n;
  const seed=(((bits^0x5deece66dn)&mask)*0x5deece66dn+11n)&mask;
  return Math.fround(-12+Math.fround(Number(seed>>24n)/16777216*24));
}
function presentation(cfg,names={}) { return Math.max(cfg.fade_from_black_ticks,revealDuration(cfg,names)+cfg.hold_ticks+cfg.fade_out_ticks); }
function trackTiming(cfg,names={}) {
  if(cfg.timeline)return {...cfg.timeline};
  const total=presentation(cfg,names),bar=Math.min(cfg.bar_transition_ticks,total/2);
  return {text_start_ticks:cfg.black_hold_ticks,bar_start_ticks:cfg.black_hold_ticks,bar_enter_ticks:bar,bar_hold_ticks:total-bar*2,bar_exit_ticks:bar};
}
function textStart(cfg){return cfg.timeline?.text_start_ticks??cfg.black_hold_ticks;}
function textDuration(cfg,names={}){return cfg.timeline?revealDuration(cfg,names)+cfg.hold_ticks+cfg.fade_out_ticks:presentation(cfg,names);}
function barProgress(cfg,time,names={}){
  if(!cfg.timeline)return barVisibility(time-cfg.black_hold_ticks,presentation(cfg,names),cfg.bar_transition_ticks);
  const timing=cfg.timeline,ticks=time-timing.bar_start_ticks,entry=clamp(Math.fround(ticks/timing.bar_enter_ticks)),exit=clamp(Math.fround((ticks-timing.bar_enter_ticks-timing.bar_hold_ticks)/timing.bar_exit_ticks)),f=Math.fround;
  return f(f(1-f((1-entry)**3))*f(1-f(f(exit*exit)*exit)));
}
function duration(cfg,names={}) {
  if(!cfg.timeline)return cfg.black_hold_ticks+presentation(cfg,names);
  const timing=cfg.timeline,bars=cfg.cinematic_bars?timing.bar_start_ticks+timing.bar_enter_ticks+timing.bar_hold_ticks+timing.bar_exit_ticks:0;
  return Math.max(cfg.black_hold_ticks+cfg.fade_from_black_ticks,textStart(cfg)+textDuration(cfg,names),bars);
}
function wordEnds(all) {return all.filter((g,i)=>!/\s/u.test(g.ch)&&(i+1===all.length||/\s/u.test(all[i+1].ch))).map(g=>g.index+1);}
function visible(cfg,all,ticks,ends,timing=null) {
  if(cfg.animation==='immediate'||cfg.animation==='fade_in') return all.length;
  if(timing)return timing.visible(ticks*50);
  const progress=clamp(ticks/cfg.reveal_ticks);
  if(cfg.animation==='letter_by_letter') return Math.floor(all.length*progress);
  ends??=wordEnds(all);
  const count=Math.floor(ends.length*progress);
  return count===0?0:ends[count-1];
}
function revealCues(glyphs,visibleAt,total,{start=0,first=3,step=3,pitch=.9,spread=.2}={},random=Math.random){
  const cues=[];let last=0,next=first;
  for(let tick=1;tick<total;tick++){
    if(tick<start)continue;const count=Math.min(glyphs.length,visibleAt(tick));if(count<next)continue;
    if(glyphs.slice(last,count).some(glyph=>/[\p{L}\p{Nd}]/u.test(glyph.ch)))cues.push({tick,pitch:pitch+random()*spread,count});
    last=count;next=count+step+Math.floor(random()*3);
  }
  return cues;
}
function blipCues(cfg,names={},random=Math.random){
  if(!cfg.blip)return [];
  const {all:glyphs,ends,timing}=playback(cfg,names),start=textStart(cfg);
  return revealCues(glyphs,tick=>visible(cfg,glyphs,tick-start,ends,timing),duration(cfg,names),{start},random);
}
function glyphFrame(g,tick,alpha) {
  const e=g.effect, i=g.phase;
  let tint=e.rainbow?rainbow(tick*.006+i*.025):g.tint;
  if(e.pulse) {
    const pulse=.72+(Math.sin(tick*.22+i*.18)*.5+.5)*.28;
    alpha=Math.round(alpha*pulse);
    const factor=.86+pulse*.24;
    tint=[16,8,0].reduce((out,shift)=>out|(clamp(Math.round(((tint>>shift)&255)*factor),0,255)<<shift),0);
  }
  return {x:e.shake?Math.sin(tick*1.7+i*1.31)*1.15:0,y:(e.wave?Math.sin((tick+i*6*.55)*.24)*1.75:0)-(e.jump?Math.abs(Math.sin(tick*.28-i*.55))*2.4:0),tint,alpha};
}
function validate(cfg) {
  validateDialogue(cfg);
  for(const value of [cfg.text,cfg.subtitle,...Object.values(cfg.variables??{}),...Object.values(cfg.fallbacks??{}),...(cfg.variants??[]).flatMap(entry=>[entry.text,entry.subtitle])])if(value!==undefined)parse(typeof value==='boolean'||typeof value==='number'?String(value):value);
  for(const field of ['text','subtitle'])validateComponent(cfg[field],0,[field]);
  for(const key of ['title','large_subtitle','outline','blip','cinematic_bars','hide_hud_during_bars']) if(typeof cfg[key]!=='boolean') throw Object.assign(new Error(key+' must be true or false.'),{field:key});
  if(!componentText(cfg.text).trim()) throw Object.assign(new Error('Enter some main text.'),{field:'text'});
  if(JSON.stringify({text:cfg.text}).length+JSON.stringify({text:cfg.subtitle}).length+JSON.stringify({variables:cfg.variables??{},fallbacks:cfg.fallbacks??{},variants:cfg.variants??[]}).length>16384) throw Object.assign(new Error('Text and subtitle exceed the 16,384-character limit.'),{field:'text'});
  for(const field of ['black_hold_ticks','fade_from_black_ticks','reveal_ticks','hold_ticks','fade_out_ticks','bar_transition_ticks']) {
    const min=field==='black_hold_ticks'?0:1;
    if(!Number.isInteger(cfg[field])||cfg[field]<min||cfg[field]>1200) throw Object.assign(new Error(({black_hold_ticks:'Black screen',fade_from_black_ticks:'World fade',reveal_ticks:'Text reveal',hold_ticks:'Text hold',fade_out_ticks:'Text fade out',bar_transition_ticks:'Bar movement'})[field]+' must be a whole number from '+min+' to 1200.'),{field});
  }
  if(cfg.timeline!==null&&cfg.timeline!==undefined){
    if(typeof cfg.timeline!=='object'||Array.isArray(cfg.timeline))throw Object.assign(new Error('Timeline must be an object.'),{field:'timeline'});
    for(const key of ['text_start_ticks','bar_start_ticks','bar_enter_ticks','bar_hold_ticks','bar_exit_ticks']){
      const value=cfg.timeline[key],minimum=['bar_enter_ticks','bar_exit_ticks'].includes(key)?1:0,maximum=key==='bar_hold_ticks'?3600:1200;
      if(!Number.isInteger(value)||value<minimum||value>maximum)throw Object.assign(new Error(key+' must be a whole number from '+minimum+' to '+maximum+'.'),{field:'timeline.'+key});
    }
  }
  if(!Number.isInteger(cfg.bar_height)||cfg.bar_height<1||cfg.bar_height>1200)throw Object.assign(new Error('Bar thickness must be a whole number from 1 to 1200 GUI pixels.'),{field:'bar_height'});
  for(const key of ['title_position','subtitle_position']) if(!Object.hasOwn(positions,cfg[key])) throw Object.assign(new Error('Unknown text position.'),{field:key});
  for(const key of ['title_coordinates','subtitle_coordinates'])if(cfg[key]!=null) {
    const value=cfg[key];
    if(typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error(key+' must contain x and y percentages.'),{field:key});
    for(const field of ['x','y','width']) {
      const number=Object.hasOwn(value,field)?value[field]:(field==='width'?50:NaN),min=field==='width'?1:0;
      if(typeof number!=='number'||!Number.isFinite(number)||number<min||number>100)throw Object.assign(new Error(key+'.'+field+' must be a number from '+min+' to 100.'),{field:key+'.'+field});
    }
  }
  if(!['fade_in','word_by_word','letter_by_letter','immediate'].includes(cfg.animation)) throw Object.assign(new Error('Unknown reveal mode.'),{field:'animation'});
  if(!['after_title','during_title'].includes(cfg.control)) throw Object.assign(new Error('Unknown control setting.'),{field:'control'});
  if(!['random','straight'].includes(cfg.bar_style)) throw Object.assign(new Error('Unknown bar style.'),{field:'bar_style'});
  playback(cfg);
  for(const variant of cfg.variants??[])playback({...cfg,...variant,variants:[]});
  return cfg;
}
const api={validateSamples,pacingCue,schedule,playback,revealDuration,factDefaults,keyDefaults,condition,validateCondition,dialogue,diagnostics,contextDefaults,token,effects,canonical,barHeight,barVisibility,sampleSlant,componentText,validateComponent,colors,positions,defaults,packDefaults,readJson,updateJson,parse,wrap,padding,bounds,guiViewport,layout,presentation,trackTiming,textStart,textDuration,barProgress,duration,wordEnds,visible,revealCues,blipCues,glyphFrame,validate,clamp,active};
if(typeof module!=='undefined') module.exports=api;
else globalThis.HeritagePreview=api;
})();
