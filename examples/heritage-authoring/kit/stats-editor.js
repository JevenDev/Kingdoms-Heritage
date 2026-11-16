(() => {
'use strict';

const stats=HeritageKitStats;

function make(tag,properties={},text='') {
  const node=Object.assign(document.createElement(tag),properties);
  if(text)node.textContent=text;
  return node;
}
function label(title,field) {
  const wrapper=make('label',{className:'stack'});
  wrapper.append(title,field);
  return wrapper;
}
function iconLabel(file,text) {
  const wrapper=make('span',{className:'kit-stat-label'});
  wrapper.append(make('img',{src:'kit/assets/'+file+'.png',alt:''}),text);
  return wrapper;
}
function operations(select) {
  for(const [id,label] of Object.entries(stats.operations))select.append(new Option(label,id));
  return select;
}

function create(host,{getKit,update}) {
  const $=name=>host.querySelector('#kit-stat-'+name);
  const starting=[[$('health'),'starting_health'],[$('hunger'),'starting_hunger']];
  const attributes=$('attributes'),builtins=$('builtins'),coins=$('coins'),add=$('add'),form=$('add-form');
  const name=$('id'),newAmount=$('new-amount'),newOperation=operations($('new-operation'));
  let customRows=new Map();

  for(const [field,key] of starting){
    field.addEventListener('change',()=>update(kit=>{
      if(field.value==='')delete kit[key];
      else kit[key]=Number(field.value);
    },field));
  }

  function modifierRow(id,key,title=null) {
    const row=make('div',{className:'kit-stat-modifier'});
    const amount=make('input',{id:'kit-stat-'+key+'-amount',type:'number',step:'any',placeholder:'0'});
    const operation=operations(make('select',{id:'kit-stat-'+key+'-operation'}));
    const updateModifier=field=>update(kit=>stats.setModifier(kit,id,amount.value,operation.value),field);
    const amountLabel=label(title??'Amount',amount);
    const opLabel=label('Operation',operation);
    operation.setAttribute('aria-label',(title?.textContent??id)+' operation');
    amount.addEventListener('change',()=>updateModifier(amount));
    operation.addEventListener('change',()=>updateModifier(operation));
    if(!title){
      amount.setAttribute('aria-label',id+' amount');
      const heading=make('code',{className:'kit-stat-id'},id);
      const remove=make('button',{type:'button',id:'kit-stat-'+key+'-remove'},'Remove');
      remove.setAttribute('aria-label','Remove '+id);
      remove.addEventListener('click',()=>{
        if(update(kit=>stats.setModifier(kit,id,''),remove))add.querySelector('summary').focus();
      });
      row.append(heading,amountLabel,opLabel,remove);
    }else row.append(amountLabel,opLabel);
    return {row,amount,operation,id};
  }
  const vanilla=[
    modifierRow(stats.armor,'armor',iconLabel('stats/armor','Armor bonus')),
    modifierRow(stats.maxHealth,'max-health',iconLabel('stats/health','Max health bonus'))
  ];
  for(const {row} of vanilla)builtins.append(row);

  const coinFields=new Map();
  for(const coin of ['gold','silver','bronze']){
    const title=coin[0].toUpperCase()+coin.slice(1),field=make('input',{id:'kit-stat-'+coin,type:'number',min:'0',step:'1'});
    const wrapper=make('div',{className:'kit-coin-field'});
    const decrement=make('button',{type:'button'},'−'),increment=make('button',{type:'button'},'+');
    const stepper=make('div',{className:'kit-coin-stepper'});
    const change=value=>update(kit=>stats.setCoin(kit,coin,value),field);
    const move=delta=>()=>{
      if(!field.validity.valid){field.reportValidity();return;}
      const current=BigInt(stats.purseCounts(getKit())[coin]);
      if(current+delta>=0n)change(String(current+delta));
    };
    const coinLabel=make('label',{htmlFor:field.id});
    coinLabel.append(iconLabel('numismatic/'+coin+'_coin',title));
    decrement.setAttribute('aria-label','Remove one '+coin+' coin');
    increment.setAttribute('aria-label','Add one '+coin+' coin');
    decrement.addEventListener('click',move(-1n));increment.addEventListener('click',move(1n));
    field.addEventListener('change',()=>change(field.value));
    stepper.append(decrement,field,increment);wrapper.append(coinLabel,stepper);coins.append(wrapper);
    coinFields.set(coin,{field,decrement});
  }

  name.addEventListener('input',()=>name.setCustomValidity(''));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const value=name.value.trim();
    if(!stats.attributeId.test(value)){
      name.setCustomValidity('Enter an attribute ID such as neoforge:swim_speed.');
      name.reportValidity();return;
    }
    const id=stats.normalize(value),kit=getKit();
    if(id===stats.armor||id===stats.maxHealth||stats.modifier(kit,id)){
      name.setCustomValidity('This attribute already has a control above.');
      name.reportValidity();return;
    }
    if(kit.attributes?.length>=32){
      name.setCustomValidity('A kit can have up to 32 attribute modifiers.');
      name.reportValidity();return;
    }
    if(update(next=>stats.setModifier(next,id,newAmount.value,newOperation.value),name)){
      reset();
      customRows.get(id)?.amount.focus();
    }
  });

  function reset() {
    name.setCustomValidity('');form.reset();add.open=false;
  }

  function render(kit,invalid) {
    if(invalid||kit.enabled===false)kit={};
    for(const [field,key] of starting)field.value=kit[key]??'';
    const counts=stats.purseCounts(kit);
    for(const [coin,{field}] of coinFields)field.value=counts[coin];

    const custom=(kit.attributes??[]).map(entry=>stats.normalize(entry.attribute))
      .filter(id=>id!==stats.armor&&id!==stats.maxHealth);
    if(custom.join('\n')!==[...customRows.keys()].join('\n')){
      customRows=new Map(custom.map(id=>[id,modifierRow(id,'attribute-'+id)]));
      attributes.replaceChildren(...[...customRows.values()].map(entry=>entry.row));
    }
    for(const {id,amount,operation} of [...vanilla,...customRows.values()]){
      const value=stats.modifier(kit,id);
      amount.value=value?.amount??'';
      operation.value=value?.operation??'add_value';
    }
  }

  function lock(locked,invalid,target) {
    $('json-error').hidden=!invalid;
    for(const control of host.querySelectorAll('input,select,button')){
      control.disabled=locked;
      if(control.id)control.setAttribute('aria-invalid',String(control.id===target));
    }
    for(const {field,decrement} of coinFields.values())decrement.disabled=locked||field.value==='0';
    for(const {amount,operation} of vanilla)operation.disabled=locked||amount.value==='';
  }
  return {render,lock,reset};
}

globalThis.HeritageKitStatsEditor={create};
})();
