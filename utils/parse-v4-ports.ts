import range from 'lodash-es/range.js';
import type { Port } from '../lib/types.ts';

const getPorts = (port: string | Port): number[] => {
  const published = typeof port === 'string' ? port : String(port.published ?? '');
  const value = published.split(':').at(-1)!.split('/')[0];
  const [start, end = start] = value.split('-');
  return range(Number(start), Number.parseInt(end) + 1);
};
const getProtocolPorts = (ports: (string | number | Port)[], protocol: string) =>
  ports
    .filter((port): port is string | Port =>
      typeof port === 'string'
        ? port.endsWith(`/${protocol}`)
        : typeof port === 'object' && port.app_protocol === protocol,
    )
    .flatMap(getPorts);
export default (ports: (string | number | Port)[] = []) => ({
  http: getProtocolPorts(ports, 'http'),
  https: getProtocolPorts(ports, 'https'),
  ports: ports.map((port) =>
    typeof port === 'string' ? port.replace('/https', '/tcp').replace('/http', '/tcp') : port,
  ),
});
