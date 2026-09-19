export const SensorTypes = {
  accelerometer: 'accelerometer',
};

export const setUpdateIntervalForType = jest.fn();
export const setLogLevelForType = jest.fn();

export const accelerometer = {
  subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
};
