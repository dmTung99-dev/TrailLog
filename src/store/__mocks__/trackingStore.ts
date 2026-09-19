// Manual mock for '../store/trackingStore'.
//
// A bare `jest.mock('../store/trackingStore')` (no factory) makes Jest
// automock the module — but automocking still fully evaluates the real
// module to learn its shape, pulling in LocationTrackingService and
// PedometerService's real native imports (react-native-geolocation-service,
// react-native-background-actions, react-native-sensors). Those construct
// NativeEventEmitter/native module bindings at import time, which throws
// outside a real native runtime. This manual mock — which Jest prefers
// over automocking whenever one exists in a `__mocks__` folder next to the
// real module — avoids importing the real module (and its native
// dependency graph) at all.
export const useTrackingStore = jest.fn();
