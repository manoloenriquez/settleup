const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Two Xcode 27 build fixes for the generated CocoaPods project:
 *
 * 1. Xcode 27 refuses to build pod targets whose deployment target is below
 *    iOS 15 (Sentry's and AsyncStorage's resource bundles still declare
 *    11.0 / 13.4). Every pod target below the floor is raised to it; the app
 *    itself targets iOS 27 via expo-build-properties.
 * 2. With the prebuilt React Native 0.81 pods, ExpoModulesCore cannot find
 *    `hermes/hermes.h` even though hermes-engine ships it under
 *    destroot/include; the include directory is added to its header search
 *    paths.
 */
const FLOOR = "15.1";
const MARKER = "# raise-pod-deployment-targets";
const HERMES_INCLUDE = "$(PODS_ROOT)/hermes-engine/destroot/include";

function withPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const podfile = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes(MARKER)) {
        contents = contents.replace(
          /post_install do \|installer\|\n/,
          `post_install do |installer|\n    ${MARKER}\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |build_config|\n        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']\n        if current.nil? || current.to_f < ${FLOOR}\n          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${FLOOR}'\n        end\n        if target.name == 'ExpoModulesCore'\n          paths = build_config.build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'\n          build_config.build_settings['HEADER_SEARCH_PATHS'] = paths + ' "${HERMES_INCLUDE}"'\n        end\n      end\n    end\n`,
        );
        fs.writeFileSync(podfile, contents);
      }
      return modConfig;
    },
  ]);
}

module.exports = withPodDeploymentTarget;
