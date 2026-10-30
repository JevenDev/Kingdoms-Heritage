(() => {
'use strict';
const colors = {black:0x000000,dark_blue:0x0000aa,dark_green:0x00aa00,dark_aqua:0x00aaaa,dark_red:0xaa0000,dark_purple:0xaa00aa,gold:0xffaa00,gray:0xaaaaaa,dark_gray:0x555555,blue:0x5555ff,green:0x55ff55,aqua:0x55ffff,red:0xff5555,light_purple:0xff55ff,yellow:0xffff55,white:0xffffff};
const aliases = {i:'italic',italics:'italic',b:'bold',u:'underline',underlined:'underline',s:'strike',strikethrough:'strike',obfuscate:'obfuscated',magic:'obfuscated',wavy:'wave',shaky:'shake',pulsing:'pulse',jumping:'jump',bounce:'jump',bouncy:'jump'};
const positions = {mid_center:[1,1],top_center:[1,0],bottom_center:[1,2],left_center:[0,1],right_center:[2,1],top_left:[0,0],top_right:[2,0],bottom_left:[0,2],bottom_right:[2,2]};
const defaults = {text:'You woke up in <wave><gold><biome></gold></wave>...',subtitle:'<italic>A new journey begins.</italic>',title:false,large_subtitle:false,outline:true,animation:'word_by_word',control:'after_title',blip:true,black_hold_ticks:60,fade_from_black_ticks:60,reveal_ticks:40,hold_ticks:60,fade_out_ticks:20,cinematic_bars:true,bar_style:'random',bar_transition_ticks:40,hide_hud_during_bars:true,title_position:'left_center',subtitle_position:'left_center'};
const packDefaults = {...defaults,text:'',subtitle:'',animation:'fade_in',blip:false,cinematic_bars:false,hide_hud_during_bars:false,title_position:'mid_center',subtitle_position:'mid_center'};
const positionAliases = {center:'mid_center',mc:'mid_center',mid_c:'mid_center',tc:'top_center',top_c:'top_center',bc:'bottom_center',bottom_c:'bottom_center',lc:'left_center',left_c:'left_center',rc:'right_center',right_c:'right_center',tl:'top_left',tr:'top_right',bl:'bottom_left',br:'bottom_right'};
function readJson(source) {
  let document;
  try { document=JSON.parse(/^\s*"intro"\s*:/.test(source)?'{'+source+'}':source); }
  catch(error) { throw new Error('Invalid JSON: '+error.message); }
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  if(!object(document)) throw new Error('Paste an intro object or a spawn definition containing intro.');
  const wrapped=Object.hasOwn(document,'intro'), intro=wrapped?document.intro:document;
  if(!object(intro)) throw new Error('intro must be a JSON object.');
  if(!Object.hasOwn(intro,'text')) throw new Error('intro requires text.');
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
  validate(config);
  return {document,wrapped,config};
}
function updateJson(state,changes) {
  const intro={...(state.wrapped?state.document.intro:state.document),...changes};
  return readJson(JSON.stringify(state.wrapped?{...state.document,intro}:intro));
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
function validateComponent(value,depth=0) {
  if(depth>64)throw new Error('Text components are nested too deeply.');
  if(typeof value==='string')return;
  if(Array.isArray(value)) {
    if(!value.length)throw new Error('A text component array needs at least one entry.');
    value.forEach(entry=>validateComponent(entry,depth+1));return;
  }
  if(!value||typeof value!=='object'||!['text','translate','score','selector','keybind','nbt'].some(key=>Object.hasOwn(value,key)))throw new Error('Use text or a Minecraft text component.');
  for(const key of ['text','translate','fallback','selector','keybind','nbt'])if(value[key]!==undefined&&typeof value[key]!=='string')throw new Error(key+' in a text component must be text.');
  for(const key of ['bold','italic','underlined','strikethrough','obfuscated'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error(key+' in a text component must be true or false.');
  for(const key of ['extra','with'])if(value[key]!==undefined) {
    if(!Array.isArray(value[key]))throw new Error(key+' in a text component must be a list.');
    value[key].forEach(entry=>validateComponent(entry,depth+1));
  }
  if(value.score!==undefined&&(!value.score||typeof value.score.name!=='string'||typeof value.score.objective!=='string'))throw new Error('A score component needs a name and objective.');
}
function parse(text, names={}, offset=0, inherited={}) {
  if(typeof text!=='string') {
    if(Array.isArray(text)) {
      let result=[],base=inherited;
      text.forEach((entry,index)=>{
        if(index===0&&entry&&typeof entry==='object'&&!Array.isArray(entry))base={...inherited,...entry};
        result.push(...parse(entry,names,offset+result.length,base));
      });
      return result;
    }
    const style={...inherited,...text},effect={};
    for(const [key,target] of [['bold','bold'],['italic','italic'],['underlined','underline'],['strikethrough','strike'],['obfuscated','obfuscated']])if(typeof style[key]==='boolean')effect[target]=style[key];
    const tint=typeof style.color==='string'?color(style.color):null;
    if(tint!==null)effect.color=tint;
    const own={...text};delete own.extra;
    const result=parse(componentText(own),names,offset).map(glyph=>({...glyph,effect:{...effect,...glyph.effect},tint:glyph.effect.color??tint??glyph.tint}));
    for(const child of text.extra??[])result.push(...parse(child,names,offset+result.length,style));
    return result;
  }

  text=text.replace(/\r\n?/g,'\n').replace(/<(biome|structure|dimension)>/g,(_,key)=>names[key] || ({biome:'Plains',structure:'Wilderness',dimension:'Overworld'})[key]);
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
  for(const m of plain.matchAll(/<(\/?)([^<>]+)>/g)) {
    const raw=m[2].trim().toLowerCase();
    tags.push({start:m.index,end:m.index+m[0].length,name:canonical(raw.split(':')[0]),closing:!!m[1],effect:effects(raw)});
  }
  function closed(index,name) {
    let depth=1;
    for(let next=index+1;next<tags.length;next++) if(tags[next].name===name) {
      if(tags[next].closing) { if(--depth===0) return true; }
      else if(tags[next].effect) depth++;
    }
    return false;
  }
  const stack=[{tag:'',effect:{}}], result=[];
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
    const valid=tag.closing ? stack.length>1 && stack.at(-1).tag===tag.name : tag.effect && stack.length<64 && closed(index,tag.name);
    if(!valid) return;
    append(cursor,tag.start,stack.at(-1).effect);
    if(tag.closing) stack.pop();
    else stack.push({tag:tag.name,effect:{...stack.at(-1).effect,...tag.effect}});
    cursor=tag.end;
  });
  append(cursor,plain.length,stack.at(-1).effect);
  return result;
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
  const textWidth=Math.max(0,...block.lines.map(line=>line.width))*block.scale;
  const width=block.wrapWidth??textWidth;
  return {x:block.x-width*block.column/2,y:block.y,width,height:block.lines.length*block.lineHeight*block.scale};
}
function guiViewport(width,height,requested=0) {
  const maxScale=Math.max(1,Math.min(Math.floor(width/320),Math.floor(height/240)));
  const scale=requested===0?maxScale:Math.max(1,Math.min(requested,maxScale));
  return {width,height,scale,maxScale,guiWidth:Math.ceil(width/scale),guiHeight:Math.ceil(height/scale)};
}
function layout(cfg,main,sub,width,height,slant,advance) {
  const pads=padding([...main,...sub]), margin=Math.min(20+Math.max(...pads)*1.5,Math.min(width,height)/4);
  let top=margin,bottom=height-margin;
  if(cfg.cinematic_bars) {
    const bar=Math.min(26,height/4);
    top=Math.min(height/2-1,top+bar+Math.max(0,slant));
    bottom=Math.max(height/2+1,bottom-bar+Math.min(0,slant));
  }
  const aw=Math.max(1,width-margin*2), ah=Math.max(1,bottom-top);
  const p=positions[cfg.title_position], q=positions[cfg.subtitle_position];
  const ts=cfg.title?1.5:1, ss=cfg.large_subtitle?1.5:1, lh=12+pads[1]*2;
  if(cfg.title_coordinates||cfg.subtitle_coordinates) {
    const span=(anchor,size,alignment)=>alignment===0?size-anchor:alignment===2?anchor:2*Math.min(anchor,size-anchor);
    function positioned(glyphs,scale,pos,coordinates) {
      const x=coordinates?width*coordinates.x/100:margin+aw*pos[0]/2;
      const anchorY=coordinates?height*coordinates.y/100:0;
      const maxWidth=coordinates?Math.max(1,Math.min(width*(coordinates.width??50)/100,span(x,width,pos[0]))):aw;
      const maxHeight=coordinates?Math.max(1,span(anchorY,height,pos[1])):ah;
      const lines=glyphs.length?wrap(glyphs,Math.max(1,Math.trunc(maxWidth/scale)),advance):[];
      scale*=Math.min(1,maxHeight/Math.max(1,lines.length*lh*scale),maxWidth/Math.max(1,...lines.map(line=>line.width*scale)));
      const y=coordinates?anchorY-lines.length*lh*scale*pos[1]/2:top+(ah-lines.length*lh*scale)*pos[1]/2;
      return {lines,scale,column:pos[0],x,y,lineHeight:lh,...(coordinates?{wrapWidth:maxWidth}:{})};
    }
    return [positioned(main,ts,p,cfg.title_coordinates),positioned(sub,ss,q,cfg.subtitle_coordinates)];
  }
  const together=!sub.length || cfg.title_position===cfg.subtitle_position, rows=!together&&p[1]!==q[1];
  const ww=!together&&!rows?aw/(Math.abs(p[0]-q[0])===2?2:3):aw;
  const maxHeight=rows?ah/3:ah;
  const a=wrap(main,Math.max(1,Math.trunc(ww/ts)),advance), b=sub.length?wrap(sub,Math.max(1,Math.trunc(ww/ss)),advance):[];
  const maxWidth=lines=>Math.max(0,...lines.map(line=>line.width));
  function place(lines,scale,pos) {
    scale*=Math.min(1,maxHeight/Math.max(1,lines.length*lh*scale),ww/Math.max(1,maxWidth(lines)*scale));
    return {lines,scale,column:pos[0],x:margin+aw*pos[0]/2,y:top+(ah-lines.length*lh*scale)*pos[1]/2,lineHeight:lh};
  }
  if(!together) return [place(a,ts,p),place(b,ss,q)];
  const th=a.length*lh*ts, sh=b.length*lh*ss, gap=b.length?8:0;
  const fit=Math.min(1,ah/(th+gap+sh),aw/Math.max(1,maxWidth(a)*ts,maxWidth(b)*ss));
  const x=margin+aw*p[0]/2,y=top+(ah-(th+gap+sh)*fit)*p[1]/2;
  return [{lines:a,scale:ts*fit,column:p[0],x,y,lineHeight:lh},{lines:b,scale:ss*fit,column:p[0],x,y:y+(th+gap)*fit,lineHeight:lh}];
}
function presentation(cfg) { return Math.max(cfg.fade_from_black_ticks,(cfg.animation==='immediate'?0:cfg.reveal_ticks)+cfg.hold_ticks+cfg.fade_out_ticks); }
function duration(cfg) { return cfg.black_hold_ticks+presentation(cfg); }
function wordEnds(all) {return all.filter((g,i)=>!/\s/u.test(g.ch)&&(i+1===all.length||/\s/u.test(all[i+1].ch))).map(g=>g.index+1);}
function visible(cfg,all,ticks,ends) {
  if(cfg.animation==='immediate'||cfg.animation==='fade_in') return all.length;
  const progress=clamp(ticks/cfg.reveal_ticks);
  if(cfg.animation==='letter_by_letter') return Math.floor(all.length*progress);
  ends??=wordEnds(all);
  const count=Math.floor(ends.length*progress);
  return count===0?0:ends[count-1];
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
  for(const field of ['text','subtitle'])validateComponent(cfg[field]);
  for(const key of ['title','large_subtitle','outline','blip','cinematic_bars','hide_hud_during_bars']) if(typeof cfg[key]!=='boolean') throw new Error(key+' must be true or false.');
  if(!componentText(cfg.text).trim()) throw new Error('Enter some main text.');
  if(JSON.stringify({text:cfg.text}).length+JSON.stringify({text:cfg.subtitle}).length>16384) throw new Error('Text and subtitle exceed the 16,384-character limit.');
  for(const field of ['black_hold_ticks','fade_from_black_ticks','reveal_ticks','hold_ticks','fade_out_ticks','bar_transition_ticks']) {
    const min=field==='black_hold_ticks'?0:1;
    if(!Number.isInteger(cfg[field])||cfg[field]<min||cfg[field]>1200) throw Object.assign(new Error(({black_hold_ticks:'Black screen',fade_from_black_ticks:'World fade',reveal_ticks:'Text reveal',hold_ticks:'Text hold',fade_out_ticks:'Text fade out',bar_transition_ticks:'Bar movement'})[field]+' must be a whole number from '+min+' to 1200.'),{field});
  }
  for(const key of ['title_position','subtitle_position']) if(!Object.hasOwn(positions,cfg[key])) throw new Error('Unknown text position.');
  for(const key of ['title_coordinates','subtitle_coordinates'])if(cfg[key]!=null) {
    const value=cfg[key];
    if(typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error(key+' must contain x and y percentages.'),{field:key});
    for(const field of ['x','y','width']) {
      const number=Object.hasOwn(value,field)?value[field]:(field==='width'?50:NaN),min=field==='width'?1:0;
      if(typeof number!=='number'||!Number.isFinite(number)||number<min||number>100)throw Object.assign(new Error(key+'.'+field+' must be a number from '+min+' to 100.'),{field:key+'.'+field});
    }
  }
  if(!['fade_in','word_by_word','letter_by_letter','immediate'].includes(cfg.animation)) throw new Error('Unknown reveal mode.');
  if(!['after_title','during_title'].includes(cfg.control)) throw new Error('Unknown control setting.');
  if(!['random','straight'].includes(cfg.bar_style)) throw new Error('Unknown bar style.');
  return cfg;
}
const api={componentText,validateComponent,colors,positions,defaults,packDefaults,readJson,updateJson,parse,wrap,padding,bounds,guiViewport,layout,presentation,duration,wordEnds,visible,glyphFrame,validate,clamp,active};
if(typeof module!=='undefined') module.exports=api;
else globalThis.HeritagePreview=api;
})();
