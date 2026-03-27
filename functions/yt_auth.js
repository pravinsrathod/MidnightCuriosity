const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');

/**
 * YouTube OAuth2 Token Generator
 * 
 * Usage:
 * 1. Put your Client ID and Client Secret in functions/.env
 * 2. Run: node yt_auth.js
 */

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

async function getAccessToken() {
    // Read from .env manually if needed, or just ask
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log('--- YouTube OAuth2 Setup ---');
    
    const clientId = await new Promise(resolve => rl.question('Enter your Google Client ID: ', resolve));
    const clientSecret = await new Promise(resolve => rl.question('Enter your Google Client Secret: ', resolve));

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for out-of-band flow
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });

    console.log('\n1. Authorize this app by visiting this url:\n', authUrl);
    
    const code = await new Promise(resolve => rl.question('\n2. Enter the code from that page here: ', resolve));
    rl.close();

    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n--- SUCCESS! ---');
        console.log('Refresh Token:', tokens.refresh_token);
        console.log('\nAdd these to your functions/.env file:');
        console.log(`YT_CLIENT_ID=${clientId}`);
        console.log(`YT_CLIENT_SECRET=${clientSecret}`);
        console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}`);
    } catch (err) {
        console.error('Error retrieving access token', err);
    }
}

getAccessToken();
