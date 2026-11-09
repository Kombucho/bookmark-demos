const test = require('node:test');
const assert = require('node:assert/strict');
const sprites = require('./sprites.js');

test('ids stay inside the numbered files in the sprites repo', () => {
  assert.equal(sprites.MAX_ID, 1025);
  assert.equal(sprites.NAME_LIST.length, 1025);
  assert.equal(sprites.clampId(0), 1);
  assert.equal(sprites.clampId(-4), 1);
  assert.equal(sprites.clampId('nope'), 1);
  assert.equal(sprites.clampId(25.9), 25);
  assert.equal(sprites.clampId(1026), 1025);
  assert.equal(sprites.clampId(1025), 1025);
});

test('names come from the National Dex list', () => {
  assert.equal(sprites.nameOf(1), 'Bulbasaur');
  assert.equal(sprites.nameOf(25), 'Pikachu');
  assert.equal(sprites.nameOf(122), 'Mr. Mime');
  assert.equal(sprites.nameOf(83), "Farfetch'd");
  assert.equal(sprites.nameOf(1025), 'Pecharunt');
  assert.equal(sprites.titleOf('jangmo-o'), 'Jangmo-o');
  assert.equal(sprites.titleOf('wo-chien'), 'Wo-Chien');
  assert.equal(sprites.titleOf('great-tusk'), 'Great Tusk');
});

test('variant paths follow the repo folders', () => {
  const pixel = sprites.matrix('pixel', 25).map(function (cell) { return cell.path; });
  assert.deepEqual(pixel, [
    'sprites/pokemon/25.png',
    'sprites/pokemon/shiny/25.png',
    'sprites/pokemon/female/25.png',
    'sprites/pokemon/shiny/female/25.png',
    'sprites/pokemon/back/25.png',
    'sprites/pokemon/back/shiny/25.png',
    'sprites/pokemon/back/female/25.png',
    'sprites/pokemon/back/shiny/female/25.png',
  ]);

  assert.equal(
    sprites.relativePath('dream', 25, {}),
    'sprites/pokemon/other/dream-world/25.svg'
  );
  assert.equal(
    sprites.relativePath('dream', 25, { back: true, shiny: true, female: true }),
    'sprites/pokemon/other/dream-world/back/shiny/female/25.svg'
  );
  assert.equal(
    sprites.relativePath('official', 25, { shiny: true }),
    'sprites/pokemon/other/official-artwork/shiny/25.png'
  );
  assert.equal(
    sprites.relativePath('official', 1, { back: true }),
    'sprites/pokemon/other/official-artwork/back/1.png'
  );
  assert.equal(
    sprites.relativePath('showdown', 25, { back: true, female: true }),
    'sprites/pokemon/other/showdown/back/female/25.gif'
  );
  assert.equal(
    sprites.relativePath('showdown', 25, { back: true, shiny: true, female: true }),
    'sprites/pokemon/other/showdown/back/shiny/female/25.gif'
  );
  assert.equal(
    sprites.rawUrl(sprites.relativePath('pixel', 25, {})),
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png'
  );
  assert.equal(sprites.styleOf('pixel').pixelated, true);
  assert.equal(sprites.styleOf('showdown').pixelated, true);
  assert.equal(sprites.styleOf('official').pixelated, false);
  assert.equal(sprites.styleOf('dream').pixelated, false);
  assert.equal(sprites.matrix('showdown', 1025).length, 8);
});
