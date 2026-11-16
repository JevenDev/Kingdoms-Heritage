(() => {
'use strict';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const slug=value=>value.toLowerCase().replaceAll("'",'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const routes={'README.md':'getting-started','REFERENCE.md':'spawns'};
const sectionRoutes={'replace-or-remove-bundled-options':'overrides','custom-names-and-languages':'resources','card-images':'resources','safe-templates':'examples','whats-included':'examples','useful-commands':'commands','troubleshooting':'troubleshooting'};
function url(value) {
  const [file,anchor]=value.split('#');
  if(routes[file])return '#/'+(sectionRoutes[anchor]||routes[file])+(anchor?'/'+anchor:'');
  return value;
}
function inline(source) {
  const saved=[];
  const text=source.replace(/`([^`]+)`|(!?)\[([^\]]*)\]\(([^)]+)\)/g,(_,code,image,label,href)=>{
    const html=code!==undefined?'<code>'+escape(code)+'</code>':image
      ?'<img loading="lazy" src="'+escape(url(href))+'" alt="'+escape(label)+'">'
      :'<a href="'+escape(url(href))+'">'+inline(label)+'</a>';
    saved.push(html);return '\u0000'+(saved.length-1)+'\u0000';
  });
  return escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\u0000(\d+)\u0000/g,(_,index)=>saved[Number(index)]);
}
function markdown(source) {
  const lines=source.replaceAll('\r\n','\n').split('\n'),html=[],ids=new Map();
  const boundary=line=>/^#{1,6} |^~~~|^\x60{3}|^\| |^[-*] |^\d+\. /.test(line);
  for(let i=0;i<lines.length;) {
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^(~~~|\x60{3})/.test(line)) {
      const fence=line.slice(0,3),language=line.slice(3).trim(),code=[];
      while(++i<lines.length&&!lines[i].startsWith(fence))code.push(lines[i]);
      i++;
      html.push('<div class="code-block"><div class="code-toolbar"><span>'+escape(language||'text')+'</span><button type="button" class="copy-code">Copy</button></div><pre><code data-language="'+escape(language)+'">'+escape(code.join('\n'))+'</code></pre></div>');
    } else if(/^#{1,6} /.test(line)) {
      const level=line.indexOf(' '),title=line.slice(level+1),base=slug(title),count=ids.get(base)||0,id=base+(count?'-'+count:'');
      ids.set(base,count+1);
      html.push('<h'+level+' id="'+id+'">'+inline(title)+'</h'+level+'>');i++;
    } else if(line.startsWith('|')) {
      const rows=[];
      while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++].replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim()));
      html.push('<div class="table-scroll"><table><thead><tr>'+rows[0].map(cell=>'<th scope="col">'+inline(cell)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(2).map(row=>'<tr>'+row.map(cell=>'<td>'+inline(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
    } else if(/^[-*] |^\d+\. /.test(line)) {
      const ordered=/^\d/.test(line),items=[];
      while(i<lines.length&&(ordered?/^\d+\. /:/^[-*] /).test(lines[i]))items.push(lines[i++].replace(/^([-*]|\d+\.) /,''));
      html.push((ordered?'<ol>':'<ul>')+items.map(item=>'<li>'+inline(item)+'</li>').join('')+(ordered?'</ol>':'</ul>'));
    } else {
      const paragraph=[line];i++;
      while(i<lines.length&&lines[i].trim()&&!boundary(lines[i]))paragraph.push(lines[i++]);
      html.push('<p>'+inline(paragraph.join(' '))+'</p>');
    }
  }
  return html.join('\n');
}
const api={escape,inline,render:markdown};
if(typeof module!=='undefined')module.exports=api;
else globalThis.HeritageMarkdown=api;
})();
