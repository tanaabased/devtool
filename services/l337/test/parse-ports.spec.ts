import assert from 'node:assert/strict';
import type { Port } from '../../../components/service.ts';
import ports from '../utils/parse-ports.ts';

describe('services/l337/utils/parse-ports', () => {
  it('normalizes HTTP ports and retains long syntax', () => {
    const result = ports([
      '8080:80/http',
      '8443:443/https',
      '9000-9002/tcp',
      { target: 53, published: '5353', protocol: 'udp' },
    ]);
    assert.deepEqual(result.http, [80]);
    assert.deepEqual(result.https, [443]);
    assert.equal(result.ports[0], '8080:80/tcp');
    assert.equal((result.ports[3] as Port).protocol, 'udp');
  });
});
