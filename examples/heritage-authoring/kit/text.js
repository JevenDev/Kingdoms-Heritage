(() => {
'use strict';
const colors={black:'#000000',dark_blue:'#0000aa',dark_green:'#00aa00',dark_aqua:'#00aaaa',dark_red:'#aa0000',dark_purple:'#aa00aa',gold:'#ffaa00',gray:'#aaaaaa',dark_gray:'#555555',blue:'#5555ff',green:'#55ff55',aqua:'#55ffff',red:'#ff5555',light_purple:'#ff55ff',yellow:'#ffff55',white:'#ffffff'};
const flags=['bold','italic','underlined','strikethrough','obfuscated'],legacy='0123456789abcdef',rarityColors={common:'white',uncommon:'yellow',rare:'aqua',epic:'light_purple'};
let translations=Object.create(null),rarities={};
function configure(data){translations=Object.assign(Object.create(null),data.language);rarities=data.rarities;}
function color(value){return Object.hasOwn(colors,value)?colors[value]:typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():undefined;}
function style(value,inherited){
  const result={...inherited};
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const tint=color(value.color);if(tint)result.color=tint;
    for(const key of flags)if(typeof value[key]==='boolean')result[key]=value[key];
  }
  return result;
}
function parse(value,inherited={color:colors.white}){
  const result=[];
  function literal(text,base){
    let current=base,buffer='';
    const flush=()=>{if(buffer){result.push({text:buffer,...current});buffer='';}};
    const chars=Array.from(String(text));
    for(let i=0;i<chars.length;i++){
      if(chars[i]==='§'&&i+1<chars.length){
        flush();const code=chars[++i].toLowerCase(),index=legacy.indexOf(code);
        if(index>=0)current={...base,...Object.fromEntries(flags.map(key=>[key,false])),color:Object.values(colors)[index]};
        else if(code==='r')current=base;
        else{const key={k:'obfuscated',l:'bold',m:'strikethrough',n:'underlined',o:'italic'}[code];if(key)current={...current,[key]:true};}
      }else buffer+=chars[i];
    }
    flush();
  }
  function visit(node,parent,depth=0){
    if(depth>64)return;
    if(Array.isArray(node)){
      if(!node.length)return;
      visit(node[0],parent,depth+1);
      const root=style(node[0],parent);
      for(const sibling of node.slice(1))visit(sibling,root,depth+1);
      return;
    }
    if(node===null||node===undefined)return;
    if(typeof node!=='object'){literal(node,parent);return;}
    const own=style(node,parent);
    if(node.text!==undefined)literal(node.text,own);
    else if(typeof node.translate==='string'){
      const template=String(translations[node.translate]??node.fallback??node.translate),args=Array.isArray(node.with)?node.with:[];
      let cursor=0,next=0;
      for(const match of template.matchAll(/%(?:(\d+)\$)?s|%%/g)){
        literal(template.slice(cursor,match.index),own);
        if(match[0]==='%%')literal('%',own);
        else{const index=match[1]?Number(match[1])-1:next++;if(index<args.length)visit(args[index],own,depth+1);else literal(match[0],own);}
        cursor=match.index+match[0].length;
      }
      literal(template.slice(cursor),own);
    }else if(node.keybind)literal(translations[node.keybind]??node.keybind,own);
    else if(node.selector)literal(node.selector,own);
    else if(node.score)literal(node.score.value??node.score.name??'',own);
    else if(node.nbt)literal(node.nbt,own);
    for(const extra of Array.isArray(node.extra)?node.extra:[])visit(extra,own,depth+1);
  }
  visit(value,inherited);return result;
}
function decode(value,inherited){
  if(typeof value!=='string')return parse(value,inherited);
  try{return parse(JSON.parse(value),inherited);}
  catch(error){if(!(error instanceof SyntaxError))throw error;return parse('[Invalid text component]',{color:colors.red});}
}
const plain=runs=>runs.map(run=>run.text).join('');
function title(stack,tooltip=false){
  const components=stack.components??{},custom=components['minecraft:custom_name'],itemName=components['minecraft:item_name'];
  let rarity=components['minecraft:rarity']??rarities[HeritageKit.normalize(stack.id)]??'common';
  const enchantments=components['minecraft:enchantments'];
  if(enchantments&&Object.values(enchantments.levels??{}).some(level=>level>0))rarity={common:'rare',uncommon:'rare',rare:'epic'}[rarity]??rarity;
  const inherited={color:colors[rarityColors[rarity]]??colors.white,italic:tooltip&&custom!==undefined};
  if(custom!==undefined||itemName!==undefined)return decode(custom??itemName,inherited);
  return parse(HeritageKit.items.get(HeritageKit.normalize(stack.id))?.name??stack.id,inherited);
}
function tooltip(stack,context){
  const components=stack.components??{};
  if(components['minecraft:hide_tooltip']!==undefined)return [];
  const lines=[title(stack,true)];
  if(Array.isArray(components['minecraft:lore']))for(const line of components['minecraft:lore'])lines.push(decode(line,{color:colors.dark_purple,italic:true}));
  lines.push(parse(HeritageKit.normalize(stack.id),{color:colors.dark_gray}));
  if(context)lines.push(parse(context,{color:colors.gray}));
  return lines;
}
function wrap(lines,limit,advance){
  const output=[];
  for(const runs of lines){
    let line=[],width=0,lastSpace=-1;
    const flush=()=>{output.push(line);line=[];width=0;lastSpace=-1;};
    for(const run of runs){
      const {text,...format}=run;
      for(const ch of Array.from(text)){
        if(ch==='\n'){flush();continue;}
        const glyph={...format,ch},size=advance(glyph);
        while(width+size>limit&&line.length){
          if(lastSpace>=0){
            const tail=line.slice(lastSpace+1);line=line.slice(0,lastSpace);flush();line=tail;width=line.reduce((sum,g)=>sum+advance(g),0);
          }else flush();
        }
        if(ch===' '&&!line.length)continue;
        line.push(glyph);width+=size;
        if(ch===' ')lastSpace=line.length-1;
      }
    }
    flush();
  }
  return output;
}
const name=stack=>plain(title(stack));
globalThis.HeritageItemText={configure,parse,decode,plain,title,name,tooltip,wrap,colors};
if(typeof module!=='undefined')module.exports=globalThis.HeritageItemText;
})();
