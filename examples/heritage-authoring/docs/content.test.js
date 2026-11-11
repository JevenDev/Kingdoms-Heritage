'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../editor/engine.js');
const Pack = require('../pack/engine.js');
require('../kit/catalog.js');
const Kit = require('../kit/engine.js');
require('./content.js');

const root = path.join(__dirname, '..');
const pages = new Map(HeritageDocs.pages.map(page => [page.id, page]));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const blocks = markdown => [...markdown.matchAll(/~~~json\n([\s\S]*?)\n~~~/g)].map(match => JSON.parse(match[1]));
const spawnPath = name => 'heritage-example-data/data/heritage_example/heritage/spawns/' + name + '.json';
const names = {
  player: 'Sam', kit: 'Farmer', spawn: 'Home', biome: 'Plains', structure: 'Wilderness',
  dimension: 'Overworld', place: 'the plains', companions: '', party_size: '1', party_leader: 'Sam', equipment: 'Farmer',
  facts: {kit: 'heritage_example:farmer', inventory_policy: 'replace', keeps_belongings: 'false', receives_kit: 'true', structure: ''}
};
function render(intro, overrides = {}) {
  const config = P.readJson(JSON.stringify(intro)).config;
  const context = {...names, ...overrides, facts: {...names.facts, ...overrides.facts}};
  const playback = P.playback(config, context);
  return {text: playback.all.map(glyph => glyph.ch).join(''), config, context, playback};
}
const example = (name, overrides) => render(read(spawnPath(name)).intro, overrides);

test('every documentation JSON block parses and every copyable intro validates', () => {
  for (const page of pages.values()) {
    for (const document of blocks(page.markdown)) {
      if (document.intro || Object.hasOwn(document, 'text')) P.readJson(JSON.stringify(document));
    }
  }
  const reference = pages.get('dialogue').markdown;
  for (const tag of Object.keys(P.contextDefaults)) assert.ok(reference.includes('{' + tag + '}'), tag);
});

test('embedded pack examples and the complete dialogue template match their source files', () => {
  const embedded = blocks(pages.get('examples').markdown);
  for (const name of ['home', 'wanderer', 'meadow', 'settler']) {
    const source = read(spawnPath(name));
    Pack.validateSpawn(source);
    assert.ok(embedded.some(document => JSON.stringify(document) === JSON.stringify(source)), name);
  }
  const template = read('templates/dialogue-spawn.json');
  Pack.validateSpawn(template);
  assert.ok(embedded.some(document => JSON.stringify(document) === JSON.stringify(template)));
  const language = read('heritage-example-resources/assets/heritage_example/lang/en_us.json');
  assert.ok(embedded.some(document => JSON.stringify(document) === JSON.stringify(language)));
});

test('the documented shop examples match their templates and load in the kit creator', () => {
  const scout = read('templates/trail-scout-kit.json');
  const trail = read('templates/trail-kit.json');
  assert.deepEqual(blocks(pages.get('kits').markdown).find(document => document.shop), scout);
  for (const document of [scout, trail]) {
    const parsed = Kit.read(JSON.stringify(document));
    assert.deepEqual(parsed.document.shop, document.shop);
    assert.deepEqual(parsed.warnings, []);
  }
});

test('dialogue reference links resolve to local pages, sections and downloadable sources', () => {
  const reference = pages.get('dialogue').markdown;
  const slug = value => value.toLowerCase().replaceAll("'", '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const match of reference.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (href.startsWith('#/')) {
      const [id, section] = href.slice(2).split('/');
      assert.ok(pages.has(id), href);
      if (section) assert.ok([...pages.get(id).markdown.matchAll(/^#{1,6} (.+)$/gm)].some(heading => slug(heading[1]) === section), href);
    } else assert.ok(fs.existsSync(path.join(root, href)), href);
  }
});

test('example intros exercise party, variables, keybindings and inventory-aware branches', () => {
  assert.match(example('home').text, /Welcome home, Sam/);
  const party = example('home', {party_size: '2', companions: 'Jo', party_leader: 'Jo'});
  assert.match(party.text, /Jo leads|led by Jo/);
  assert.match(party.text, /2 travelers/);
  assert.match(example('meadow').text, /The Chronicler: Begin your story with The Meadow Wardens/);
  assert.match(example('meadow', {variables: {'heritage_example:faction': 'River Wardens'}}).text, /River Wardens/);
  assert.match(example('meadow', {variables: {'heritage_example:chapter': 2}}).text, /Chapter 2: The Chronicler remembers/);
  assert.match(example('settler', {kit: 'Translated Farmer', keys: {'key.inventory': 'I'}}).text, /The fields need a farmer/);
  const preserved = example('settler', {equipment: 'your belongings', facts: {inventory_policy: 'preserve', keeps_belongings: 'true', receives_kit: 'false'}});
  assert.match(preserved.text, /Your belongings made the journey/);
  assert.doesNotMatch(preserved.text, /The fields need a farmer/);
  assert.match(preserved.text, /A new settlement waits for you, Sam/);
  assert.match(preserved.text, /A local guide/);
  const wanderer = example('wanderer', {keys: {'key.inventory': 'I'}});
  assert.match(wanderer.text, /You found the plains/);
  assert.match(wanderer.text, /inventory with I/);
  assert.doesNotMatch(wanderer.text, /<pause|<speed/);
  assert.ok(P.revealDuration(wanderer.config, wanderer.context) > wanderer.config.reveal_ticks + 15);
});

test('complete template demonstrates solo, preserved and extension-driven fallbacks', () => {
  const intro = read('templates/dialogue-spawn.json').intro;
  assert.match(render(intro).text, /You travel with your own courage/);
  const later = render(intro, {variables: {'my_pack:chapter': 2}});
  assert.match(later.text, /Chapter 2 begins under an unknown banner/);
  assert.match(later.text, /Journal control: not installed/);
  assert.match(render(intro, {variables: {'my_pack:chapter': 2, 'my_pack:faction': 'River Wardens'}, keys: {'my_mod.journal': 'J'}}).text,
    /Chapter 2 begins under River Wardens\.\nJournal control: J/);
  assert.match(render(intro, {variables: {'my_pack:chapter': 2}, facts: {keeps_belongings: 'true'}}).text,
    /Your belongings made the journey/);
});
