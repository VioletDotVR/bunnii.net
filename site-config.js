import { initLanyard } from './status.js';

// API Configuration
const API_CONFIG = {
    nsHost: 'https://ns.bunnii.net',
    profileId: 'amebunnii',
    productId: 'product_5cafa9c5-b53b-439a-8639-79ed8766f5d2',
    timeout: 5000,
    retryAttempts: 2
};

// Fallback configuration
const FALLBACK_CONFIG = {
    header: { name: "miaadev", tagline: "Software Developer" },
    sections: [{ legend: "About", content: { type: 'text', text: "Loading failed. Please try again later." } }],
    footer: { text: `© ${new Date().getFullYear()} miaadev.` }
};

function showLoading() {
    const loader = document.createElement('div');
    loader.id = 'loading-indicator';
    loader.innerHTML = `
        <div class="spinner"></div>
        <p>Loading site data...</p>
    `;
    document.body.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 300);
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <h2>⚠️ Error Loading Site</h2>
        <p>${escapeHtml(message)}</p>
        <p>Using fallback configuration...</p>
    `;
    document.body.insertBefore(errorDiv, document.body.firstChild);
    setTimeout(() => {
        errorDiv.classList.add('fade-out');
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

async function resolveNameserverRecord() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const response = await fetch(API_CONFIG.nsHost, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Nameserver error! status: ${response.status}`);
        const data = await response.json();
        return { apiBaseUrl: data.API.replace(/\/$/, ''), primaryCdn: data.PrimaryCDN.replace(/\/$/, '') };
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// UPDATED: Fetch Product (v1) - Now includes Lanyard Config fields
async function fetchProduct(apiBaseUrl, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const response = await fetch(`${apiBaseUrl}/api/v1/product/${encodeURIComponent(API_CONFIG.productId)}/payload`, {
            signal: controller.signal, headers: { 'Content-Type': 'application/json' }
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (attempt < API_CONFIG.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            return fetchProduct(apiBaseUrl, attempt + 1);
        }
        throw error;
    }
}

// Fetch Portfolio (v3)
async function fetchPortfolio(apiBaseUrl, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const endpoint = `${apiBaseUrl}/api/v4/portfolio/${encodeURIComponent(API_CONFIG.profileId)}`;
        const response = await fetch(endpoint, {
            signal: controller.signal, headers: { 'Content-Type': 'application/json' }
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (attempt < API_CONFIG.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            return fetchPortfolio(apiBaseUrl, attempt + 1);
        }
        throw error;
    }
}

function setFavicon(primaryCdn, userUploadBlob) {
    if (!userUploadBlob) return;
    const href = `${primaryCdn}/useruploads/${userUploadBlob}`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = href;
}

function applyCustomBackground(url) {
    if (!url || typeof url !== 'string' || !url.trim()) return;

    const img = new Image();
    img.onload = () => {
        document.body.style.backgroundImage = `linear-gradient(rgba(18, 18, 24, 0.75), rgba(18, 18, 24, 0.92)), url("${url}")`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
    };
    img.src = url;
}

async function fetchConfig(attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const { apiBaseUrl, primaryCdn } = await resolveNameserverRecord();

        const [productResult, portfolioData] = await Promise.all([
            fetchProduct(apiBaseUrl).catch(() => null),
            fetchPortfolio(apiBaseUrl)
        ]);

        if (productResult?.user_upload_blob) {
            setFavicon(primaryCdn, productResult.user_upload_blob);
        }

        clearTimeout(timeoutId);
        if (!validateConfig(portfolioData)) throw new Error('Invalid configuration format received from API');
        
        // Attach product-level Lanyard config to portfolio payload
        portfolioData._product = productResult || {};
        return portfolioData;
    } catch (error) {
        clearTimeout(timeoutId);
        if (attempt < API_CONFIG.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            return fetchConfig(attempt + 1);
        }
        showError(error instanceof Error ? error.message : 'Unknown error');
        return FALLBACK_CONFIG;
    }
}

function validateConfig(data) {
    return (data && typeof data === 'object' && data.header && typeof data.header.name === 'string' &&
        typeof data.header.tagline === 'string' && Array.isArray(data.sections) &&
        data.footer && typeof data.footer.text === 'string');
}

// Render Functions based on sketch layout
function renderHeader(header, config, lanyardConfig) {
    // Prioritize the owner profile avatar, then fall back to previous logic
    const profilePicUrl = config.avatar_url || config.profile_picture_url || config.avatar_url || 'https://via.placeholder.com/120';
    
    // Use the owner name, fallback to the standard header name
    const displayName = config.first_name || header.name;

    let statusHTML = '';
    if (lanyardConfig?.useLanyard && lanyardConfig?.discord_id) {
        statusHTML = `
        <div class="discord-status-container" id="discord-status-container">
            <div class="status-dot offline" id="status-dot"></div>
            <span id="discord-username" class="discord-username">Loading user...</span>
            <span class="status-divider">•</span>
            <span id="status-text" class="discord-activity">Offline</span>
        </div>`;
    }

    // Build the badges dynamically based on what is available in owner_profile
    let badgesHTML = '';
    if (config.pronouns) {
        badgesHTML += `<span class="badge">${escapeHtml(config.pronouns)}</span>`;
    }
    if (config.age) {
        badgesHTML += `<span class="badge">${escapeHtml(String(config.age))} yrs</span>`;
    }
    if (typeof config.relationship === 'boolean') {
        const relText = config.relationship ? 'Taken 💖' : 'Single 💔';
        badgesHTML += `<span class="badge badge-pink">${relText}</span>`;
    }

    return `
    <header class="header-card">
      <div class="profile-header-top">
        <img src="${escapeHtml(profilePicUrl)}" alt="${escapeHtml(displayName)}" class="profile-avatar" />
        <div class="profile-header-info">
          <h1>
            ${escapeHtml(displayName)} 
            ${config.username ? `<span class="owner-username">@${escapeHtml(config.username)}</span>` : ''}
          </h1>
          ${badgesHTML ? `<div class="profile-badges">${badgesHTML}</div>` : ''}
          <p class="tagline">${escapeHtml(header.tagline)}</p>
          ${statusHTML}
        </div>
      </div>
    </header>
  `;
}

function renderSection(section, index) {
    // Add grid classification based on position to mirror layout sketch
    const gridClass = index < 2 ? 'grid-item-half' : 'grid-item-full';

    return `
    <fieldset class="${gridClass}">
      <legend>${escapeHtml(section.legend)}</legend>
      <div class="section-body">
        ${renderSectionContent(section.content)}
      </div>
    </fieldset>
  `;
}

function renderSectionContent(content) {
    switch (content.type) {
        case 'text': 
            return `<p>${escapeHtml(content.text)}</p>`;
        case 'list': 
            return `<ul>${content.items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n')}</ul>`;
        case 'projects': 
            return content.projects.map(project => `
            <div class="project">
              <h3>${escapeHtml(project.title)}</h3>
              <p>${escapeHtml(project.description)}${project.url ? ` <a href="${escapeHtml(project.url)}" target="_blank" rel="noopener">View Project &rarr;</a>` : ''}</p>
              ${project.tags ? `<div class="tags">${project.tags.map(tag => `<code>${escapeHtml(tag)}</code>`).join('')}</div>` : ''}
            </div>`).join('\n');
        case 'links': 
            return `<div class="links">${content.links.map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.text)}</a>`).join('<span class="link-separator">•</span>')}</div>`;
        case 'html': 
            return content.html;
        default: 
            return '';
    }
}

function renderFooter(footer) {
    return `<footer><p>${escapeHtml(footer.text)}</p></footer>`;
}

function renderSite(config) {
    const container = document.getElementById('app') || document.body;
    container.innerHTML = '';

    // Check background image in custom_data
    if (config.config.bg_url) {
        applyCustomBackground(config.config.bg_url);
    }

    // Extract Lanyard details from Product API using the new keys
    const lanyardConfig = {
        // Map the new lanyardEnabled key
        useLanyard: config._product?.lanyardEnabled ?? false, 
        // Use the endpoint from the product API, or fallback to the default
        lanyardWsEndpoint: config._product?.lanyardWsEndpoint || 'wss://api.lanyard.rest/socket',
        // Still look for discordId in product or portfolio config
        discordId: config._product?.discordId ?? config._product?.discord_id ?? config.config?.discord_id
    };

    let html = renderHeader(config.header, config.config, lanyardConfig);
    
    // Grid layout wrapper for middle and bottom sections
    html += `<main class="sections-grid">`;
    html += config.sections.map((section, idx) => renderSection(section, idx)).join('\n');
    html += `</main>`;

    html += renderFooter(config.footer);
    container.innerHTML = html;

    // Initialize Lanyard WebSocket
    if (lanyardConfig.useLanyard && lanyardConfig.discordId) {
        initLanyard(lanyardConfig.discordId, lanyardConfig.lanyardWsEndpoint);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function initSite() {
    showLoading();
    try {
        const config = await fetchConfig();
        renderSite(config);
    } catch (error) {
        console.error('Fatal error:', error);
        renderSite(FALLBACK_CONFIG);
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', initSite);
export { fetchConfig, renderSite };
