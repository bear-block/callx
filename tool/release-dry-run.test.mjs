import assert from 'node:assert/strict';
import {test} from 'node:test';
import {problemsIn, pubArchiveMegabytes, pubTreePaths} from './release-dry-run.mjs';

const listing = `Publishing callx_livekit 0.1.0 to https://pub.dev:
├── CHANGELOG.md (<1 KB)
├── build
│   ├── native_assets
│   │   └── macos
│   │       └── native_assets.json (<1 KB)
│   └── test_cache
│       └── build
│           └── a.cache.dill.track.dill (45 MB)
├── lib
│   └── callx_livekit.dart (1 KB)
└── pubspec.yaml (<1 KB)

Total compressed archive size: 28 MB.`;

test('pub tree listings become full paths', () => {
  assert.deepEqual(pubTreePaths(listing), [
    'CHANGELOG.md',
    'build/',
    'build/native_assets/',
    'build/native_assets/macos/',
    'build/native_assets/macos/native_assets.json',
    'build/test_cache/',
    'build/test_cache/build/',
    'build/test_cache/build/a.cache.dill.track.dill',
    'lib/',
    'lib/callx_livekit.dart',
    'pubspec.yaml',
  ]);
});

test('a build directory in a pub package is a problem', () => {
  assert.ok(problemsIn(pubTreePaths(listing), []).some((problem) => problem.includes('build/')));
});

test('the archive size is read in megabytes', () => {
  assert.equal(pubArchiveMegabytes(listing), 28);
  assert.equal(pubArchiveMegabytes('Total compressed archive size: 512 KB.'), 0.5);
});
