export async function sendPushNotification(to, title, body, data = {}) {
    const message = {
        to,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
    };

    console.log('Sending Notification:', message);

    try {
        const response = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://exp.host/--/api/v2/push/send'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        const result = await response.json();
        console.log('Notification result:', result);
        return result;
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}
