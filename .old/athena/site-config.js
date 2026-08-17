// site-config.js
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

// Loading indicator functions
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

// NEW: Fetch System Config (v2)
async function fetchSystemConfig(apiBaseUrl, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const response = await fetch(`${apiBaseUrl}/api/v2/config`, {
            signal: controller.signal, headers: { 'Content-Type': 'application/json' }
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (attempt < API_CONFIG.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            return fetchSystemConfig(apiBaseUrl, attempt + 1);
        }
        throw error;
    }
}

// UPDATED: Fetch Portfolio (v2)
async function fetchPortfolio(apiBaseUrl, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const endpoint = `${apiBaseUrl}/api/v3/portfolio/${encodeURIComponent(API_CONFIG.profileId)}`;
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

/**
 * Safely sets the document background image with a subtle dark overlay if valid.
 */
function applyCustomBackground(url) {
    if (!url || typeof url !== 'string' || !url.trim()) return;

    const img = new Image();
    img.onload = () => {
        // Blends a 40% black overlay over the image
        document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.9)), url("${url}")`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
    };
    // On failure/broken URL, do nothing (preserves default background styling)
    img.onerror = () => {};
    img.src = url;
}

async function fetchConfig(attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        const { apiBaseUrl, primaryCdn } = await resolveNameserverRecord();

        const [productResult, systemConfig, portfolioData] = await Promise.all([
            fetchProduct(apiBaseUrl).catch(() => null),
            fetchSystemConfig(apiBaseUrl).catch(() => ({ useLanyard: false })), // graceful fallback
            fetchPortfolio(apiBaseUrl)
        ]);

        if (productResult) setFavicon(primaryCdn, productResult.user_upload_blob);

        clearTimeout(timeoutId);
        if (!validateConfig(portfolioData)) throw new Error('Invalid configuration format received from API');
        
        // Attach system config to portfolio payload to pass down to rendering
        portfolioData._sys = systemConfig;
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

// Render functions
function renderHeader(header, sysConfig, discordId) {
    let statusHTML = '';
    
    // Conditionally inject status HTML if Lanyard is enabled and Discord ID exists
    if (sysConfig?.useLanyard && discordId) {
        statusHTML = `
        <div class="discord-status-container" id="discord-status-container">
            <div class="status-dot offline" id="status-dot"></div>
            <span id="discord-username" class="discord-username">Loading user...</span>
            <span class="status-divider"></span>
            <span id="status-text" class="discord-activity">Loading status...</span>
        </div>`;
    }

    return `
    <header>
      <h1>${escapeHtml(header.name)}</h1>
      <p>${escapeHtml(header.tagline)}</p>
      ${statusHTML}
    </header>
  `;
}

function renderSection(section) {
    return `
    <fieldset>
      <legend>${escapeHtml(section.legend)}</legend>
      ${renderSectionContent(section.content)}
    </fieldset>
  `;
}

function renderSectionContent(content) {
    switch (content.type) {
        case 'text': return `<p>${escapeHtml(content.text)}</p>`;
        case 'list': return `<ul>${content.items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n')}</ul>`;
        case 'projects': return content.projects.map(project => `
        <div class="project">
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.description)}${project.url ? ` <a href="${escapeHtml(project.url)}">View Project</a>` : ''}</p>
          ${project.tags ? `<p class="tags">${project.tags.map(tag => `<code>${escapeHtml(tag)}</code>`).join(' ')}</p>` : ''}
        </div>`).join('\n');
        case 'links': return `<p class="links">${content.links.map(link => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.text)}</a>`).join(' | ')}</p>`;
        case 'html': return content.html;
        default: return '';
    }
}

function renderFooter(footer) {
    return `<footer><p>${escapeHtml(footer.text)}</p></footer>`;
}

function renderSite(config) {
    const body = document.body;
    const loader = document.getElementById('loading-indicator');
    body.innerHTML = '';
    if (loader) body.appendChild(loader);

    const discordId = config.config?.discordId;
    
    // Apply background image if present and valid in custom_data
    if (config.custom_data?.bg_img_url) {
        applyCustomBackground(config.custom_data.bg_img_url);
    }

    body.innerHTML += renderHeader(config.header, config._sys, discordId);
    body.innerHTML += `<main>${config.sections.map(section => renderSection(section)).join('\n')}</main>`;
    body.innerHTML += renderFooter(config.footer);

    // Initialize Lanyard if eligible
    if (config._sys?.useLanyard && discordId) {
        initLanyard(discordId, config._sys.lanyardWsEndpoint);
    }
}

function escapeHtml(text) {
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