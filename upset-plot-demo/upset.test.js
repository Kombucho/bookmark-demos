const test = require('node:test');
const assert = require('node:assert/strict');
const upset = require('./upset.js');

test('the example is labeled, and every skill on a project is one of the six', () => {
  assert.equal(upset.example, true);
  assert.equal(upset.SETS.length, 6);
  assert.equal(upset.PROJECTS.length >= 36, true);
  const ids = {};
  upset.SETS.forEach(function (set) { ids[set.id] = true; });
  upset.PROJECTS.forEach(function (project) {
    assert.equal(project.skills.length > 0, true, project.name);
    const seen = {};
    project.skills.forEach(function (id) {
      assert.equal(ids[id], true, project.name + ' ' + id);
      assert.equal(seen[id], undefined, project.name);
      seen[id] = true;
    });
  });
});

test('each project sits in exactly one exclusive intersection, and set size counts membership', () => {
  const ids = upset.SETS.map(function (set) { return set.id; });
  const found = upset.intersections(upset.PROJECTS, ids);
  const seen = [];
  found.forEach(function (item) {
    assert.equal(item.size, item.projects.length);
    assert.equal(item.degree, item.sets.length);
    item.projects.forEach(function (project) {
      seen.push(project.id);
      assert.deepEqual(item.sets, ids.filter(function (id) {
        return project.skills.indexOf(id) !== -1;
      }));
    });
  });
  assert.equal(seen.length, upset.PROJECTS.length);
  assert.equal(new Set(seen).size, upset.PROJECTS.length);
  const sizes = upset.setSizes(upset.PROJECTS, upset.SETS);
  sizes.forEach(function (set) {
    const manual = upset.PROJECTS.filter(function (project) {
      return project.skills.indexOf(set.id) !== -1;
    }).length;
    assert.equal(set.size, manual, set.name);
    assert.equal(set.size > 0, true, set.name);
  });
});

test('sorting by size and by degree, and a minimum size, change the columns', () => {
  const bySize = upset.view(upset.PROJECTS, { sort: 'size', minSize: 1 });
  const byDegree = upset.view(upset.PROJECTS, { sort: 'degree', minSize: 1 });
  assert.equal(bySize.intersections[0].size >= bySize.intersections[1].size, true);
  assert.equal(bySize.intersections[0].key, 'layout');
  assert.equal(byDegree.intersections[0].degree, 6);
  assert.equal(byDegree.intersections[0].key, 'layout+type+motion+data+agents+proof');
  const tight = upset.view(upset.PROJECTS, { sort: 'size', minSize: 5 });
  assert.equal(tight.intersections.length, 1);
  assert.equal(tight.intersections[0].key, 'layout');
  assert.equal(tight.hidden > 0, true);
  assert.equal(tight.sets[0].size, bySize.sets[0].size);
  const empty = upset.view(upset.PROJECTS, { minSize: 9 });
  assert.equal(empty.intersections.length, 0);
});

test('six skills make 63 possible regions, and the degree rows add up to every project', () => {
  const picture = upset.view();
  assert.equal(picture.possible, 63);
  assert.equal(upset.possibleRegions(5), 31);
  assert.equal(upset.possibleRegions(3), 7);
  assert.equal(picture.occupied < picture.possible, true);
  assert.equal(picture.occupied > 15, true);
  const projects = picture.degrees.reduce(function (sum, row) { return sum + row.projects; }, 0);
  const columns = picture.degrees.reduce(function (sum, row) { return sum + row.intersections; }, 0);
  assert.equal(projects, picture.projectCount);
  assert.equal(columns, picture.occupied);
  assert.equal(picture.degrees[0].degree, 1);
  assert.equal(picture.degrees[5].degree, 6);
  assert.equal(picture.degrees[5].projects, 1);
});

test('a three-set Venn partitions the same projects, and the fourth skill replaces the oldest', () => {
  const regions = upset.venn(upset.PROJECTS, ['layout', 'type', 'motion']);
  const keys = ['100', '010', '001', '110', '101', '011', '111', '000'];
  let count = 0;
  keys.forEach(function (key) {
    count += regions.regions[key].length;
    regions.regions[key].forEach(function (project) {
      const mask = ['layout', 'type', 'motion'].map(function (id) {
        return project.skills.indexOf(id) === -1 ? '0' : '1';
      }).join('');
      assert.equal(mask, key, project.name);
    });
  });
  assert.equal(count, upset.PROJECTS.length);
  assert.equal(regions.outside, regions.regions['000'].length);
  assert.equal(regions.occupied <= 7, true);
  assert.equal(regions.regions['111'].length >= 1, true);
  const swapped = upset.replaceVennSet(['layout', 'type', 'motion'], 'data');
  assert.deepEqual(swapped, ['type', 'motion', 'data']);
  assert.deepEqual(upset.replaceVennSet(swapped, 'type'), swapped);
  assert.equal(upset.regionLabel('110', ['layout', 'type', 'motion']), 'Layout ∩ Type');
  assert.equal(upset.regionLabel('000', ['layout', 'type', 'motion']), 'Outside all three');
});
