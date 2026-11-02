(() => {
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value)),object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),id=/^(?:[a-z0-9_.-]+:)?[a-z0-9/._-]+$/;
const component={damage:'minecraft:damage',max_damage:'minecraft:max_damage',max_stack_size:'minecraft:max_stack_size',unbreakable:'minecraft:unbreakable',rarity:'minecraft:rarity',glint:'minecraft:enchantment_glint_override'};
function levels(components,key){
  const value=components[key];if(value===undefined)return {};
  if(!object(value))throw new Error('Edit the '+key+' component in JSON before using these controls.');
  const result=Object.hasOwn(value,'levels')?value.levels:value;if(!object(result))throw new Error('Enchantment levels must be an object.');
  for(const [name,level] of Object.entries(result))if(!id.test(name)||!Number.isInteger(level)||level<0||level>255)throw new Error('Enchantment levels must be whole numbers from 0 to 255 with resource IDs.');
  return copy(result);
}
function validate(components,defaultMaximum=1){
  if(!object(components))throw new Error('Item components must be an object.');
  for(const [key,min,max] of [['damage',0,2147483647],['max_damage',1,2147483647],['max_stack_size',1,99]]){
    const value=components[component[key]];if(value!==undefined&&(!Number.isInteger(value)||value<min||value>max))throw new Error(key.replaceAll('_',' ')+' must be a whole number from '+min+' to '+max+'.');
  }
  if(components[component.max_damage]!==undefined&&(components[component.max_stack_size]??defaultMaximum)>1)throw new Error('Durable items need a maximum stack size of 1.');
  if(components[component.unbreakable]!==undefined&&!object(components[component.unbreakable]))throw new Error('The unbreakable component must be an object.');
  if(components[component.rarity]!==undefined&&!['common','uncommon','rare','epic'].includes(components[component.rarity]))throw new Error('Choose a valid rarity.');
  if(components[component.glint]!==undefined&&typeof components[component.glint]!=='boolean')throw new Error('Glint must be true or false.');
  levels(components,'minecraft:enchantments');levels(components,'minecraft:stored_enchantments');return components;
}
function update(components,key,value){
  if(!object(components))throw new Error('Item components must be an object.');const result=copy(components),name=component[key];if(!name)throw new Error('Unknown item property.');
  if(value===''||value===null||key==='unbreakable'&&value===false)delete result[name];
  else{result[name]=key==='unbreakable'?{...(object(result[name])?result[name]:{})}:['damage','max_damage','max_stack_size'].includes(key)?Number(value):value;delete result['!'+name];}
  return result;
}
function enchant(components,key,rows){
  if(!['minecraft:enchantments','minecraft:stored_enchantments'].includes(key))throw new Error('Unknown enchantment component.');
  const result=copy(components),next={};
  for(const row of rows){if(!id.test(row.id))throw new Error('Enter an enchantment resource ID.');const name=row.id.includes(':')?row.id:'minecraft:'+row.id;if(Object.hasOwn(next,name))throw new Error('Choose each enchantment only once.');if(!Number.isInteger(row.level)||row.level<0||row.level>255)throw new Error('Enchantment levels must be whole numbers from 0 to 255.');next[name]=row.level;}
  const current=result[key];if(!rows.length&&current===undefined)return result;
  result[key]=object(current)&&!Object.hasOwn(current,'levels')?next:{...(object(current)?current:{}),levels:next};delete result['!'+key];return result;
}
function create(host,config){
  const section=document.createElement('details');section.id='item-properties';section.className='item-properties';
  const summary=document.createElement('summary');summary.textContent='Item properties';const grid=document.createElement('div');grid.className='item-property-grid';section.append(summary,grid);
  const fields=new Map();
  for(const [key,label,min,max] of [['damage','Damage used',0,2147483647],['max_damage','Maximum durability',1,2147483647],['max_stack_size','Maximum stack size',1,99],['rarity','Rarity'],['glint','Enchantment glint']]){
    const wrapper=document.createElement('label'),field=document.createElement(min!==undefined?'input':'select');wrapper.className='stack';wrapper.textContent=label;field.id='property-'+key;field.dataset.itemProperty=key;
    if(min!==undefined){field.type='number';field.min=min;field.max=max;field.step=1;field.placeholder='Item default';}else{for(const [value,text] of key==='rarity'?[['','Item default'],['common','Common'],['uncommon','Uncommon'],['rare','Rare'],['epic','Epic']]:[['','Item default'],['true','On'],['false','Off']])field.append(new Option(text,value));}
    wrapper.append(field);grid.append(wrapper);fields.set(key,field);
  }
  const unbreakable=document.createElement('label'),check=document.createElement('input');unbreakable.className='check';check.type='checkbox';check.dataset.itemProperty='unbreakable';check.id='property-unbreakable';unbreakable.append(check,document.createTextNode('Unbreakable'));grid.append(unbreakable);fields.set('unbreakable',check);
  const enchantmentLabel=document.createElement('label'),type=document.createElement('select');enchantmentLabel.className='stack';enchantmentLabel.textContent='Enchantments';type.id='property-enchantment-type';type.append(new Option('Item enchantments','minecraft:enchantments'),new Option('Stored enchantments (books)','minecraft:stored_enchantments'));enchantmentLabel.append(type);
  const rows=document.createElement('div'),list=document.createElement('datalist'),actions=document.createElement('div'),add=document.createElement('button'),apply=document.createElement('button'),status=document.createElement('p');rows.id='property-enchantments';list.id='enchantment-choices';actions.className='property-actions';add.type=apply.type='button';add.id='add-enchantment';add.textContent='Add enchantment';apply.id='apply-properties';apply.textContent='Apply properties';status.id='property-status';status.className='hint';status.setAttribute('role','status');actions.append(add,apply);section.append(enchantmentLabel,rows,list,actions,status);host.before(section);
  let locked=false,invalid=false,rendered='',slot=null;
  function form(){return {values:Object.fromEntries([...fields].map(([key,field])=>[key,field.type==='checkbox'?field.checked:field.value])),type:type.value,rows:[...rows.children].map(row=>({id:row.querySelector('[data-enchantment-id]').value,level:row.querySelector('[data-enchantment-level]').value})),invalid:!![...fields.values(),...rows.querySelectorAll('input')].find(field=>field.validity?.badInput)};}
  function row(value={id:'',level:'1'}){
    const wrapper=document.createElement('div'),name=document.createElement('input'),level=document.createElement('input'),remove=document.createElement('button');wrapper.className='enchantment-row';name.dataset.enchantmentId='';name.setAttribute('list',list.id);name.setAttribute('aria-label','Enchantment ID');name.placeholder='minecraft:sharpness';name.value=value.id;level.dataset.enchantmentLevel='';level.type='number';level.min='0';level.max='255';level.step='1';level.value=value.level;level.setAttribute('aria-label','Enchantment level');remove.type='button';remove.dataset.removeEnchantment='';remove.textContent='Remove';wrapper.append(name,level,remove);rows.append(wrapper);
  }
  function controls(){for(const control of section.querySelectorAll('input,select,button'))control.disabled=locked||invalid;}
  function refresh(stack,draft,disabled,selected){
    locked=disabled;const source=draft?.components??JSON.stringify(stack?.components??{}),pending=draft?.properties,key=JSON.stringify([source,pending,type.value,selected]);
    if(key!==rendered){
      slot=selected;rendered=key;invalid=false;
      try{
        const components=JSON.parse(source);validate(components,config.maximum());for(const [key,field] of fields){const value=components[component[key]];if(field.type==='checkbox')field.checked=value!==undefined;else field.value=value===undefined?'':String(value);}
        rows.replaceChildren();for(const [id,level] of Object.entries(levels(components,type.value)))row({id,level});
        if(pending){for(const [key,value] of Object.entries(pending.values??{})){const field=fields.get(key);if(field.type==='checkbox')field.checked=value;else field.value=value;}type.value=pending.type;rows.replaceChildren();pending.rows.forEach(row);}
        status.textContent=pending?.message??(draft?'Apply properties to update this item.':'Changes are kept as pending edits until applied.');
      }catch(error){invalid=true;status.textContent=error.message;}
    }
    if(!list.options.length)for(const entry of config.enchantments()){const option=new Option(entry.name,entry.id);list.append(option);}
    controls();
  }
  function draftChange(event){
    if(locked||invalid)return;const snapshot=form();
    try{
      if(snapshot.invalid)throw new Error('Enter valid whole numbers for the highlighted property.');
      let components=JSON.parse(config.components());for(const [key,value] of Object.entries(snapshot.values))components=update(components,key,key==='glint'?(value===''?'':value==='true'):value);
      components=enchant(components,type.value,snapshot.rows.map(entry=>({id:entry.id.trim(),level:entry.level.trim()===''?NaN:Number(entry.level)})));validate(components,config.maximum());
      config.draft(JSON.stringify(components,null,2),null);status.textContent='Apply properties to update this item.';
    }catch(error){snapshot.message=error.message;config.draft(config.components(),snapshot);status.textContent=error.message;}
  }
  grid.addEventListener('input',draftChange);rows.addEventListener('input',draftChange);
  add.addEventListener('click',()=>{row();draftChange();rows.lastElementChild.querySelector('input').focus();});
  rows.addEventListener('click',event=>{const remove=event.target.closest('[data-remove-enchantment]');if(remove){remove.parentElement.remove();draftChange();}});
  type.addEventListener('change',()=>{rendered='';config.refresh();});apply.addEventListener('click',()=>{if(!locked)config.apply();});
  return {refresh,setLocked:value=>{locked=value;controls();},element:section};
}
const api={levels,validate,update,enchant,create};if(typeof module!=='undefined')module.exports=api;else globalThis.HeritageItemProperties=api;
})();
