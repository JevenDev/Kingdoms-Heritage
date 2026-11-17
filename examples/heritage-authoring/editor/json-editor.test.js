'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('shared JSON highlighting preserves source text and distinguishes keys and values',()=>{
  const node=()=>({children:[],append(...children){this.children.push(...children);}});
  const document={createDocumentFragment:node,createElement:node,createTextNode:text=>({textContent:text})};
  const context=vm.createContext({document});vm.runInContext(fs.readFileSync(require.resolve('./json-editor.js'),'utf8'),context);
  const source='{"key": "<tag>\\\"", "number": -1.25e+3, "flag": true, "empty": null}\n';
  const fragment=context.HeritageJsonEditor.highlight(source);
  assert.equal(fragment.children.map(child=>child.textContent).join(''),source);
  assert.deepEqual(Array.from(fragment.children.filter(child=>child.className),child=>[child.className,child.textContent]),[
    ['json-key','"key"'],['json-string','"<tag>\\\""'],['json-key','"number"'],['json-number','-1.25e+3'],['json-key','"flag"'],['json-literal','true'],['json-key','"empty"'],['json-literal','null']]);
});

test('line number resizing measures all lines before changing their heights',()=>{
  const JsonEditor=require('./json-editor.js'),events=[],editor=Object.create(JsonEditor.prototype);
  editor.field={clientWidth:240,scrollLeft:3,scrollTop:9};
  editor.highlight={style:{},children:[18,36,18].map((height,index)=>({getBoundingClientRect(){events.push('read '+index);return {height};}}))};
  const heights=[];editor.numbers={style:{},children:[0,1,2].map(index=>({style:{set height(value){events.push('write '+index);heights[index]=value;}}}))};
  editor.resize();assert.deepEqual(events,['read 0','read 1','read 2','write 0','write 1','write 2']);assert.deepEqual(heights,['18px','36px','18px']);
  assert.equal(editor.highlight.style.width,'240px');assert.equal(editor.highlight.style.transform,'translate(-3px,-9px)');assert.equal(editor.numbers.style.transform,'translateY(-9px)');
});
