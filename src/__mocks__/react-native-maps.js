const React = require('react');

function MapView(props) {
  return React.createElement('MapView', props, props.children);
}

function Polyline(props) {
  return React.createElement('Polyline', props);
}

module.exports = {
  __esModule: true,
  default: MapView,
  Polyline,
};
