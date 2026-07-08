const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to patch the iOS Podfile and Project for Xcode 26+ compatibility.
 * 1. Patches Podfile post_install for Folly/C++20 compatibility.
 * 2. Patches Project settings via build properties for simulator compatibility.
 */
const withXcodePatch = (config) => {
  // --- Part 1: Explicit Xcode Project Mod (Target specific) ---
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    for (const key in configurations) {
      const buildConfig = configurations[key];
      if (buildConfig.buildSettings && typeof buildConfig.buildSettings === 'object') {
        buildConfig.buildSettings['ONLY_ACTIVE_ARCH'] = 'YES';
        buildConfig.buildSettings['ARCHS'] = '"$(ARCHS_STANDARD)"';
        buildConfig.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.5';
        buildConfig.buildSettings['TARGETED_DEVICE_FAMILY'] = '"1,2"';
        buildConfig.buildSettings['SDKROOT'] = 'iphoneos';
        buildConfig.buildSettings['SUPPORTED_PLATFORMS'] = '"iphonesimulator iphoneos"';
        buildConfig.buildSettings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = 'arm64';

        // Fix the malformed library search paths if it exists
        if (buildConfig.buildSettings['LIBRARY_SEARCH_PATHS']) {
          buildConfig.buildSettings['LIBRARY_SEARCH_PATHS'] = '"$(SDKROOT)/usr/lib/swift $(inherited)"';
        }
      }
    }

    return config;
  });

  // --- Part 2: Podfile & Node Modules Patch ---
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;
      
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // Sync platform version to 15.5
      contents = contents.replace(/platform :ios, .*/, "platform :ios, '15.5'");

      // Sync react_native_post_install call for RN 0.81.5 compatibility
      contents = contents.replace(/react_native_post_install\([\s\S]*?\)/, (match) => {
        return match.replace(/,\s*:new_arch_enabled\s*=>\s*(true|false)/g, '');
      });

      // The patch to be injected into the post_install block
      const patchMarker = '# Xcode 26 compatibility patch';
      const endMarker = '# End of Xcode 26 compatibility patch';
      const patchCode = `
    \n    ${patchMarker}
    begin
      installer.pods_project.targets.each do |target|
        target.build_configurations.each do |config|
          # Enforce C++20 for all pods
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
          
          # Disable Folly Coroutines for C++20 compatibility
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          ['FOLLY_HAS_COROUTINES=0', 'FOLLY_CFG_NO_COROUTINES=1', 'FMT_USE_CONSTEVAL=0'].each do |val|
            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << val unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?(val)
          end
          
          # Performance and architecture harmonization
          config.build_settings["ONLY_ACTIVE_ARCH"] = "YES"
          config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "15.5"
          
          # Ensure no architecture exclusion for simulators on Apple Silicon
          config.build_settings["EXCLUDED_ARCHS[sdk=iphonesimulator*]"] = "arm64"
        end
      end

      installer.aggregate_targets.each do |target|
        target.user_project.build_configurations.each do |config|
          config.build_settings["ONLY_ACTIVE_ARCH"] = "YES"
          config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "15.5"
          config.build_settings["SUPPORTS_MACCATALYST"] = "NO"
          config.build_settings["SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD"] = "NO"
          config.build_settings["EXCLUDED_ARCHS[sdk=iphonesimulator*]"] = "arm64"
        end
      end

      # Patch xcconfig files for consistency
      xcconfig_files = Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', '**', '*.xcconfig'))
      xcconfig_files.each do |file|
        content = File.read(file)
        patched = content.gsub(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*\d+\.\d+/, 'IPHONEOS_DEPLOYMENT_TARGET = 15.5')
        # Instead of removing, we ensure it's set to arm64 if not already present or if it's different
        unless patched.include?('EXCLUDED_ARCHS[sdk=iphonesimulator*]')
          patched << "\nEXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64"
        else
          patched = patched.gsub(/EXCLUDED_ARCHS\[sdk=iphonesimulator\*\]\s*=\s*(?!arm64).*/, 'EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64')
        end
        
        if patched.include?('GCC_PREPROCESSOR_DEFINITIONS')
          ['FOLLY_HAS_COROUTINES=0', 'FOLLY_CFG_NO_COROUTINES=1', 'FMT_USE_CONSTEVAL=0'].each do |val|
            patched = patched.gsub(/(GCC_PREPROCESSOR_DEFINITIONS.*? = )(?!.*#{val})(.*)/, "\\1\\2 #{val}")
          end
        end

        File.write(file, patched) if patched != content
      end

      # Xcode 26+ fmt library patch
      fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
      if File.exist?(fmt_base)
        content = File.read(fmt_base)
        unless content.include?('Xcode 26 workaround')
          patched = content.gsub(/#elif defined\(__cpp_consteval\)\n#\s+define FMT_USE_CONSTEVAL 1/, "// Xcode 26 workaround\n#elif defined(__cpp_consteval)\n#  define FMT_USE_CONSTEVAL 0")
          if patched != content
            File.chmod(0644, fmt_base)
            File.write(fmt_base, patched)
          end
        end
      end
    rescue => e
      puts "Xcode 26 compatibility patch failed: #{e.message}"
    end
    # End of Xcode 26 compatibility patch
`;

      // Check if patch already exists and replace it, or inject NEW one
      if (contents.includes(patchMarker)) {
        console.log('Updating existing Xcode 26 compatibility patch...');
        const startIndex = contents.indexOf(patchMarker);
        const endIndex = contents.indexOf(endMarker);
        if (startIndex !== -1 && endIndex !== -1) {
          const fullEndIndex = endIndex + endMarker.length;
          // Ensure we preserve the newline before the patch
          contents = contents.slice(0, startIndex).trimEnd() + '\n' + patchCode.trim() + '\n' + contents.slice(fullEndIndex).trimStart();
        }
      } else {
        const rnPostInstallRegex = /(react_native_post_install\([\s\S]*?\))\n/;
        if (rnPostInstallRegex.test(contents)) {
          console.log('Injecting Xcode 26 compatibility patch...');
          contents = contents.replace(rnPostInstallRegex, `$1${patchCode}`);
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};

module.exports = withXcodePatch;
