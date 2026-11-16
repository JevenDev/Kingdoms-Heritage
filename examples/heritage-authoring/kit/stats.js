(() => {
'use strict';

const purseId='numismaticoverhaul:purse';
const pursePath=['starting_resources',purseId];
const maxBalance=9_223_372_036_854_775_807n;
const denominations={gold:10_000n,silver:100n,bronze:1n};
const maxHealth='minecraft:generic.max_health',armor='minecraft:generic.armor';
const operations={
  add_value:'Add value',
  add_multiplied_base:'Multiply base',
  add_multiplied_total:'Multiply total'
};
const attributeId=/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/;
const normalize=id=>id.includes(':')?id:'minecraft:'+id;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const issue=(message,path)=>Object.assign(new Error(message),{path});

let itemAttributes={},itemDurability={};
function configure(attributes,durability={}){itemAttributes=attributes;itemDurability=durability;}
function durability(stack){
  const parts=stack.components??{},maximum=parts['!minecraft:max_damage']!==undefined?0:parts['minecraft:max_damage']??itemDurability[normalize(stack.id)]??0,damage=parts['minecraft:damage']??0;
  if(parts['minecraft:unbreakable']!==undefined||!Number.isFinite(maximum)||maximum<=0||!Number.isFinite(damage)||damage<=0)return null;
  return {maximum,remaining:Math.max(0,maximum-damage),width:Math.max(0,Math.round(13-damage*13/maximum)),hue:Math.max(0,1-damage/maximum)*120};
}
function equipmentModifiers(stack){
  const component=stack.components?.['minecraft:attribute_modifiers'];
  if(stack.components?.['!minecraft:attribute_modifiers']!==undefined)return [];
  const values=component===undefined?itemAttributes[normalize(stack.id)]:Array.isArray(component)?component:component?.modifiers;
  return Array.isArray(values)?values.filter(value=>value&&typeof value.type==='string'&&typeof value.id==='string'&&Number.isFinite(value.amount)):[];
}
function matchesSlot(group,slot){
  return group===undefined||group==='any'||group===slot||group==='hand'&&['mainhand','offhand'].includes(slot)||group==='armor'&&['feet','legs','chest','head'].includes(slot);
}
function project(base,modifiers,min,max){
  let added=base;
  for(const value of modifiers)if((value.operation??'add_value')==='add_value')added+=value.amount;
  let result=added;
  for(const value of modifiers)if(value.operation==='add_multiplied_base')result+=added*value.amount;
  for(const value of modifiers)if(value.operation==='add_multiplied_total')result*=1+value.amount;
  return Number.isNaN(result)?min:Math.min(max,Math.max(min,result));
}
function preview(kit){
  if(kit.enabled===false)kit={};
  const modifiers=new Map(),unknown=[];
  const add=(type,value)=>{if(typeof type!=='string'||typeof value.id!=='string'||!Number.isFinite(value.amount))return;type=normalize(type);if(!modifiers.has(type))modifiers.set(type,new Map());modifiers.get(type).set(normalize(value.id),value);};
  const order=[kit.selected_slot??0,40,36,37,38,39];
  for(const entry of [...(kit.items??[])].sort((a,b)=>order.indexOf(a.index)-order.indexOf(b.index))){
    if((entry.inventory??'player')!=='player'){if(!entry.cosmetic)unknown.push(entry.item.id);continue;}
    const slot=entry.index===(kit.selected_slot??0)?'mainhand':({36:'feet',37:'legs',38:'chest',39:'head',40:'offhand'})[entry.index];
    if(!slot)continue;
    const stack=entry.item,id=normalize(stack.id);
    if(!id.startsWith('minecraft:')&&stack.components?.['minecraft:attribute_modifiers']===undefined)unknown.push(id);
    for(const value of equipmentModifiers(stack))if(matchesSlot(value.slot,slot))add(value.type,value);
  }
  const bonuses=Array.isArray(kit.attributes)?kit.attributes.filter(bonus=>typeof bonus?.attribute==='string'&&Number.isFinite(bonus.amount)):[];
  for(const bonus of bonuses)add(bonus.attribute,{...bonus,id:'kingdomsheritage:starting_kit'});
  const values=id=>[...(modifiers.get(id)?.values()??[])],maximum=Math.fround(project(20,values(maxHealth),1,1024));
  return {armor:Math.floor(project(0,values(armor),0,30)),health:Math.min(maximum,Number.isFinite(kit.starting_health)?Math.fround(kit.starting_health):20),maxHealth:maximum,hunger:kit.starting_hunger??20,bonuses:bonuses.filter(bonus=>![armor,maxHealth].includes(normalize(bonus.attribute))),unknown};
}
const number=value=>Math.abs(value)>=1_000_000?value.toExponential(1):String(Number(value.toFixed(2)));

function validate(kit) {
  const {starting_health:health,starting_hunger:hunger,attributes}=kit;
  if(health!==undefined&&(!Number.isFinite(health)||health<1||health>3.4028234663852886e38)){
    throw issue('Starting health must be at least 1 point and within the Minecraft health range.',['starting_health']);
  }
  if(hunger!==undefined&&(!Number.isInteger(hunger)||hunger<0||hunger>20)){
    throw issue('Starting hunger must be a whole number from 0 to 20.',['starting_hunger']);
  }
  if(attributes===undefined)return;
  if(!Array.isArray(attributes)||attributes.length>32)throw issue('A kit can have up to 32 attribute modifiers.',['attributes']);
  const seen=new Set();
  for(const [index,entry] of attributes.entries()){
    const path=['attributes',index];
    if(!object(entry))throw issue('An attribute modifier must be an object.',path);
    const {attribute,amount,operation}=entry;
    if(typeof attribute!=='string'||!attributeId.test(attribute))throw issue('Enter a valid attribute ID.',[...path,'attribute']);
    const id=normalize(attribute);
    if(seen.has(id))throw issue('Each attribute can only be added once.',[...path,'attribute']);
    seen.add(id);
    if(!Number.isFinite(amount))throw issue('Enter a finite modifier amount.',[...path,'amount']);
    if(operation!==undefined&&(typeof operation!=='string'||!Object.hasOwn(operations,operation))){
      throw issue('Choose a valid Minecraft attribute operation.',[...path,'operation']);
    }
  }
}

function coinAmount(literal,path) {
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(literal);
  const invalid=()=>issue('Enter a non-negative whole number of coins within the 64-bit range.',path);
  if(!match)throw invalid();
  const [,sign,integer,fraction='',exponent='0']=match,digits=(integer+fraction).replace(/^0+/,'');
  if(!digits)return 0n;
  const places=Number(exponent)-fraction.length,length=digits.length+places;
  if(sign||length<1||length>19||places<0&&/[1-9]/.test(digits.slice(length)))throw invalid();
  const amount=BigInt(places<0?digits.slice(0,length):digits+'0'.repeat(places));
  if(amount>maxBalance)throw invalid();
  return amount;
}

function splitPurse(total) {
  return {gold:Number(total/denominations.gold),silver:Number(total/denominations.silver%100n),bronze:Number(total%100n)};
}

function coinTotal(counts) {
  let total=0n;
  for(const [coin,amount] of Object.entries(counts)){
    if(!Object.hasOwn(denominations,coin))throw issue('Unknown purse denomination '+coin+'.',[...pursePath,coin]);
    total+=BigInt(amount)*denominations[coin];
  }
  if(total>maxBalance)throw issue('The purse balance exceeds the 64-bit currency limit.',pursePath);
  return total;
}

function validatePurse(kit,literal) {
  const resources=kit.starting_resources;
  if(resources===undefined)return;
  if(!object(resources))throw issue('Starting resources must be an object.',['starting_resources']);
  for(const [id,value] of Object.entries(resources)){
    if(id!==purseId)throw issue('Unknown starting resource '+id+'.',['starting_resources',id]);
    const readAmount=(number,path)=>{
      if(typeof number!=='number')throw issue('Enter a non-negative whole number of coins.',path);
      return coinAmount(literal(path),path);
    };
    if(object(value)){
      const counts=Object.fromEntries(Object.entries(value).map(([coin,count])=>[coin,readAmount(count,[...pursePath,coin])]));
      const total=coinTotal(counts);
      if(Object.values(value).some(count=>!Number.isSafeInteger(count)))resources[id]=splitPurse(total);
    }else{
      const total=readAmount(value,pursePath);
      if(!Number.isSafeInteger(value))resources[id]=splitPurse(total);
    }
  }
}

function purseCounts(kit) {
  const value=kit.starting_resources?.[purseId];
  return object(value)?{gold:value.gold??0,silver:value.silver??0,bronze:value.bronze??0}:splitPurse(BigInt(value??0));
}

const purseBalance=kit=>coinTotal(purseCounts(kit));
const coinId=coin=>'numismaticoverhaul:'+coin+'_coin';

function pursePreview(kit) {
  if(kit.enabled===false)return [];
  return Object.entries(splitPurse(purseBalance(kit)))
    .filter(([,count])=>count>0)
    .map(([coin,count])=>[coin,Math.min(count,2_147_483_647)]);
}

function setCoin(kit,coin,value) {
  const counts=Object.fromEntries(Object.entries(purseCounts(kit)).map(([name,count])=>[name,BigInt(count)]));
  counts[coin]=coinAmount(value||'0',[...pursePath,coin]);
  writePurse(kit,counts);
}

function setPurseBalance(kit,balance) {
  writePurse(kit,splitPurse(balance));
}

function writePurse(kit,counts) {
  const total=coinTotal(counts),resources=kit.starting_resources??{};
  if(total===0n)delete resources[purseId];
  else resources[purseId]=Object.values(counts).some(count=>count>BigInt(Number.MAX_SAFE_INTEGER))?splitPurse(total):
    Object.fromEntries(Object.entries(counts).filter(([,count])=>count>0n).map(([name,count])=>[name,Number(count)]));
  if(Object.keys(resources).length)kit.starting_resources=resources;
  else delete kit.starting_resources;
}

function modifier(kit,id) {
  return kit.attributes?.find(entry=>normalize(entry.attribute)===id);
}

function setModifier(kit,id,amount,operation) {
  const entries=kit.attributes??[];
  const index=entries.findIndex(entry=>normalize(entry.attribute)===id);
  if(amount===''){
    if(index>=0)entries.splice(index,1);
  }else{
    const previous=entries[index];
    const entry={...previous,attribute:previous?.attribute??id,amount:Number(amount)};
    if(operation!==undefined)entry.operation=operation;
    if(index<0)entries.push(entry);
    else entries[index]=entry;
  }
  if(entries.length)kit.attributes=entries;
  else delete kit.attributes;
}

const api={configure,durability,equipmentModifiers,matchesSlot,project,preview,number,purseId,maxHealth,armor,operations,attributeId,normalize,validate,validatePurse,purseCounts,pursePreview,purseBalance,denominations,coinId,coinTotal,splitPurse,setPurseBalance,setCoin,modifier,setModifier};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageKitStats=api;
})();
