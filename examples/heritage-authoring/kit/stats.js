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

function pursePreview(kit) {
  return Object.entries(splitPurse(coinTotal(purseCounts(kit)))).filter(([,count])=>count>0);
}

function setCoin(kit,coin,value) {
  const counts=Object.fromEntries(Object.entries(purseCounts(kit)).map(([name,count])=>[name,BigInt(count)]));
  counts[coin]=coinAmount(value||'0',[...pursePath,coin]);
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

const api={purseId,maxHealth,armor,operations,attributeId,normalize,validate,validatePurse,purseCounts,pursePreview,setCoin,modifier,setModifier};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageKitStats=api;
})();
