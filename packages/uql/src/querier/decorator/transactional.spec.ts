import { Transactional } from './transactional';

it('missing injectQuerier', () => {
  expect(() => {
    class ServiceA {
      @Transactional()
      find() {}
    }
  }).toThrow("missing decorator @InjectQuerier() in one of the parameters of 'ServiceA.find'");
});