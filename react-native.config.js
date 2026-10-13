// Autolinking overrides for the React Native CLI.
const path = require('path');

module.exports = {
  dependencies: {
    // Its Android package extends BaseReactPackage, which RN 0.75's CLI
    // (v14) doesn't recognise when scanning for packages, so the library was
    // silently skipped. Declaring the package class here links it.
    'react-native-config': {
      platforms: {
        android: {
          sourceDir: path.join(__dirname, 'node_modules/react-native-config/android'),
          packageImportPath: 'import com.lugg.RNCConfig.RNCConfigPackage;',
          packageInstance: 'new RNCConfigPackage()',
        },
      },
    },
  },
};
