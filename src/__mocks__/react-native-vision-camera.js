const React = require('react');

const Camera = React.forwardRef((_props, ref) => {
  React.useImperativeHandle(ref, () => ({
    takePhoto: jest.fn().mockResolvedValue({ path: '/mock/photo.jpg' }),
  }));
  return null;
});

module.exports = {
  Camera,
  useCameraDevice: jest.fn(() => ({ id: 'mock-camera-device' })),
};
