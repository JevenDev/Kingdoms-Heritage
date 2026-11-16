'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./markdown.js');
require('./content.js');

test('documentation links escape query parameters once and preserve inline code labels',()=>{
  assert.equal(M.inline('[`title_key` & **help**](kit-editor.html?kit=a&edit=details)'),'<a href="kit-editor.html?kit=a&amp;edit=details"><code>title_key</code> &amp; <strong>help</strong></a>');
  assert.equal(M.inline('![A & "B"](image.png?a=1&b=2)'),'<img loading="lazy" src="image.png?a=1&amp;b=2" alt="A &amp; &quot;B&quot;">');
  assert.equal(M.inline('`<tag>& [not a link](x)`'),'<code>&lt;tag&gt;&amp; [not a link](x)</code>');
});

test('documentation rendering retains stable anchors, tables, lists and code blocks',()=>{
  const html=M.render('## Same\r\n\r\n## Same\r\n\r\n| Field | Value |\r\n| --- | --- |\r\n| `foo` | **bar** |\r\n\r\n1. First\r\n2. Second\r\n\r\n~~~json\r\n{"text":"<tag>"}\r\n~~~');
  assert.match(html,/<h2 id="same">Same<\/h2>/);assert.match(html,/<h2 id="same-1">Same<\/h2>/);
  assert.match(html,/<td><code>foo<\/code><\/td><td><strong>bar<\/strong><\/td>/);
  assert.match(html,/<ol><li>First<\/li><li>Second<\/li><\/ol>/);
  assert.match(html,/data-language="json">\{&quot;text&quot;:&quot;&lt;tag&gt;&quot;\}/);
  assert.equal(M.inline('[translations](REFERENCE.md#custom-names-and-languages)'),'<a href="#/resources/custom-names-and-languages">translations</a>');
});

test('all documentation pages render without unresolved inline placeholders',()=>{
  for(const page of HeritageDocs.pages){const html=M.render(page.markdown);assert.ok(html.length,page.id);assert.doesNotMatch(html,/\u0000|undefined/,page.id);}
});
