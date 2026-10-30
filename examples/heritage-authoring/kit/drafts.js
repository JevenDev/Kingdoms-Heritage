(() => {
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
class KitDrafts {
  constructor(saved,initial,createId=()=>crypto.randomUUID()) {
    this.createId=createId;this.entries=new Map();
    if(saved?.version===2&&Array.isArray(saved.kits)){
      for(const entry of saved.kits){
        if(typeof entry.id!=='string'||this.entries.has(entry.id)||typeof entry.state?.source!=='string'||!entry.state.document)throw new Error('Saved kits are invalid.');
        this.entries.set(entry.id,{state:copy(entry.state),history:[copy(entry.state)],historyIndex:0});
      }
      if(!this.entries.has(saved.active))throw new Error('The active saved kit is missing.');
      this.active=saved.active;
    }else{
      this.active=this.add(typeof saved?.source==='string'?saved:initial);
    }
  }
  add(state) {
    const id=this.createId();
    this.entries.set(id,{state:copy(state),history:[copy(state)],historyIndex:0});
    return id;
  }
  update(state) {this.entries.get(this.active).state=copy(state);}
  capture(state,history,historyIndex) {
    this.entries.set(this.active,{state:copy(state),history:copy(history),historyIndex});
  }
  get(id=this.active) {
    const entry=this.entries.get(id);
    if(!entry)throw new Error('This kit draft is unavailable.');
    return copy(entry);
  }
  select(id) {const entry=this.get(id);this.active=id;return entry;}
  serialize() {
    return {version:2,active:this.active,kits:[...this.entries].map(([id,entry])=>({id,state:copy(entry.state)}))};
  }
}
globalThis.HeritageKitDrafts=KitDrafts;
if(typeof module!=='undefined')module.exports=KitDrafts;
})();
