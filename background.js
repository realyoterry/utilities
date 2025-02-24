class SecurityViolationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SecurityViolationError';
        this.errorMsg = message;
    }
}

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_HASH = 'SHA-512';
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 64;
const IV_LENGTH = 16;

async function deriveBits(password, salt, length) {
    return new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
        await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']),
        length
    ));
}

async function deriveKeys(password, salt) {
    let keyBytes = await deriveBits(password, salt, 512);
    return {
        encryptionKey: await crypto.subtle.importKey('raw', keyBytes.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
        hmacKey: await crypto.subtle.importKey('raw', keyBytes.slice(32, 64), { name: 'HMAC', hash: PBKDF2_HASH }, false, ['sign', 'verify'])
    };
}

async function hashMasterPassword(password, salt) {
    return toBase64(await deriveBits(password, salt, AES_KEY_LENGTH));
}

function toBase64(arrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

function fromBase64(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function encodeKey(url, account) {
    return btoa(`${url}::${account}`);
}

async function encrypt(text, password) {
    let iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    let salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    let { encryptionKey, hmacKey } = await deriveKeys(password, salt);
    let enc = new TextEncoder().encode(text);
    let encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, enc);
    let hmac = await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array([...iv, ...new Uint8Array(encrypted)]));
    return { encrypted: toBase64(encrypted), iv: toBase64(iv), salt: toBase64(salt), hmac: toBase64(hmac) };
}

async function decrypt(encrypted, iv, salt, hmac, password) {
    let { encryptionKey, hmacKey } = await deriveKeys(password, fromBase64(salt));
    let dataToVerify = new Uint8Array([...fromBase64(iv), ...fromBase64(encrypted)]);
    if (!await crypto.subtle.verify('HMAC', hmacKey, fromBase64(hmac), dataToVerify)) {
        throw new SecurityViolationError('Incorrect master password or tampered data.');
    }
    let decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, encryptionKey, fromBase64(encrypted));
    return new TextDecoder().decode(decrypted);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        if (tab.url.toLowerCase().includes('youtube.com')) {
            chrome.tabs.sendMessage(tabId, { action: "tabUpdated", url: tab.url }, (response) => {
                if (!response.success) return console.error('Unsuccessfull.');
            });
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            let storedData = await chrome.storage.local.get(null);
            if (request.action === 'masterPassword') {
                let salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
                await chrome.storage.local.set({ masterPassword: await hashMasterPassword(request.masterPassword, salt), salt: toBase64(salt) });
                sendResponse({ success: true });
            }
            else if (request.action === 'store') {
                if (!storedData.masterPassword) throw new SecurityViolationError('No master password set.');
                if (await hashMasterPassword(request.masterPassword, fromBase64(storedData.salt)) !== storedData.masterPassword) throw new SecurityViolationError('Incorrect password.');
                await chrome.storage.local.set({ [encodeKey(request.url, request.account)]: await encrypt(request.password, request.masterPassword) });
                sendResponse({ success: true });
            }
            else if (request.action === 'retrieve') {
                let key = encodeKey(request.url, request.account);
                if (!storedData[key]) throw new SecurityViolationError('No data found.');
                sendResponse({ success: true, password: await decrypt(storedData[key].encrypted, storedData[key].iv, storedData[key].salt, storedData[key].hmac, request.masterPassword) });
                return;
            }
            else if (request.action === 'getAllAccounts') {
                sendResponse({
                    success: true, accounts: Object.keys(storedData).filter(k => k !== 'masterPassword' && k !== 'salt').map(k => {
                        let [url, account] = atob(k).split('::');
                        return { url, account };
                    })
                });
                return;
            }
            else if (request.action === 'delete') {
                await chrome.storage.local.remove(encodeKey(request.url, request.account));
                sendResponse({ success: true });
            }
            else if (request.action === 'deleteAll') {
                await chrome.storage.local.clear();
                sendResponse({ success: true });
            }
            else if (request.action === 'capture' && request.tabId) {
                chrome.debugger.attach({ tabId: request.tabId }, "1.3", () => {
                    chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {}, (result) => {
                        if (chrome.runtime.lastError) {
                            console.error("Debugger error:", chrome.runtime.lastError.message);
                            return;
                        }
                        if (result && result.data) {
                            const dataUrl = "data:image/png;base64," + result.data;

                            chrome.downloads.download({
                                url: dataUrl,
                                filename: "screenshot.png",
                                saveAs: true,
                            });
                        }
                        chrome.debugger.detach({ tabId });
                    });
                });

                sendResponse({ success: true });
                return true;
            } else if (request.action === 'captureDiv') {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length === 0) return;
                    const tabId = tabs[0].id;

                    chrome.scripting.executeScript({
                        target: { tabId },
                        files: ["libs/html2canvas.min.js"]
                    }, () => {
                        chrome.scripting.executeScript({
                            target: { tabId },
                            func: () => {
                                const targetDiv = document.getElementsByClassName('screenshot-div-12345')[0];

                                targetDiv.classList.remove('screenshot-div-12345');

                                html2canvas(targetDiv, {
                                    useCORS: true,
                                    windowWidth: document.documentElement.scrollWidth,
                                    windowHeight: document.documentElement.scrollHeight,
                                }).then(canvas => {
                                    let link = document.createElement("a");
                                    link.href = canvas.toDataURL("image/png");
                                    link.download = "captured-div.png";
                                    link.click();
                                });
                            },
                        });
                    });
                });

                sendResponse({ success: true });
                return true;
            }
        } catch (error) {
            sendResponse({ success: false, error: error?.errorMsg || error?.message || 'An unexpected error occurred.' });
        }
    })();
    return true;
});
