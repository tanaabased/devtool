import assert from 'node:assert/strict';
import Config from '../lib/config.ts';
import { ImportObject, ImportString } from '../lib/yaml.ts';
import inputData from '../utils/config-input-data.ts';

describe('service input import metadata', () => {
  it('restores imported text without turning ordinary image names into Dockerfiles', () => {
    const config = Config.from({
      services: {
        'web.api': new ImportObject(
          { image: 'alpine', steps: [new ImportString('RUN true', { file: '/imports/step' })] },
          { file: '/imports/service.yaml' },
        ),
      },
    });
    const data = inputData(config) as {
      services: Record<string, { image: string; steps: ImportString[] }>;
    };
    assert.equal(data.services['web.api']!.image, 'alpine');
    assert.ok(data.services['web.api']!.steps[0] instanceof ImportString);
    assert.equal(data.services['web.api']!.steps[0]!.getMetadata().file, '/imports/step');
    assert.equal(
      config.explain(['services', 'web.api', 'image']).winner?.importedFrom,
      '/imports/service.yaml',
    );
  });
});
