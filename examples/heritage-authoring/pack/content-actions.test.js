'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./assembler.js'),'utf8');
function setup({id='kit',builtin=false,missing=false,blocked=false}={}){
  const calls=[],nodes=new Map(),draft={id,name:'Starter'},entry={id:'location',kits:[id]},node={dataset:{contentKind:'kit',contentId:id},hasAttribute:()=>false,parentElement:{children:[]}};node.parentElement.children=[node];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},focus(){calls.push(['focus',id]);},click(){calls.push(['click',id]);},contentWindow:{postMessage(){}},contentDocument:{getElementById:get}});return nodes.get(id);};
  const context=vm.createContext({calls,$:get,URL,location:{href:'https://example.test/pack-assembler.html',origin:'https://example.test'},history:{replaceState(){}},state:{active:'location',locations:[entry]},projects:{active:'pack',projects:[{id:'pack'}]},catalog:{kits:missing?[]:[draft],intros:[]},P:{emptyKit:{id:'builtin-empty'}},W:{usage:()=>[]},kitDraft:()=>missing?null:draft,bundledKit:()=>builtin?draft:null,locationKitIds:()=>entry.kits,locationPart:'kits',closeEmbedded:()=>!blocked,pendingContentFocus:null,embeddedSession:null,
    openEmbedded(...args){calls.push(['open',...args]);context.embeddedSession={kind:'kit',id:args[1],token:'new-session',packId:'pack',locationId:'location'};},
    loadCatalog(){},discoverKits(){},renderKits(){},renderIntros(){},kitChoices(){},introOptions(){},renderPool(){},changed(){}});
  for(const [start,end] of [['function contentTarget(','function contentName('],['function contentMenuActions(','HeritageContentActions.create('],['function deleteContentKit(','async function copyContentDraft('],['function syncEmbedded(','function flushEmbedded(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);
  return {context,calls,node,action:()=>context.contentMenuActions(node).find(action=>action.label==='Delete kit…')};
}
test('kit context menu opens the existing confirmation for the clicked draft after its editor is ready',()=>{
  const {context,calls,action}=setup(),remove=action();assert.equal(remove.disabled,false);assert.equal(remove.destructive,true);remove.run();
  assert.deepEqual(calls,[['open','kit','kit',false,null,'kits',true]]);
  context.syncEmbedded({kind:'kit',id:'kit',valid:true});assert.equal(calls.filter(call=>call[0]==='click').length,1);assert.deepEqual(calls.at(-1),['click','delete-kit']);assert.equal(context.pendingContentFocus,null);
  context.syncEmbedded({kind:'kit',id:'kit',valid:true});assert.equal(calls.filter(call=>call[0]==='click').length,1);
});
test('built-in and missing kits cannot be deleted through the context menu',()=>{
  for(const options of [{builtin:true},{id:'builtin-empty'},{missing:true}])assert.equal(setup(options).action().disabled,true);
});
test('unsaved editor failures prevent opening a delete confirmation',()=>{
  const {context,calls,action}=setup({blocked:true});action().run();assert.deepEqual(calls,[]);assert.equal(context.pendingContentFocus,null);
});
test('a queued delete cannot activate in a different editor session',()=>{
  const {context,calls,action}=setup();action().run();context.embeddedSession.token='other-session';context.syncEmbedded({kind:'kit',id:'kit',valid:true});assert.equal(calls.some(call=>call[0]==='click'),false);
});
