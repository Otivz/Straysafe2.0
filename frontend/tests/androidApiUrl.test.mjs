// The address an Android build may carry (scripts/androidApiUrl.ts). Pure logic: no network, no browser, no Android tooling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidApiUrlProblem } from '../scripts/androidApiUrl.ts';

const ok = (value, optional = false) => assert.equal(androidApiUrlProblem(value, optional), null, `expected ${value} to be accepted`);
const bad = (value, pattern, optional = false) => {
  const problem = androidApiUrlProblem(value, optional);
  assert.ok(problem, `expected ${JSON.stringify(value)} to be refused`);
  assert.match(problem, pattern);
};

test('a plain HTTPS address is accepted, with or without a path prefix', () => {
  ok('https://api.straysafe.example');
  ok('https://staging.example.org:8443');
  ok('https://example.org/api');
  ok('  https://api.straysafe.example  ');                 // surrounding spaces from a pasted variable
});

test('a missing address is refused with the name of the setting', () => {
  bad(undefined, /VITE_API_BASE_URL is not set/);
  bad('', /VITE_API_BASE_URL is not set/);
  bad('   ', /VITE_API_BASE_URL is not set/);
  bad(null, /VITE_API_BASE_URL is not set/);
});

test('something that is not a web address is refused', () => {
  bad('api.straysafe.example', /not a web address/);       // no scheme
  bad('not a url', /not a web address/);
  bad('ftp://files.example.org', /must start with https/);
  bad('capacitor://localhost', /must start with https/);
});

test('a built-in address is always HTTPS: plain http (a LAN address) is typed into the debug app instead', () => {
  bad('http://192.168.1.20:8000', /must be HTTPS/);
  bad('http://10.0.2.2:8000', /must be HTTPS/);
  bad('http://api.straysafe.example', /Connection Settings/);
  ok('https://192.168.1.20:8443');
});

test('the debug build may carry no address at all, but one that is given is still checked', () => {
  ok(undefined, true);
  ok('', true);
  ok('   ', true);
  ok('https://staging.straysafe.example', true);
  bad('http://192.168.1.20:8000', /must be HTTPS/, true);
  bad('https://localhost:8000', /phone itself/, true);
  bad('not a url', /not a web address/, true);
  bad(undefined, /VITE_API_BASE_URL is not set/);           // the release-style build still requires one
});

test('an address that is the phone itself is refused, whatever the scheme', () => {
  for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '0.0.0.0', '[::1]', 'LOCALHOST']) {
    bad(`https://${host}:8000`, /phone itself/);
    bad(`http://${host}:8000`, /phone itself|must be HTTPS/);
  }
});

test('credentials, query strings and a trailing slash are refused', () => {
  bad('https://user:secret@api.straysafe.example', /user name or password/);
  bad('https://user@api.straysafe.example', /user name or password/);
  bad('https://api.straysafe.example?key=abc', /no \? or # part/);
  bad('https://api.straysafe.example#top', /no \? or # part/);
  bad('https://api.straysafe.example/', /must not end with a slash/);
  bad('https://example.org/api/', /must not end with a slash/);
});
