import fs from 'fs';
import path from 'path';

const env = process.argv[2];
const app = process.argv[3]; // 'web' or 'mobile'

if (!['development', 'production'].includes(env)) {
    console.error('Usage: node scripts/switch-env.mjs [development|production] [web|mobile|all]');
    process.exit(1);
}

const targetApp = app || 'all';

const apps = {
    web: {
        dir: 'admin-web',
        prefix: 'VITE'
    },
    mobile: {
        dir: 'mobile-rn',
        prefix: 'EXPO_PUBLIC'
    }
};

function switchEnv(appName) {
    const config = apps[appName];
    const sourceFile = path.join(process.cwd(), config.dir, `.env.${env}`);
    const destFile = path.join(process.cwd(), config.dir, '.env');

    if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, destFile);
        console.log(`✅ Switched ${appName} .env to ${env} environment.`);

        // Also handle google-services.json and GoogleService-Info.plist for mobile
        if (appName === 'mobile') {
            const gsSource = path.join(process.cwd(), config.dir, `.google-services.${env}.json`);
            const gsDest = path.join(process.cwd(), config.dir, 'android', 'app', 'google-services.json');
            if (fs.existsSync(gsSource)) {
                fs.copyFileSync(gsSource, gsDest);
                console.log(`✅ Switched mobile google-services.json to ${env}.`);
            }

            const plistSource = path.join(process.cwd(), config.dir, `GoogleService-Info.${env}.plist`);
            const plistDest = path.join(process.cwd(), config.dir, 'ios', 'EduPro', 'GoogleService-Info.plist');
            if (fs.existsSync(plistSource)) {
                fs.copyFileSync(plistSource, plistDest);
                console.log(`✅ Switched mobile GoogleService-Info.plist to ${env}.`);
            }
        }
    } else {
        console.error(`❌ Source file ${sourceFile} does not exist.`);
    }
}

if (targetApp === 'all') {
    switchEnv('web');
    switchEnv('mobile');
} else if (apps[targetApp]) {
    switchEnv(targetApp);
} else {
    console.error('Invalid app name. Use "web", "mobile", or "all".');
    process.exit(1);
}
