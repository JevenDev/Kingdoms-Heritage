(() => {
'use strict';
const E=HeritageEquipment,K=HeritageKit,$=id=>document.getElementById(id),modes=['player','curios','accessories'];
class EquipmentEditor {
  constructor({getDocument,getSelection,onSelect,onUpdate,notice,canSwitch}) {
    this.getDocument=getDocument;this.getSelection=getSelection;this.onSelect=onSelect;this.onUpdate=onUpdate;this.notice=notice;this.canSwitch=canSwitch;
    this.state={mode:'player',profiles:E.defaults(),cosmetics:{curios:false,accessories:false},offsets:{curios:0,accessories:0}};this.hadEquipment=false;
    for(const mode of modes){
      $('mode-'+mode).addEventListener('click',()=>this.switchMode(mode));
      $('mode-'+mode).addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();const next=modes[(modes.indexOf(mode)+(event.key==='ArrowRight'?1:2))%3];this.switchMode(next);$('mode-'+next).focus();
      });
    }
    $('show-cosmetics').addEventListener('change',()=>this.control({kind:'cosmetics'}));
    $('configure-slots').addEventListener('click',()=>{
      if(!this.canSwitch())return;
      this.editMode=this.state.mode;if(this.editMode==='player')return;
      this.editRows=E.profile(this.getDocument(),this.state.profiles,this.editMode).map(slot=>({...slot}));
      $('slot-layout-heading').textContent=(this.editMode==='curios'?'Curios':'Accessories')+' slot layout';
      this.drawRows();$('slot-layout-error').hidden=true;$('slot-layout-dialog').showModal();
    });
    $('close-slot-layout').addEventListener('click',()=>$('slot-layout-dialog').close());
    $('add-layout-slot').addEventListener('click',()=>{
      this.collectRows();let name='custom_slot',suffix=2;
      while(this.editRows.some(slot=>slot.name===name))name='custom_slot_'+suffix++;
      this.editRows.push({name,count:1,order:0,group:this.editMode==='accessories'?'unsorted':''});this.drawRows();
      $('slot-layout-rows').lastElementChild.querySelector('input').focus();
    });
    $('reset-slot-layout').addEventListener('click',()=>{this.editRows=E.defaults()[this.editMode];this.drawRows();});
    $('slot-layout-form').addEventListener('submit',event=>{
      event.preventDefault();this.collectRows();
      try{
        this.state.profiles[this.editMode]=E.validateProfile(this.editRows,this.editMode);this.state.offsets[this.editMode]=0;
        $('slot-layout-dialog').close();this.sync();this.onUpdate(true);this.notice('Slot layout saved.');
      }catch(failure){$('slot-layout-error').hidden=false;$('slot-layout-error').textContent=failure.message;}
    });
  }
  get options(){const mode=this.state.mode;return {mode,profiles:this.state.profiles,cosmetics:this.state.cosmetics[mode]??false,offset:this.state.offsets[mode]??0};}
  snapshot(){return K.copy(this.state);}
  restore(saved) {
    const state={mode:'player',profiles:E.defaults(),cosmetics:{curios:false,accessories:false},offsets:{curios:0,accessories:0}};
    if(saved){
      try{
        if(modes.includes(saved.mode))state.mode=saved.mode;
        for(const mode of ['curios','accessories']){
          if(saved.profiles?.[mode])state.profiles[mode]=E.validateProfile(saved.profiles[mode],mode);
          state.cosmetics[mode]=saved.cosmetics?.[mode]===true;
          state.offsets[mode]=Number.isInteger(saved.offsets?.[mode])?Math.max(0,saved.offsets[mode]):0;
        }
      }catch(failure){this.notice('Saved slot layout could not load. Choose Use mod defaults in Slot layout.');}
    }
    this.state=state;
    this.hadEquipment=!!saved&&Array.isArray(this.getDocument().items)&&this.getDocument().items.some(entry=>['curios','accessories'].includes(entry.inventory));
  }
  sync() {
    const document=this.getDocument(),entries=document.enabled===false?[]:document.items||[],first=entries.find(entry=>['curios','accessories'].includes(entry.inventory));
    if(first&&!this.hadEquipment&&this.state.mode==='player'){this.state.mode=first.inventory;this.state.cosmetics[first.inventory]=first.cosmetic??false;this.state.offsets[first.inventory]=E.reveal(document,this.state.profiles,E.id(first));}
    this.hadEquipment=!!first;
    for(const mode of ['curios','accessories']){
      const rows=this.state.profiles[mode],byName=new Map(rows.map(slot=>[slot.name,slot]));
      for(const slot of E.profile(document,this.state.profiles,mode)){
        const existing=byName.get(slot.name);
        if(existing)existing.count=Math.max(existing.count,slot.count);else rows.push(slot);
      }
    }
    const layout=E.layout(document,this.options);if(this.state.mode!=='player')this.state.offsets[this.state.mode]=layout.offset;
    this.reflect();return this.options;
  }
  reflect() {
    for(const mode of modes){$('mode-'+mode).setAttribute('aria-selected',String(mode===this.state.mode));$('mode-'+mode).tabIndex=mode===this.state.mode?0:-1;}
    const mode=this.state.mode;$('inventory').setAttribute('aria-labelledby','mode-'+mode);$('inventory').setAttribute('aria-label',(mode==='player'?'Vanilla':mode==='curios'?'Curios':'Accessories')+' inventory preview');
    $('equipment-view-controls').hidden=mode==='player';$('show-cosmetics').checked=this.state.cosmetics[mode]??false;
  }
  reveal(value) {
    const slot=E.address(value);if(slot.inventory==='player')return;
    this.state.mode=slot.inventory;
    if(slot.inventory==='curios'||slot.cosmetic)this.state.cosmetics[slot.inventory]=slot.cosmetic;
    if(!E.layout(this.getDocument(),this.options).slots.some(position=>position.id===value))this.state.offsets[slot.inventory]=E.reveal(this.getDocument(),this.state.profiles,value);
  }
  switchMode(mode) {
    if(!this.canSwitch())return;
    this.state.mode=mode;this.sync();
    const current=this.getSelection(),layout=E.layout(this.getDocument(),this.options),target=mode==='player'?0:layout.slots.find(slot=>slot.id===current&&slot.inventory===mode)?.id??layout.slots.find(slot=>slot.inventory===mode)?.id??0;
    this.onSelect(target);this.onUpdate();
  }
  control(control) {
    if(!control)return;
    if(!this.canSwitch()){$('show-cosmetics').checked=this.state.cosmetics[this.state.mode]??false;return;}
    const mode=this.state.mode;if(mode==='player')return;
    let target=this.getSelection(),slot=E.address(target);
    if(control.kind==='cosmetics'){
      this.state.cosmetics[mode]=!this.state.cosmetics[mode];
      if(slot.inventory===mode&&(mode==='curios'||slot.cosmetic))target=E.id({...slot,cosmetic:this.state.cosmetics[mode]});
    }else this.state.offsets[mode]=control.value;
    const layout=E.layout(this.getDocument(),this.options);
    if(!layout.slots.some(position=>position.id===target))target=layout.slots.find(position=>position.inventory===mode&&position.cosmetic===slot.cosmetic)?.id??layout.slots.find(position=>position.inventory===mode)?.id??0;
    this.onSelect(target);this.onUpdate();
  }
  collectRows() {
    this.editRows=[...$('slot-layout-rows').children].map(row=>({
      name:row.querySelector('[data-field=name]').value.trim(),
      count:Number(row.querySelector('[data-field=count]').value),
      order:Number(row.querySelector('[data-field=order]').value),
      group:this.editMode==='accessories'?row.querySelector('[data-field=group]').value.trim():''
    }));
  }
  drawRows() {
    const host=$('slot-layout-rows');host.replaceChildren();
    this.editRows.forEach((slot,index)=>{
      const row=document.createElement('div');row.className='slot-layout-row '+this.editMode;
      for(const [field,label,type] of [['name','Slot name','text'],['count','Count','number'],['order','Order','number'],...(this.editMode==='accessories'?[['group','Group','text']]:[])]){
        const wrapper=document.createElement('label');wrapper.textContent=label;if(field==='group')wrapper.className='layout-group';
        const input=document.createElement('input');input.type=type;input.dataset.field=field;input.value=slot[field]??'';input.spellcheck=false;
        if(type==='number')input.step=1;
        if(field==='count'){input.min=0;input.max=256;}
        if(type==='text')input.maxLength=128;
        wrapper.append(input);row.append(wrapper);
      }
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove slot type '+slot.name);
      remove.addEventListener('click',()=>{this.collectRows();this.editRows.splice(index,1);this.drawRows();});row.append(remove);host.append(row);
    });
  }
}
globalThis.HeritageEquipmentEditor=EquipmentEditor;
})();
