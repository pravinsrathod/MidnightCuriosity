export default ({ config }) => {
    const clientId = process.env.CLIENT_ID || "default";
    const brandingPath = `./assets/branding/${clientId}`;

    return {
        ...config,
        expo: {
            ...config.expo,
            name: process.env.APP_NAME || "EduPro",
            slug: "mobile-rn",
            version: "1.0.0",
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
                bundleIdentifier: process.env.APP_PACKAGE || "com.prowin.edupro"
            },
            android: {
                adaptiveIcon: {
                    foregroundImage: process.env.APP_ADAPTIVE_ICON || `${brandingPath}/adaptive-icon.png`,
                    backgroundColor: "#ffffff"
                },
                package: process.env.APP_PACKAGE || "com.prowin.edupro"
            },
            web: {
                favicon: `${brandingPath}/favicon.png`,
                bundler: "metro"
            },
            plugins: [
                "expo-router",
                [
                    "expo-local-authentication",
                    {
                        "faceIDPermission": `Allow ${process.env.APP_NAME || "this app"} to use FaceID for faster login.`
                    }
                ]
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
