import { by, device, element, expect as detoxExpect } from 'detox';

describe('Background tracking flow', () => {
  beforeAll(async () => {
    await device.launchApp({ permissions: { location: 'always', camera: 'YES', motion: 'YES' } });
  });

  it('records a route across a background/foreground cycle', async () => {
    await element(by.text('Track')).tap();
    await element(by.text('Start')).tap();

    // Feed synthetic GPS points while the app is backgrounded.
    await device.setLocation(10.1, 106.1);
    await device.sendToHome();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await device.setLocation(10.2, 106.2);
    await device.launchApp({ newInstance: false });

    await element(by.text('Stop')).tap();

    await detoxExpect(element(by.text(/\d+ route points/))).toBeVisible();
  });
});
