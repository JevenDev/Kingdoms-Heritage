(() => {
'use strict';
function valueRanges(source) {
  const offset=/^\s*"intro"\s*:/.test(source)?1:0,input=offset?'{'+source+'}':source;
  const tokens=[...input.matchAll(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[^\s]/g)],ranges=new Map();
  let index=0;
  const fail=(position=tokens[index]?.index??input.length)=>{throw Object.assign(new Error('Invalid JSON'),{position:Math.max(0,position-offset)});};
  const take=token=>{if(tokens[index]?.[0]!==token)fail();index++;};
  function value(path) {
    const first=tokens[index++];if(!first)fail();
    if(first[0]==='{') {
      if(tokens[index]?.[0]!=='}')while(true) {
        const key=tokens[index];if(!key?.[0].startsWith('"'))fail();
        let name;try{name=JSON.parse(key[0]);}catch(error){fail(key.index);}
        index++;take(':');value([...path,name]);
        if(tokens[index]?.[0]!==',')break;
        index++;
      }
      take('}');
    } else if(first[0]==='[') {
      let child=0;
      if(tokens[index]?.[0]!==']')while(true) {
        value([...path,child++]);
        if(tokens[index]?.[0]!==',')break;
        index++;
      }
      take(']');
    } else {
      try{JSON.parse(first[0]);}catch(error){
        const position=/position (\d+)/i.exec(error.message);fail(first.index+(position?Number(position[1]):0));
      }
    }
    const last=tokens[index-1];
    ranges.set(JSON.stringify(path),[Math.max(0,first.index-offset),Math.min(source.length,last.index+last[0].length-offset)]);
  }
  value([]);if(index<tokens.length)fail();return ranges;
}
function errorRange(source,error) {
  if(!error)return null;
  try {
    const ranges=valueRanges(source),path=[...(error.path??[])];
    while(path.length&&!ranges.has(JSON.stringify(path)))path.pop();
    const range=ranges.get(JSON.stringify(path))??[0,1];
    return path.length===(error.path??[]).length?range:[range[0],range[0]+1];
  } catch(syntax) {
    let start=syntax.position??source.length;
    start=Math.max(0,Math.min(start,Math.max(0,source.length-1)));
    return [start,start+1];
  }
}
class JsonEditor {
  constructor(field,lineCount) {
    this.field=field;this.lineCount=lineCount;this.source=null;this.error=null;
    this.container=field.closest('.code-editor');
    this.highlight=this.container.querySelector('.code-highlight');
    this.numbers=this.container.querySelector('.code-line-numbers');
    field.addEventListener('input',()=>this.sync());
    field.addEventListener('scroll',()=>this.syncScroll());
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(field);
    document.fonts.ready.then(()=>this.resize());
  }
  setError(error) {
    this.error=error;this.sync();this.markError();return this.location;
  }
  markError() {
    const range=errorRange(this.field.value,this.error);
    this.location=null;let offset=0;
    [...this.highlight.children].forEach((row,index)=>{
      const length=row.textContent.length,invalid=!!range&&range[0]<=offset+length&&range[1]>offset;
      row.classList.toggle('json-line-error',invalid);
      this.numbers.children[index].classList.toggle('json-line-error',invalid);
      row.title=invalid?this.error.message:'';
      if(invalid&&!this.location)this.location={line:index+1,column:Math.max(1,range[0]-offset+1)};
      let column=offset;
      for(const token of [...row.childNodes]){
        const text=token.textContent,end=column+text.length,marked=!!range&&column<range[1]&&end>range[0];
        if(token.nodeType===1)token.classList.toggle('json-error-token',marked);
        else if(marked){
          const start=Math.max(0,range[0]-column),finish=Math.min(text.length,range[1]-column),span=document.createElement('span');
          span.className='json-error-token';span.textContent=text.slice(start,finish);
          token.replaceWith(document.createTextNode(text.slice(0,start)),span,document.createTextNode(text.slice(finish)));
        }
        column=end;
      }
      offset+=length+1;
    });
    if(this.location)this.field.dataset.errorLine=this.location.line;
    else delete this.field.dataset.errorLine;
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
    this.container.classList.add('ready');this.resize();this.markError();
  }
}
globalThis.HeritageJsonEditor=JsonEditor;
})();
