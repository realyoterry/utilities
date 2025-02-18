chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message.action === "tabUpdated") {
            processPage();
            sendResponse({ success: true });
        }
    })();
    return true;
});

document.addEventListener('yt-navigate-finish', () => {
    processPage();
});

function processPage() {
    if (location.pathname.startsWith('/watch')) {
        new MutationObserver((_, observer) => {
            const button = document.querySelector('.yt-spec-touch-feedback-shape__fill');
            if (button) {
                observer.disconnect();
                const videoId = new URLSearchParams(location.search).get('v');
                if (!videoId) return;

                fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`)
                    .then(res => res.json())
                    .then((data) => {
                        const parent = document.querySelector('.yt-spec-button-shape-next--segmented-end');
                        if (!parent) return;
                        parent.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--segmented-end';
                        let text = parent.querySelector('.dislike-count') || document.createElement('div');
                        text.className = 'dislike-count yt-spec-button-shape-next__button-text-content';
                        text.textContent = formatNumber(data.dislikes);
                        parent.appendChild(text);
                    })
                    .catch(console.error);
            }
        }).observe(document.body, { childList: true, subtree: true });
    }
}

function formatNumber(num) {
    let values = [1e12, 1e9, 1e6, 1e3];

    for (let i = 0; i < values.length; i++) {
        if (num >= values[i]) return (num / values[i]).toFixed(1).replace(/\.0$/, '') + ['T', 'B', 'M', 'K'][i];
    }

    return num.toString();
}
