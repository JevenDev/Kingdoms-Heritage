(() => {
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
class Drafts {
  constructor(saved,initial,createId=()=>crypto.randomUUID(),collection='kits') {
    this.collection=collection;this.createId=createId;this.entries=new Map();
    if(saved?.version===2&&Array.isArray(saved[collection])){
      for(const entry of saved[collection]){
        if(typeof entry.id!=='string'||this.entries.has(entry.id)||typeof entry.state?.source!=='string'||!entry.state.document)throw new Error('Saved drafts are invalid.');
        this.entries.set(entry.id,{state:copy(entry.state),history:[copy(entry.state)],historyIndex:0});
      }
      if(!this.entries.has(saved.active))throw new Error('The active saved draft is missing.');
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
    if(!entry)throw new Error('This draft is unavailable.');
    return copy(entry);
  }
  select(id) {const entry=this.get(id);this.active=id;return entry;}
  serialize() {
    return {version:2,active:this.active,[this.collection]:[...this.entries].map(([id,entry])=>({id,state:copy(entry.state)}))};
  }
}
globalThis.HeritageDrafts=globalThis.HeritageKitDrafts=Drafts;
if(typeof module!=='undefined')module.exports=Drafts;
})();
