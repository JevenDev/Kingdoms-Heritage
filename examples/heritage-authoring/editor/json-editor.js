(() => {
'use strict';
class JsonEditor {
  constructor(field,lineCount) {
    this.field=field;this.lineCount=lineCount;this.source=null;
    this.container=field.closest('.code-editor');
    this.highlight=this.container.querySelector('.code-highlight');
    this.numbers=this.container.querySelector('.code-line-numbers');
    field.addEventListener('input',()=>this.sync());
    field.addEventListener('scroll',()=>this.syncScroll());
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(field);
    document.fonts.ready.then(()=>this.resize());
  }
  syncScroll() {
    this.highlight.style.transform='translate('+(-this.field.scrollLeft)+'px,'+(-this.field.scrollTop)+'px)';
    this.numbers.style.transform='translateY('+(-this.field.scrollTop)+'px)';
  }
  resize() {
    this.highlight.style.width=this.field.clientWidth+'px';
    const lines=this.highlight.children,numbers=this.numbers.children;
    for(let i=0;i<lines.length;i++)numbers[i].style.height=lines[i].getBoundingClientRect().height+'px';
    this.syncScroll();
  }
  sync() {
    const source=this.field.value;if(source===this.source)return;
    this.source=source;
    const fragment=document.createDocumentFragment(),lines=source.split('\n');
    const tokens=/"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    for(const line of lines){
      const row=document.createElement('div');row.className='json-line';
      let end=0;
      for(const match of line.matchAll(tokens)){
        row.append(document.createTextNode(line.slice(end,match.index)));
        const span=document.createElement('span'),token=match[0];
        span.className=token.startsWith('"')?(/^\s*:/.test(line.slice(match.index+token.length))?'json-key':'json-string'):/^(true|false|null)$/.test(token)?'json-literal':'json-number';
        span.textContent=token;row.append(span);end=match.index+token.length;
      }
      row.append(document.createTextNode(line.slice(end)));fragment.append(row);
    }
    this.highlight.replaceChildren(fragment);
    this.numbers.replaceChildren(...lines.map((_,index)=>{
      const number=document.createElement('span');number.textContent=index+1;return number;
    }));
    this.lineCount.textContent=lines.length+' line'+(lines.length===1?'':'s');
    this.container.classList.add('ready');this.resize();
  }
}
globalThis.HeritageJsonEditor=JsonEditor;
})();
