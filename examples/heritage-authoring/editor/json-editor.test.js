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
