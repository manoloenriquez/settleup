const { withInfoPlist, withXcodeProject, IOSConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * The iOS 27 SDK refuses to launch apps that do not adopt the UIScene life
 * cycle ("UIScene life cycle is required for apps built with this SDK").
 * Expo SDK 54 / React Native 0.81 still use the classic AppDelegate window,
 * so this plugin declares a single-window scene manifest and adds a
 * SceneDelegate that attaches the window React Native already created to the
 * connecting UIWindowScene, and forwards URL / universal-link events.
 *
 * Remove once the app moves to an Expo SDK with built-in scene support.
 */
const SCENE_DELEGATE = `import UIKit
import React

/// Attaches the window created by AppDelegate (where Expo starts React Native)
/// to the scene the system connects, and forwards link events to React Native.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate, let appWindow = appDelegate.window else { return }
    appWindow.windowScene = windowScene
    appWindow.frame = windowScene.coordinateSpace.bounds
    window = appWindow
    appWindow.makeKeyAndVisible()
    for context in connectionOptions.urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = RCTLinkingManager.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withSceneManifest(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return modConfig;
  });
}

function withSceneDelegateSource(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const fileName = "SceneDelegate.swift";
    const target = path.join(modConfig.modRequest.platformProjectRoot, projectName, fileName);
    fs.writeFileSync(target, SCENE_DELEGATE);
    const relative = path.join(projectName, fileName);
    if (!project.hasFile(relative)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: relative,
        groupName: projectName,
        project,
      });
    }
    return modConfig;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  return withSceneDelegateSource(withSceneManifest(config));
};
