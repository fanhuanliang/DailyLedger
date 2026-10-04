import { requireExpectedRevision } from '../src/lib/validation';
test.each([-1,0,Number.MAX_SAFE_INTEGER + 1])('rejects malformed expectedRevision %s', (expectedRevision) => {
  expect(() => requireExpectedRevision({ expectedRevision })).toThrow();
});
