export default ({ config }) => {
    const clientId = process.env.CLIENT_ID || "default";
    const brandingPath = `./assets/branding/${clientId}`;

    return {
        ...config,
        expo: {
            ...config.expo,
            name: process.env.APP_NAME || "EduPro",
            slug: "mobile-rn",
            scheme: "com.prowin.edupro",
            version: "4.1.1",
            orientation: "portrait",
            icon: process.env.APP_ICON || `${brandingPath}/icon.png`,
            userInterfaceStyle: "light",
            newArchEnabled: true,
            splash: {
                image: process.env.APP_SPLASH || `${brandingPath}/splash.png`,
                resizeMode: "contain",
                backgroundColor: process.env.APP_SPLASH_COLOR || "#FFFFFF"
            },
            ios: {
                supportsTablet: true,
                bundleIdentifier: "com.prowin.edupro",
                buildNumber: "401",
                googleServicesFile: process.env.EXPO_PUBLIC_APP_ENV === 'production'
                    ? './GoogleService-Info.production.plist'
                    : './GoogleService-Info.development.plist',
                infoPlist: {
                    NSCameraUsageDescription: `${process.env.APP_NAME || "EduPro"} requires camera access to allow students to capture photos of their written homework for electronic submission and to update their profile pictures.`,
                    NSPhotoLibraryUsageDescription: `${process.env.APP_NAME || "EduPro"} requires photo library access to allow students to select and upload existing homework documents and profile pictures from their gallery.`,
                    NSMicrophoneUsageDescription: `${process.env.APP_NAME || "EduPro"} requires microphone access to enable interactive features, such as voice-to-text for doubt clearing and recording audio responses during lessons.`,
                    NSFaceIDUsageDescription: `${process.env.APP_NAME || "EduPro"} uses FaceID to provide a secure and faster way to log in to your educational account.`,
                    ITSAppUsesNonExemptEncryption: false
                }
            },
            android: {
                versionCode: 401,
                targetSdkVersion: 36,
                compileSdkVersion: 36,
                adaptiveIcon: {
                    foregroundImage: process.env.APP_ADAPTIVE_ICON || `${brandingPath}/adaptive-icon.png`,
                    backgroundColor: "#ffffff"
                },
                package: "com.prowin.eduproapp",
                googleServicesFile: process.env.EXPO_PUBLIC_APP_ENV === 'production'
                    ? './.google-services.production.json'
                    : './.google-services.development.json'
            },
            web: {
                favicon: `${brandingPath}/favicon.png`,
                bundler: "metro"
            },
            plugins: [
                "expo-router",
                [
                    "expo-build-properties",
                    {
                        "android": {
                            "compileSdkVersion": 36,
                            "targetSdkVersion": 36,
                            "buildToolsVersion": "36.0.0",
                            "ndkVersion": "27.0.12077973",
                            "kotlinVersion": "2.1.20",
                            "jdkVersion": 17,
                            "packagingOptions": {
                                "jniLibs": {
                                    "useLegacyPackaging": false
                                }
                            }
                        },
                        "ios": {
                            "deploymentTarget": "15.5"
                        }
                    }
                ],
                "./plugins/xcode-patch-plugin",
                [
                    "expo-local-authentication",
                    {
                        "faceIDPermission": `Allow ${process.env.APP_NAME || "this app"} to use FaceID for faster login.`
                    }
                ],
                "expo-notifications",
                [
                    "expo-image-picker",
                    {
                        "photosPermission": `${process.env.APP_NAME || "EduPro"} requires photo library access to allow students to select and upload existing homework documents and profile pictures.`,
                        "cameraPermission": `${process.env.APP_NAME || "EduPro"} requires camera access to allow students to capture photos of their written homework for electronic submission and to update their profile pictures.`
                    }
                ],
                "expo-av",
                "expo-updates"
            ],
            experiments: {
                typedRoutes: true
            },
            extra: {
                eas: {
                    projectId: "18c80913-ee7e-4787-a2c9-d9617dc16854"
                },
                clientIdentifier: clientId
            },
            runtimeVersion: {
                policy: "appVersion"
            },
            updates: {
                url: "https://u.expo.dev/18c80913-ee7e-4787-a2c9-d9617dc16854"
            }
        }
    };
};
