// status.js

export function initLanyard(discordId, wsEndpoint) {
    if (!discordId) {
        console.warn('Lanyard initialization failed: Invalid Discord ID.');
        return;
    }

    const endpoint = wsEndpoint || 'wss://api.lanyard.rest/socket';
    let ws;
    let heartbeatInterval;

    function connect() {
        ws = new WebSocket(endpoint);

        ws.onopen = () => {
            console.log('Connected to Lanyard WebSocket');
        };

        ws.onmessage = (event) => {
            const { op, t, d } = JSON.parse(event.data);

            if (op === 1) {
                heartbeatInterval = setInterval(() => {
                    ws.send(JSON.stringify({ op: 3 }));
                }, d.heartbeat_interval);

                ws.send(JSON.stringify({
                    op: 2,
                    d: { subscribe_to_id: discordId }
                }));
            } 
            else if (op === 0 && (t === 'INIT_STATE' || t === 'PRESENCE_UPDATE')) {
                updateStatusUI(d);
            }
        };

        ws.onclose = () => {
            console.log('Lanyard WebSocket closed. Reconnecting...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            setTimeout(connect, 5000);
        };

        ws.onerror = (error) => {
            console.error('Lanyard WebSocket error:', error);
            ws.close();
        };
    }

    connect();
}

function updateStatusUI(presence) {
    if (!presence || !presence.discord_user) return;

    const statusDot = document.getElementById('status-dot');
    const usernameText = document.getElementById('discord-username');
    const statusText = document.getElementById('status-text');
    
    if (!statusDot || !usernameText || !statusText) return;

    // 1. Set Username
    const user = presence.discord_user;
    let displayName = user.username;
    // Append discriminator if it's a legacy Discord tag (not "0" or "0000")
    if (user.discriminator && user.discriminator !== "0" && user.discriminator !== "0000") {
        displayName += `#${user.discriminator}`;
    }
    usernameText.textContent = displayName;

    // 2. Set Base Status Color
    const status = presence.discord_status || 'offline';
    statusDot.className = 'status-dot'; // reset
    
    let baseStatusText = 'Offline';
    if (status === 'online') {
        statusDot.classList.add('online');
        baseStatusText = 'Online';
    } else if (status === 'idle') {
        statusDot.classList.add('idle');
        baseStatusText = 'Idle';
    } else if (status === 'dnd') {
        statusDot.classList.add('dnd');
        baseStatusText = 'Do Not Disturb';
    } else {
        statusDot.classList.add('offline');
    }

    // 3. Set Activity Text
    let activityText = '';
    
    // Only check activities if they aren't strictly offline
    if (status !== 'offline' && presence.activities && presence.activities.length > 0) {
        const custom = presence.activities.find(a => a.type === 4);
        const playing = presence.activities.find(a => a.type === 0);
        const streaming = presence.activities.find(a => a.type === 1);
        const listening = presence.activities.find(a => a.type === 2);
        const watching = presence.activities.find(a => a.type === 3);
        const competing = presence.activities.find(a => a.type === 5);

        // Fallback priority order for what to display
        if (custom && custom.state) {
            activityText = custom.state;
        } else if (playing) {
            activityText = `Playing ${playing.name}`;
        } else if (listening) {
            activityText = `Listening to ${listening.details || listening.name}`;
        } else if (watching) {
            activityText = `Watching ${watching.name}`;
        } else if (streaming) {
            activityText = `Streaming ${streaming.name}`;
        } else if (competing) {
            activityText = `Competing in ${competing.name}`;
        }
    }

    // If an activity is found, display it. Otherwise, fallback to base status (e.g., "Online")
    statusText.textContent = activityText || baseStatusText;
}